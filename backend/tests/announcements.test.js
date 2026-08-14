import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import request from 'supertest';
import { buildTestApp, seedFixtures, loginAndGetToken } from './helpers/testApp.js';

// A minimal valid MP3-ish payload for multipart upload (mime is set by supertest).
function fakeMp3(marker = 'x') {
  return Buffer.from(`ID3-fake-mp3-${marker}`);
}

// Seed a library audio row directly.
async function seedAudio(prisma, { version, kind = 'ANNOUNCEMENT', label = null } = {}) {
  return prisma.azanAudio.create({
    data: {
      label,
      kind,
      filename: `audio-${version}.mp3`,
      storedName: `stored-${version}.mp3`,
      mimeType: 'audio/mpeg',
      sizeBytes: 2000 + version,
      checksumSha256: `checksum-${version}`,
      version,
      isActive: false,
    },
  });
}

const FUTURE = () => new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString();
const PAST = () => new Date(Date.now() - 24 * 3600 * 1000).toISOString();

describe('Announcements', () => {
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

  it('requires admin auth', async () => {
    const res = await request(app).get('/api/v1/announcements');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('AUTH_INVALID');
  });

  it('create (with existing audioId) auto-publishes and appears in payload announcements[]', async () => {
    const audio = await seedAudio(prisma, { version: 7, label: 'Eid notice' });
    const scheduledAt = FUTURE();

    const res = await request(app)
      .post('/api/v1/announcements')
      .set('Authorization', `Bearer ${token}`)
      .field('audioId', audio.id)
      .field('label', "Eid Jama'at notice")
      .field('scheduledAt', scheduledAt);

    expect(res.status).toBe(201);
    expect(res.body.data.audioId).toBe(audio.id);
    expect(res.body.data.audio.path).toBe('audio/7/file');
    expect(res.body.data.publish.version).toBe(1);

    // Auto-published a new version + FCM fired.
    expect(fcm.sendScheduleUpdated).toHaveBeenCalledWith(1);
    const schedule = await prisma.prayerSchedule.findFirst();
    expect(schedule.currentVersion).toBe(1);

    const version = await prisma.scheduleVersion.findFirst({ orderBy: { version: 'desc' } });
    expect(version.payload.announcements).toHaveLength(1);
    const ann = version.payload.announcements[0];
    expect(ann.label).toBe("Eid Jama'at notice");
    expect(ann.scheduledAt).toBe(new Date(scheduledAt).toISOString());
    expect(ann.enabled).toBe(true);
    expect(ann.audio).toMatchObject({
      id: audio.id,
      label: 'Eid notice',
      version: 7,
      path: 'audio/7/file',
      checksumSha256: 'checksum-7',
      mimeType: 'audio/mpeg',
    });
  });

  it('create with an uploaded file creates an ANNOUNCEMENT audio', async () => {
    const res = await request(app)
      .post('/api/v1/announcements')
      .set('Authorization', `Bearer ${token}`)
      .field('label', 'Recorded notice')
      .field('scheduledAt', FUTURE())
      .attach('audio', fakeMp3('rec'), { filename: 'notice.mp3', contentType: 'audio/mpeg' });

    expect(res.status).toBe(201);
    expect(typeof res.body.data.audioId).toBe('string');

    const audios = await prisma.azanAudio.findMany({ where: { kind: 'ANNOUNCEMENT' } });
    expect(audios).toHaveLength(1);
    expect(audios[0].version).toBe(1);
  });

  it('rejects create with neither file nor audioId', async () => {
    const res = await request(app)
      .post('/api/v1/announcements')
      .set('Authorization', `Bearer ${token}`)
      .field('scheduledAt', FUTURE());
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION');
  });

  it('rejects create with a bad scheduledAt', async () => {
    const audio = await seedAudio(prisma, { version: 3 });
    const res = await request(app)
      .post('/api/v1/announcements')
      .set('Authorization', `Bearer ${token}`)
      .field('audioId', audio.id)
      .field('scheduledAt', 'not-a-date');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION');
  });

  it('rejects create referencing a non-existent audioId', async () => {
    const res = await request(app)
      .post('/api/v1/announcements')
      .set('Authorization', `Bearer ${token}`)
      .field('audioId', '0123456789abcdef01234567')
      .field('scheduledAt', FUTURE());
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('excludes a past-dated announcement from the payload', async () => {
    const audio = await seedAudio(prisma, { version: 4 });
    const res = await request(app)
      .post('/api/v1/announcements')
      .set('Authorization', `Bearer ${token}`)
      .field('audioId', audio.id)
      .field('scheduledAt', PAST());
    expect(res.status).toBe(201);

    const version = await prisma.scheduleVersion.findFirst({ orderBy: { version: 'desc' } });
    expect(version.payload.announcements).toHaveLength(0);
  });

  it('excludes a disabled announcement from the payload', async () => {
    const audio = await seedAudio(prisma, { version: 5 });
    const res = await request(app)
      .post('/api/v1/announcements')
      .set('Authorization', `Bearer ${token}`)
      .field('audioId', audio.id)
      .field('scheduledAt', FUTURE())
      .field('enabled', 'false');
    expect(res.status).toBe(201);

    const version = await prisma.scheduleVersion.findFirst({ orderBy: { version: 'desc' } });
    expect(version.payload.announcements).toHaveLength(0);
  });

  it('lists announcements newest scheduledAt first with resolved audio', async () => {
    const audio = await seedAudio(prisma, { version: 6, label: 'Notice' });
    const soon = new Date(Date.now() + 1 * 24 * 3600 * 1000).toISOString();
    const later = new Date(Date.now() + 10 * 24 * 3600 * 1000).toISOString();

    for (const at of [soon, later]) {
      await request(app)
        .post('/api/v1/announcements')
        .set('Authorization', `Bearer ${token}`)
        .field('audioId', audio.id)
        .field('scheduledAt', at);
    }

    const res = await request(app)
      .get('/api/v1/announcements')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.announcements).toHaveLength(2);
    // Newest scheduledAt first.
    expect(res.body.data.announcements[0].scheduledAt).toBe(new Date(later).toISOString());
    expect(res.body.data.announcements[0].audio.path).toBe('audio/6/file');
  });

  it('update re-publishes and can disable an announcement', async () => {
    const audio = await seedAudio(prisma, { version: 8 });
    const created = await request(app)
      .post('/api/v1/announcements')
      .set('Authorization', `Bearer ${token}`)
      .field('audioId', audio.id)
      .field('scheduledAt', FUTURE());
    const id = created.body.data.id;
    expect(created.body.data.publish.version).toBe(1);

    const updated = await request(app)
      .put(`/api/v1/announcements/${id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ enabled: false });
    expect(updated.status).toBe(200);
    expect(updated.body.data.enabled).toBe(false);
    expect(updated.body.data.publish.version).toBe(2);
    expect(fcm.sendScheduleUpdated).toHaveBeenLastCalledWith(2);

    const version = await prisma.scheduleVersion.findFirst({ orderBy: { version: 'desc' } });
    expect(version.payload.announcements).toHaveLength(0);
  });

  it('delete re-publishes and removes the announcement from the payload', async () => {
    const audio = await seedAudio(prisma, { version: 9 });
    const created = await request(app)
      .post('/api/v1/announcements')
      .set('Authorization', `Bearer ${token}`)
      .field('audioId', audio.id)
      .field('scheduledAt', FUTURE());
    const id = created.body.data.id;

    // Present after create.
    let version = await prisma.scheduleVersion.findFirst({ orderBy: { version: 'desc' } });
    expect(version.payload.announcements).toHaveLength(1);

    const del = await request(app)
      .delete(`/api/v1/announcements/${id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(del.status).toBe(200);
    expect(del.body.data.deleted).toBe(true);
    expect(del.body.data.publish.version).toBe(2);
    expect(fcm.sendScheduleUpdated).toHaveBeenLastCalledWith(2);

    // Gone from the newest payload.
    version = await prisma.scheduleVersion.findFirst({ orderBy: { version: 'desc' } });
    expect(version.payload.announcements).toHaveLength(0);

    const gone = await prisma.announcement.findUnique({ where: { id } });
    expect(gone).toBeNull();
  });

  it('returns 404 updating a missing announcement', async () => {
    const res = await request(app)
      .put('/api/v1/announcements/0123456789abcdef01234567')
      .set('Authorization', `Bearer ${token}`)
      .send({ enabled: false });
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });
});
