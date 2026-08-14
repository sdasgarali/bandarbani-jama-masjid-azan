import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import request from 'supertest';
import { buildTestApp, seedFixtures, loginAndGetToken } from './helpers/testApp.js';

describe('Admin FCM + config', () => {
  let app;
  let prisma;
  let fcm;
  let token;

  beforeEach(async () => {
    jest.resetModules();
    ({ app, prisma, fcm } = await buildTestApp());
    await seedFixtures(prisma);
    token = await loginAndGetToken(request, app);
  });

  it('sends a test notification', async () => {
    const res = await request(app)
      .post('/api/v1/admin/test-notification')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Hi', body: 'Test body' });
    expect(res.status).toBe(200);
    expect(fcm.sendTestNotification).toHaveBeenCalledWith('Hi', 'Test body', undefined);
  });

  it('sends a test azan', async () => {
    const res = await request(app)
      .post('/api/v1/admin/test-azan')
      .set('Authorization', `Bearer ${token}`)
      .send({ deviceIds: ['dev-x'] });
    expect(res.status).toBe(200);
    expect(fcm.sendTestAzan).toHaveBeenCalledWith(['dev-x']);
  });

  it('upserts config and notifies devices', async () => {
    const res = await request(app)
      .post('/api/v1/admin/config')
      .set('Authorization', `Bearer ${token}`)
      .send({ key: 'welcome_message', value: { text: 'Assalamu Alaikum' } });
    expect(res.status).toBe(200);
    expect(res.body.data.key).toBe('welcome_message');
    expect(fcm.sendConfigUpdated).toHaveBeenCalled();

    const list = await request(app)
      .get('/api/v1/admin/config')
      .set('Authorization', `Bearer ${token}`);
    expect(list.body.data.config.find((c) => c.key === 'welcome_message')).toBeTruthy();
  });

  it('requires admin auth', async () => {
    const res = await request(app).post('/api/v1/admin/test-azan').send({});
    expect(res.status).toBe(401);
  });

  it('writes an audit log on mutations', async () => {
    await request(app)
      .post('/api/v1/admin/config')
      .set('Authorization', `Bearer ${token}`)
      .send({ key: 'k', value: 1 });
    const logs = await prisma.auditLog.findMany({ where: { action: 'CONFIG_UPSERT' } });
    expect(logs.length).toBeGreaterThanOrEqual(1);
  });
});
