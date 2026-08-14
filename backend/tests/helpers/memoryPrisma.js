// A minimal in-memory Prisma-like client covering the operations used by the app,
// so the test suite runs without a real MongoDB. Not a full Prisma implementation.
import crypto from 'node:crypto';

function oid() {
  return crypto.randomBytes(12).toString('hex');
}

function matchWhere(row, where) {
  if (!where) return true;
  return Object.entries(where).every(([key, cond]) => {
    // Compound unique keys arrive as objects like { scheduleId_prayer: {...} }
    if (cond && typeof cond === 'object' && !Array.isArray(cond)) {
      if ('in' in cond) return cond.in.includes(row[key]);
      if ('lt' in cond) return row[key] < cond.lt;
      if ('gt' in cond) return row[key] > cond.gt;
      if ('not' in cond) return row[key] !== cond.not;
      if ('equals' in cond) return row[key] === cond.equals;
      // Compound-key lookup: match every sub-field.
      return Object.entries(cond).every(([k, v]) => row[k] === v);
    }
    return row[key] === cond;
  });
}

function applyOrder(rows, orderBy) {
  if (!orderBy) return rows;
  const [field, dir] = Object.entries(orderBy)[0];
  return [...rows].sort((a, b) => {
    const av = a[field];
    const bv = b[field];
    if (av === bv) return 0;
    const cmp = av > bv ? 1 : -1;
    return dir === 'desc' ? -cmp : cmp;
  });
}

function project(row, select) {
  if (!row) return row;
  if (!select) return { ...row };
  const out = {};
  for (const [k, v] of Object.entries(select)) if (v) out[k] = row[k];
  return out;
}

class Model {
  constructor(defaults = {}) {
    this.rows = [];
    this.defaults = defaults;
    // relations: { relationName: (row, client) => value }
    this.relations = {};
  }

  _applyInclude(row, include) {
    if (!row || !include) return row;
    const out = { ...row };
    for (const [rel, on] of Object.entries(include)) {
      if (on && this.relations[rel]) out[rel] = this.relations[rel](row, this._client);
    }
    return out;
  }

  _withDefaults(data) {
    const now = new Date();
    const base = {};
    for (const [k, v] of Object.entries(this.defaults)) {
      base[k] = typeof v === 'function' ? v(now) : v;
    }
    return { id: oid(), createdAt: now, updatedAt: now, ...base, ...data };
  }

  async create({ data, select }) {
    const row = this._withDefaults(data);
    this.rows.push(row);
    return project(row, select);
  }

  async findUnique({ where, select, include } = {}) {
    const row = this.rows.find((r) => matchWhere(r, where));
    if (!row) return null;
    if (include) return this._applyInclude(row, include);
    return project(row, select);
  }

  async findFirst({ where, orderBy, select, include } = {}) {
    let rows = this.rows.filter((r) => matchWhere(r, where));
    rows = applyOrder(rows, orderBy);
    if (!rows[0]) return null;
    if (include) return this._applyInclude(rows[0], include);
    return project(rows[0], select);
  }

  async findMany({ where, orderBy, select, include } = {}) {
    let rows = this.rows.filter((r) => matchWhere(r, where));
    rows = applyOrder(rows, orderBy);
    if (include) return rows.map((r) => this._applyInclude(r, include));
    return rows.map((r) => project(r, select));
  }

  async update({ where, data }) {
    const row = this.rows.find((r) => matchWhere(r, where));
    if (!row) throw new Error('Record to update not found');
    Object.assign(row, data, { updatedAt: new Date() });
    return { ...row };
  }

  async updateMany({ where, data }) {
    const rows = this.rows.filter((r) => matchWhere(r, where));
    rows.forEach((r) => Object.assign(r, data, { updatedAt: new Date() }));
    return { count: rows.length };
  }

  async upsert({ where, create, update, select }) {
    const row = this.rows.find((r) => matchWhere(r, where));
    if (row) {
      Object.assign(row, update, { updatedAt: new Date() });
      return project(row, select);
    }
    return this.create({ data: create, select });
  }

  async deleteMany() {
    const count = this.rows.length;
    this.rows = [];
    return { count };
  }
}

export function createMemoryPrisma() {
  const client = {
    admin: new Model({ role: 'admin', name: null }),
    refreshToken: new Model({ revokedAt: null }),
    prayerSchedule: new Model({ currentVersion: 0, isPublished: false }),
    prayerTime: new Model({ enabled: true, audioEnabled: true, notificationEnabled: true }),
    scheduleVersion: new Model({ publishedAt: () => new Date() }),
    azanAudio: new Model({ isActive: false, durationMs: null }),
    appRelease: new Model({ mandatory: false, notes: null, uploadedById: null }),
    appConfig: new Model({}),
    device: new Model({ platform: 'android', status: 'ACTIVE', lastActiveAt: () => new Date() }),
    fcmToken: new Model({ isActive: true }),
    auditLog: new Model({ metadata: {} }),
    async $disconnect() {},
    async $reset() {
      for (const key of Object.keys(this)) {
        if (this[key] instanceof Model) this[key].rows = [];
      }
    },
  };

  // Back-reference so relation resolvers can reach sibling models.
  for (const value of Object.values(client)) {
    if (value instanceof Model) value._client = client;
  }

  // Relation resolvers used by the app's include queries.
  client.prayerSchedule.relations = {
    prayers: (schedule, c) => c.prayerTime.rows.filter((p) => p.scheduleId === schedule.id),
  };
  client.device.relations = {
    fcmTokens: (device, c) => c.fcmToken.rows.filter((t) => t.deviceId === device.id),
  };

  return client;
}

export default createMemoryPrisma;
