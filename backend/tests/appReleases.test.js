import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import request from 'supertest';
import { buildTestApp, seedFixtures, loginAndGetToken } from './helpers/testApp.js';

// A minimal valid "APK": a ZIP archive starts with the "PK" (0x50 0x4B) magic bytes.
function fakeApkBuffer(marker = 'x') {
  return Buffer.concat([Buffer.from('PK'), Buffer.from(`fake-apk-${marker}`)]);
}

describe('App releases / auto-update', () => {
  let app;
  let prisma;
  let fcm;
  let token;

  beforeEach(async () => {
    jest.resetModules();
    ({ app, prisma, fcm } = await buildTestApp());
    await seedFixtures(prisma, { publish: true });
    token = await loginAndGetToken(request, app);
  });

  it('GET /app/latest-version returns 404 when there are no releases', async () => {
    const res = await request(app).get('/api/v1/app/latest-version');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('admin upload creates a release, broadcasts APP_UPDATE_AVAILABLE, and bumps latest', async () => {
    const res = await request(app)
      .post('/api/v1/app/releases')
      .set('Authorization', `Bearer ${token}`)
      .field('versionCode', '2')
      .field('versionName', '1.0.1')
      .field('notes', 'Bug fixes')
      .field('mandatory', 'true')
      .attach('apk', fakeApkBuffer('v2'), 'app-release.apk');

    expect(res.status).toBe(201);
    expect(res.body.data.versionCode).toBe(2);
    expect(res.body.data.versionName).toBe('1.0.1');
    expect(res.body.data.mandatory).toBe(true);
    expect(res.body.data.notes).toBe('Bug fixes');
    expect(res.body.data.apkPath).toBe('app/releases/2/file');
    expect(typeof res.body.data.checksumSha256).toBe('string');
    expect(res.body.data.checksumSha256).toHaveLength(64);
    // Internal storage path must not leak.
    expect(res.body.data.apkStoredName).toBeUndefined();

    // Broadcast fired with the new versionCode.
    expect(fcm.sendAppUpdateAvailable).toHaveBeenCalledWith(2);

    // Audit written.
    const audits = await prisma.auditLog.findMany({ where: { action: 'app_release.upload' } });
    expect(audits).toHaveLength(1);

    // latest-version now reflects it.
    const latest = await request(app).get('/api/v1/app/latest-version');
    expect(latest.status).toBe(200);
    expect(latest.body.data.versionCode).toBe(2);
  });

  it('latest-version returns the highest versionCode with an ETag and supports 304', async () => {
    for (const [vc, vn] of [
      ['1', '1.0.0'],
      ['3', '1.0.2'],
      ['2', '1.0.1'],
    ]) {
      const up = await request(app)
        .post('/api/v1/app/releases')
        .set('Authorization', `Bearer ${token}`)
        .field('versionCode', vc)
        .field('versionName', vn)
        .attach('apk', fakeApkBuffer(vc), `app-${vc}.apk`);
      expect(up.status).toBe(201);
    }

    const res = await request(app).get('/api/v1/app/latest-version');
    expect(res.status).toBe(200);
    expect(res.body.data.versionCode).toBe(3);
    expect(res.headers.etag).toBe('"3"');
    expect(res.body.data.mandatory).toBe(false);

    const notModified = await request(app)
      .get('/api/v1/app/latest-version')
      .set('If-None-Match', '"3"');
    expect(notModified.status).toBe(304);
  });

  it('rejects a duplicate versionCode', async () => {
    const first = await request(app)
      .post('/api/v1/app/releases')
      .set('Authorization', `Bearer ${token}`)
      .field('versionCode', '5')
      .field('versionName', '2.0.0')
      .attach('apk', fakeApkBuffer('a'), 'a.apk');
    expect(first.status).toBe(201);

    const dup = await request(app)
      .post('/api/v1/app/releases')
      .set('Authorization', `Bearer ${token}`)
      .field('versionCode', '5')
      .field('versionName', '2.0.1')
      .attach('apk', fakeApkBuffer('b'), 'b.apk');
    expect(dup.status).toBe(400);
    expect(dup.body.error.code).toBe('VALIDATION');
  });

  it('rejects a non-.apk file (415 FILE_INVALID)', async () => {
    const res = await request(app)
      .post('/api/v1/app/releases')
      .set('Authorization', `Bearer ${token}`)
      .field('versionCode', '7')
      .field('versionName', '3.0.0')
      .attach('apk', Buffer.from('not an apk'), 'malware.exe');
    expect(res.status).toBe(415);
    expect(res.body.error.code).toBe('FILE_INVALID');
  });

  it('rejects an invalid body (missing versionName)', async () => {
    const res = await request(app)
      .post('/api/v1/app/releases')
      .set('Authorization', `Bearer ${token}`)
      .field('versionCode', '9')
      .attach('apk', fakeApkBuffer('c'), 'c.apk');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION');
  });

  it('requires admin auth for upload', async () => {
    const res = await request(app)
      .post('/api/v1/app/releases')
      .field('versionCode', '2')
      .field('versionName', '1.0.1')
      .attach('apk', fakeApkBuffer('v2'), 'app.apk');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('AUTH_INVALID');
  });

  it('requires admin auth for list', async () => {
    const res = await request(app).get('/api/v1/app/releases');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('AUTH_INVALID');
  });

  it('lists releases newest-first for an authenticated admin', async () => {
    for (const vc of ['1', '2']) {
      await request(app)
        .post('/api/v1/app/releases')
        .set('Authorization', `Bearer ${token}`)
        .field('versionCode', vc)
        .field('versionName', `1.0.${vc}`)
        .attach('apk', fakeApkBuffer(vc), `app-${vc}.apk`);
    }
    const res = await request(app)
      .get('/api/v1/app/releases')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.releases).toHaveLength(2);
    expect(res.body.data.releases[0].versionCode).toBe(2);
    expect(res.body.data.releases[1].versionCode).toBe(1);
  });

  it('allows public access to latest-version (no auth) and streams the APK', async () => {
    const apk = fakeApkBuffer('stream');
    await request(app)
      .post('/api/v1/app/releases')
      .set('Authorization', `Bearer ${token}`)
      .field('versionCode', '4')
      .field('versionName', '1.0.3')
      .attach('apk', apk, 'app-4.apk');

    // Public metadata.
    const meta = await request(app).get('/api/v1/app/latest-version');
    expect(meta.status).toBe(200);

    // Public download. apkPath is relative to the API base (/api/v1/).
    const file = await request(app)
      .get(`/api/v1/${meta.body.data.apkPath}`)
      .buffer(true)
      .parse((res, cb) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => cb(null, Buffer.concat(chunks)));
      });
    expect(file.status).toBe(200);
    expect(file.headers['content-type']).toBe('application/vnd.android.package-archive');
    expect(file.headers['content-disposition']).toContain('attachment');
    expect(Buffer.compare(file.body, apk)).toBe(0);
  });

  it('returns 404 streaming a versionCode that does not exist', async () => {
    const res = await request(app).get('/api/v1/app/releases/999/file');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });
});
