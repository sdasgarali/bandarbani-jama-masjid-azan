import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import request from 'supertest';
import { buildTestApp, seedFixtures, loginAndGetToken } from './helpers/testApp.js';

describe('Schedule (admin)', () => {
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

  it('returns the current draft schedule with 5 prayers in order', async () => {
    const res = await request(app).get('/api/v1/schedule').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.timezone).toBe('Asia/Dhaka');
    expect(res.body.data.prayers).toHaveLength(5);
    expect(res.body.data.prayers.map((p) => p.prayer)).toEqual([
      'FAJR',
      'DHUHR',
      'ASR',
      'MAGHRIB',
      'ISHA',
    ]);
  });

  it('updates schedule meta', async () => {
    const res = await request(app)
      .put('/api/v1/schedule')
      .set('Authorization', `Bearer ${token}`)
      .send({ timezone: 'Asia/Kolkata', name: 'Renamed' });
    expect(res.status).toBe(200);
    expect(res.body.data.timezone).toBe('Asia/Kolkata');
    expect(res.body.data.name).toBe('Renamed');
  });

  it('updates a single prayer', async () => {
    const res = await request(app)
      .put('/api/v1/schedule/prayers/FAJR')
      .set('Authorization', `Bearer ${token}`)
      .send({ time: '04:30', audioEnabled: false });
    expect(res.status).toBe(200);
    expect(res.body.data.prayer).toBe('FAJR');
    expect(res.body.data.time).toBe('04:30');
    expect(res.body.data.audioEnabled).toBe(false);
  });

  it('rejects an invalid prayer time', async () => {
    const res = await request(app)
      .put('/api/v1/schedule/prayers/FAJR')
      .set('Authorization', `Bearer ${token}`)
      .send({ time: '25:99' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION');
  });

  it('rejects an unknown prayer enum', async () => {
    const res = await request(app)
      .put('/api/v1/schedule/prayers/BADPRAYER')
      .set('Authorization', `Bearer ${token}`)
      .send({ time: '04:30' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION');
  });

  it('requires auth for admin schedule routes', async () => {
    const res = await request(app).get('/api/v1/schedule');
    expect(res.status).toBe(401);
  });

  it('publishes: bumps version, snapshots payload, triggers FCM', async () => {
    const res = await request(app)
      .post('/api/v1/schedule/publish')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(201);
    expect(res.body.data.version).toBe(1);
    expect(fcm.sendScheduleUpdated).toHaveBeenCalledWith(1);

    // Schedule flagged published + version bumped.
    const schedule = await prisma.prayerSchedule.findFirst();
    expect(schedule.currentVersion).toBe(1);
    expect(schedule.isPublished).toBe(true);

    // A ScheduleVersion row exists with the correct payload shape.
    const version = await prisma.scheduleVersion.findFirst({ orderBy: { version: 'desc' } });
    expect(version.version).toBe(1);
    const payload = version.payload;
    expect(payload).toHaveProperty('version', 1);
    expect(payload).toHaveProperty('timezone', 'Asia/Dhaka');
    expect(payload.prayers).toHaveLength(5);
    expect(payload).toHaveProperty('audio');
    expect(payload).toHaveProperty('publishedAt');
  });

  it('publishing twice yields monotonically increasing versions', async () => {
    const first = await request(app)
      .post('/api/v1/schedule/publish')
      .set('Authorization', `Bearer ${token}`);
    const second = await request(app)
      .post('/api/v1/schedule/publish')
      .set('Authorization', `Bearer ${token}`);
    expect(first.body.data.version).toBe(1);
    expect(second.body.data.version).toBe(2);
    expect(fcm.sendScheduleUpdated).toHaveBeenLastCalledWith(2);
  });

  it('lists published versions', async () => {
    await request(app).post('/api/v1/schedule/publish').set('Authorization', `Bearer ${token}`);
    const res = await request(app)
      .get('/api/v1/schedule/versions')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.versions.length).toBeGreaterThanOrEqual(1);
  });
});
