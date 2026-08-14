// Shared API types mirroring docs/API.md and docs/DATABASE.md.

export type Prayer = "FAJR" | "DHUHR" | "ASR" | "MAGHRIB" | "ISHA";
export const PRAYERS: Prayer[] = ["FAJR", "DHUHR", "ASR", "MAGHRIB", "ISHA"];

export type DeviceStatus = "ACTIVE" | "INACTIVE";

export interface Admin {
  id: string;
  email: string;
  name: string;
  role: string;
}

export interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  admin: Admin;
}

export interface PrayerTime {
  id?: string;
  prayer: Prayer;
  time: string; // "HH:mm"
  enabled: boolean;
  audioEnabled: boolean;
  notificationEnabled: boolean;
}

export interface Schedule {
  id: string;
  name: string;
  timezone: string;
  currentVersion: number;
  isPublished: boolean;
  prayers: PrayerTime[];
  createdAt?: string;
  updatedAt?: string;
}

export interface ScheduleVersion {
  id: string;
  version: number;
  timezone: string;
  publishedAt: string;
  publishedById?: string;
  payload?: unknown;
}

export interface AzanAudio {
  id: string;
  filename: string;
  storedName?: string;
  mimeType: string;
  sizeBytes: number;
  checksumSha256: string;
  version: number;
  durationMs?: number | null;
  isActive: boolean;
  uploadedById?: string;
  createdAt: string;
}

export interface Device {
  id: string;
  deviceId: string;
  platform: string;
  appVersion: string;
  androidVersion: number | string;
  model: string | null;
  timezone: string;
  lastSyncAt: string | null;
  lastActiveAt: string | null;
  status: DeviceStatus;
  createdAt?: string;
}

export interface ApiError {
  code: string;
  message: string;
}
