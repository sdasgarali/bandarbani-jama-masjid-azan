import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import request from 'supertest';
import { buildTestApp, seedFixtures, loginAndGetToken } from './helpers/testApp.js';

describe('Devices', () => {
  let app;
  let prisma;
  let token;

  beforeEach(async () => {
    jest.resetModules();
    ({ app, prisma } = await buildTestApp());
    await seedFixtures(prisma, { publish: true });
    token = await loginAndGetToken(request, app);
  });

  it('registers a device and returns a device secret', async () => {
    const res = await request(app).post('/api/v1/devices/register').send({
      deviceId: 'dev-1',
      platform: 'android',
      appVersion: '1.2.3',
      androidVersion: 34,
      model: 'Pixel 8',
      timezone: 'Asia/Dhaka',
      fcmToken: 'fcm-token-1',
    });

    expect(res.status).toBe(201);
    expect(res.body.data.deviceId).toBe('dev-1');
    expect(typeof res.body.data.deviceSecret).toBe('string');
    expect(res.body.data.deviceSecret.length).toBeGreaterThan(20);

    const device = await prisma.device.findUnique({ where: { deviceId: 'dev-1' } });
    expect(device).toBeTruthy();
    const fcmRow = await prisma.fcmToken.findUnique({ where: { token: 'fcm-token-1' } });
    expect(fcmRow).toBeTruthy();
    expect(fcmRow.isActive).toBe(true);
  });

  it('validates the register body', async () => {
    const res = await request(app).post('/api/v1/devices/register').send({ platform: 'android' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION');
  });

  it('updates the FCM token with device auth', async () => {
    const reg = await request(app)
      .post('/api/v1/devices/register')
      .send({ deviceId: 'dev-2', fcmToken: 'old-token' });
    const secret = reg.body.data.deviceSecret;

    const res = await request(app)
      .put('/api/v1/devices/fcm-token')
      .set('X-Device-Id', 'dev-2')
      .set('X-Device-Secret', secret)
      .send({ fcmToken: 'new-token' });

    expect(res.status).toBe(200);
    const row = await prisma.fcmToken.findUnique({ where: { token: 'new-token' } });
    expect(row).toBeTruthy();
    expect(row.isActive).toBe(true);
  });

  it('rejects fcm-token update without device auth', async () => {
    const res = await request(app)
      .put('/api/v1/devices/fcm-token')
      .send({ fcmToken: 'x' });
    expect(res.status).toBe(401);
  });

  it('heartbeat returns currentVersion and updates activity', async () => {
    const reg = await request(app)
      .post('/api/v1/devices/register')
      .send({ deviceId: 'dev-3' });
    const secret = reg.body.data.deviceSecret;

    const res = await request(app)
      .post('/api/v1/devices/heartbeat')
      .set('X-Device-Id', 'dev-3')
      .set('X-Device-Secret', secret)
      .send({ timezone: 'Asia/Dhaka', appVersion: '2.0.0', scheduleVersion: 1 });

    expect(res.status).toBe(200);
    expect(res.body.data.currentVersion).toBe(1);

    const device = await prisma.device.findUnique({ where: { deviceId: 'dev-3' } });
    expect(device.lastSyncAt).toBeTruthy();
    expect(device.appVersion).toBe('2.0.0');
  });

  it('lists devices for an admin with derived status', async () => {
    await request(app).post('/api/v1/devices/register').send({ deviceId: 'dev-4' });

    const res = await request(app).get('/api/v1/devices').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data.devices)).toBe(true);
    const dev4 = res.body.data.devices.find((d) => d.deviceId === 'dev-4');
    expect(dev4.status).toBe('ACTIVE');
  });

  it('requires admin auth to list devices', async () => {
    const res = await request(app).get('/api/v1/devices');
    expect(res.status).toBe(401);
  });
});
