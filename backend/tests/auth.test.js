import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import request from 'supertest';
import { buildTestApp, seedFixtures } from './helpers/testApp.js';

describe('Auth', () => {
  let app;
  let prisma;

  beforeEach(async () => {
    jest.resetModules();
    ({ app, prisma } = await buildTestApp());
    await seedFixtures(prisma);
  });

  it('logs in with valid credentials', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'admin@test.local', password: 'Test1234!' });

    expect(res.status).toBe(200);
    expect(res.body.data.accessToken).toBeDefined();
    expect(res.body.data.refreshToken).toBeDefined();
    expect(res.body.data.admin.email).toBe('admin@test.local');
    expect(res.body.data.admin.passwordHash).toBeUndefined();
  });

  it('rejects invalid password with AUTH_INVALID', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'admin@test.local', password: 'wrong' });

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('AUTH_INVALID');
  });

  it('rejects unknown email with AUTH_INVALID', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'nope@test.local', password: 'Test1234!' });

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('AUTH_INVALID');
  });

  it('validates malformed login body', async () => {
    const res = await request(app).post('/api/v1/auth/login').send({ email: 'not-an-email' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION');
  });

  it('rotates the refresh token and revokes the old one', async () => {
    const login = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'admin@test.local', password: 'Test1234!' });
    const oldRefresh = login.body.data.refreshToken;

    const refreshed = await request(app)
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: oldRefresh });

    expect(refreshed.status).toBe(200);
    expect(refreshed.body.data.accessToken).toBeDefined();
    expect(refreshed.body.data.refreshToken).toBeDefined();
    expect(refreshed.body.data.refreshToken).not.toBe(oldRefresh);

    // Re-using the old (now revoked) token must fail.
    const reuse = await request(app)
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: oldRefresh });
    expect(reuse.status).toBe(401);
    expect(reuse.body.error.code).toBe('AUTH_INVALID');
  });

  it('returns current admin from /me with a valid token', async () => {
    const login = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'admin@test.local', password: 'Test1234!' });
    const token = login.body.data.accessToken;

    const me = await request(app).get('/api/v1/auth/me').set('Authorization', `Bearer ${token}`);
    expect(me.status).toBe(200);
    expect(me.body.data.admin.email).toBe('admin@test.local');
  });

  it('rejects /me without a token', async () => {
    const me = await request(app).get('/api/v1/auth/me');
    expect(me.status).toBe(401);
    expect(me.body.error.code).toBe('AUTH_INVALID');
  });

  it('logout revokes the refresh token', async () => {
    const login = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'admin@test.local', password: 'Test1234!' });
    const refreshToken = login.body.data.refreshToken;

    const out = await request(app).post('/api/v1/auth/logout').send({ refreshToken });
    expect(out.status).toBe(200);

    const reuse = await request(app).post('/api/v1/auth/refresh').send({ refreshToken });
    expect(reuse.status).toBe(401);
  });
});
