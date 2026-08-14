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
    expect(payload).toHaveProperty('defaultAudioId', null);
    expect(payload).toHaveProperty('audios', []);
    expect(payload).toHaveProperty('announcements', []);
    expect(payload.prayers[0]).toHaveProperty('audioId', null);
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

  // Seed a library audio row directly (bypasses file upload for unit focus).
  async function seedAudio(prismaClient, { version, kind = 'AZAN', label = null } = {}) {
    return prismaClient.azanAudio.create({
      data: {
        label,
        kind,
        filename: `azan-${version}.mp3`,
        storedName: `stored-${version}.mp3`,
        mimeType: 'audio/mpeg',
        sizeBytes: 1000 + version,
        checksumSha256: `checksum-${version}`,
        version,
        isActive: false,
      },
    });
  }

  it('publish reflects default + per-prayer audio and dedupes audios[]', async () => {
    const a1 = await seedAudio(prisma, { version: 1, label: 'Default Azan' });
    const a2 = await seedAudio(prisma, { version: 2, label: 'Makkah Azan' });

    // Set the schedule default.
    const meta = await request(app)
      .put('/api/v1/schedule')
      .set('Authorization', `Bearer ${token}`)
      .send({ timezone: 'Asia/Dhaka', defaultAudioId: a1.id });
    expect(meta.status).toBe(200);
    expect(meta.body.data.defaultAudioId).toBe(a1.id);

    // Assign a2 to FAJR and MAGHRIB (a2 referenced twice → must dedupe).
    for (const prayer of ['FAJR', 'MAGHRIB']) {
      const r = await request(app)
        .put(`/api/v1/schedule/prayers/${prayer}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ audioId: a2.id });
      expect(r.status).toBe(200);
      expect(r.body.data.audioId).toBe(a2.id);
    }

    const pub = await request(app)
      .post('/api/v1/schedule/publish')
      .set('Authorization', `Bearer ${token}`);
    expect(pub.status).toBe(201);

    const version = await prisma.scheduleVersion.findFirst({ orderBy: { version: 'desc' } });
    const payload = version.payload;
    expect(payload.defaultAudioId).toBe(a1.id);

    // audios[] contains a1 (default) + a2 (prayers), deduped → exactly 2.
    expect(payload.audios).toHaveLength(2);
    const ids = payload.audios.map((x) => x.id).sort();
    expect(ids).toEqual([a1.id, a2.id].sort());
    const refA2 = payload.audios.find((x) => x.id === a2.id);
    expect(refA2).toMatchObject({
      id: a2.id,
      label: 'Makkah Azan',
      version: 2,
      path: 'audio/2/file',
      checksumSha256: 'checksum-2',
      sizeBytes: 1002,
      mimeType: 'audio/mpeg',
    });

    // Per-prayer audioId reflected.
    const fajr = payload.prayers.find((p) => p.prayer === 'FAJR');
    const dhuhr = payload.prayers.find((p) => p.prayer === 'DHUHR');
    expect(fajr.audioId).toBe(a2.id);
    expect(dhuhr.audioId).toBeNull();
  });

  it('rejects setting a non-existent defaultAudioId (404)', async () => {
    const res = await request(app)
      .put('/api/v1/schedule')
      .set('Authorization', `Bearer ${token}`)
      .send({ timezone: 'Asia/Dhaka', defaultAudioId: '0123456789abcdef01234567' });
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('clears a prayer audioId with null', async () => {
    const a1 = await seedAudio(prisma, { version: 1 });
    await request(app)
      .put('/api/v1/schedule/prayers/FAJR')
      .set('Authorization', `Bearer ${token}`)
      .send({ audioId: a1.id });
    const cleared = await request(app)
      .put('/api/v1/schedule/prayers/FAJR')
      .set('Authorization', `Bearer ${token}`)
      .send({ audioId: null });
    expect(cleared.status).toBe(200);
    expect(cleared.body.data.audioId).toBeNull();
  });
});
