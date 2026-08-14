import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import request from 'supertest';
import { buildTestApp, seedFixtures, loginAndGetToken } from './helpers/testApp.js';

function fakeMp3(marker = 'x') {
  return Buffer.from(`ID3-fake-mp3-${marker}`);
}

describe('Audio library', () => {
  let app;
  let prisma;
  let token;

  beforeEach(async () => {
    jest.resetModules();
    ({ app, prisma } = await buildTestApp());
    await seedFixtures(prisma);
    token = await loginAndGetToken(request, app);
  });

  it('requires admin auth for upload and list', async () => {
    const up = await request(app)
      .post('/api/v1/audio')
      .attach('file', fakeMp3(), { filename: 'a.mp3', contentType: 'audio/mpeg' });
    expect(up.status).toBe(401);

    const list = await request(app).get('/api/v1/audio');
    expect(list.status).toBe(401);
  });

  it('upload adds a row with label + kind and does NOT deactivate others (library semantics)', async () => {
    const first = await request(app)
      .post('/api/v1/audio')
      .set('Authorization', `Bearer ${token}`)
      .field('label', 'Default Azan')
      .attach('file', fakeMp3('1'), { filename: 'first.mp3', contentType: 'audio/mpeg' });
    expect(first.status).toBe(201);
    expect(first.body.data.version).toBe(1);
    expect(first.body.data.label).toBe('Default Azan');
    expect(first.body.data.path).toBe('audio/1/file');

    const second = await request(app)
      .post('/api/v1/audio')
      .set('Authorization', `Bearer ${token}`)
      .field('label', 'Eid notice')
      .field('kind', 'ANNOUNCEMENT')
      .attach('file', fakeMp3('2'), { filename: 'second.mp3', contentType: 'audio/mpeg' });
    expect(second.status).toBe(201);
    expect(second.body.data.version).toBe(2);

    // Neither row was deactivated — both remain in the library.
    const all = await prisma.azanAudio.findMany({});
    expect(all).toHaveLength(2);
    expect(all.every((a) => a.isActive === false)).toBe(true);
    const ann = all.find((a) => a.version === 2);
    expect(ann.kind).toBe('ANNOUNCEMENT');
    expect(ann.label).toBe('Eid notice');
  });

  it('GET /audio returns the library projection', async () => {
    await request(app)
      .post('/api/v1/audio')
      .set('Authorization', `Bearer ${token}`)
      .field('label', 'Makkah Azan')
      .attach('file', fakeMp3('m'), { filename: 'm.mp3', contentType: 'audio/mpeg' });

    const res = await request(app)
      .get('/api/v1/audio')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.audio).toHaveLength(1);
    const item = res.body.data.audio[0];
    expect(Object.keys(item).sort()).toEqual(
      ['checksumSha256', 'createdAt', 'id', 'kind', 'label', 'sizeBytes', 'version'].sort()
    );
    expect(item.label).toBe('Makkah Azan');
    expect(item.kind).toBe('AZAN');
    expect(item.version).toBe(1);
  });

  it('rejects an invalid kind', async () => {
    const res = await request(app)
      .post('/api/v1/audio')
      .set('Authorization', `Bearer ${token}`)
      .field('kind', 'BOGUS')
      .attach('file', fakeMp3('k'), { filename: 'k.mp3', contentType: 'audio/mpeg' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION');
  });
});
