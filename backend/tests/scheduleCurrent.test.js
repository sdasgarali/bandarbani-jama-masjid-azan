import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import { buildTestApp, seedFixtures } from './helpers/testApp.js';

// Register a device and return its credentials.
async function registerDevice(app, deviceId = 'device-uuid-1') {
  const res = await request(app)
    .post('/api/v1/devices/register')
    .send({ deviceId, platform: 'android', appVersion: '1.0.0' });
  return { deviceId, deviceSecret: res.body.data.deviceSecret };
}

describe('Schedule (device / current)', () => {
  let app;
  let prisma;

  beforeEach(async () => {
    jest.resetModules();
    ({ app, prisma } = await buildTestApp());
  });

  it('404 when never published', async () => {
    await seedFixtures(prisma, { publish: false });
    const dev = await registerDevice(app);

    const res = await request(app)
      .get('/api/v1/schedule/current')
      .set('X-Device-Id', dev.deviceId)
      .set('X-Device-Secret', dev.deviceSecret);

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('returns the exact published payload shape with ETag', async () => {
    await seedFixtures(prisma, { publish: true });
    const dev = await registerDevice(app);

    const res = await request(app)
      .get('/api/v1/schedule/current')
      .set('X-Device-Id', dev.deviceId)
      .set('X-Device-Secret', dev.deviceSecret);

    expect(res.status).toBe(200);
    expect(res.headers.etag).toBe('"1"');

    const p = res.body.data;
    expect(Object.keys(p).sort()).toEqual(
      ['audio', 'prayers', 'publishedAt', 'timezone', 'version'].sort()
    );
    expect(p.version).toBe(1);
    expect(p.timezone).toBe('Asia/Dhaka');
    expect(p.prayers).toHaveLength(5);
    expect(p.prayers[0]).toEqual({
      prayer: 'FAJR',
      time: '04:18',
      enabled: true,
      audioEnabled: true,
      notificationEnabled: true,
    });
  });

  it('returns 304 when If-None-Match matches the version ETag', async () => {
    await seedFixtures(prisma, { publish: true });
    const dev = await registerDevice(app);

    const res = await request(app)
      .get('/api/v1/schedule/current')
      .set('X-Device-Id', dev.deviceId)
      .set('X-Device-Secret', dev.deviceSecret)
      .set('If-None-Match', '"1"');

    expect(res.status).toBe(304);
  });

  it('requires device auth', async () => {
    await seedFixtures(prisma, { publish: true });
    const res = await request(app).get('/api/v1/schedule/current');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('AUTH_INVALID');
  });

  it('rejects a bad device secret', async () => {
    await seedFixtures(prisma, { publish: true });
    const dev = await registerDevice(app);
    const res = await request(app)
      .get('/api/v1/schedule/current')
      .set('X-Device-Id', dev.deviceId)
      .set('X-Device-Secret', 'not-the-secret');
    expect(res.status).toBe(401);
  });

  it('bcrypt hash actually validates the returned secret', async () => {
    await seedFixtures(prisma);
    const dev = await registerDevice(app, 'device-uuid-2');
    const device = await prisma.device.findUnique({ where: { deviceId: 'device-uuid-2' } });
    const okSecret = await bcrypt.compare(dev.deviceSecret, device.deviceSecretHash);
    expect(okSecret).toBe(true);
  });
});
