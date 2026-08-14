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
  // This prayer's custom Azan audio; null ⇒ fall back to schedule.defaultAudioId.
  audioId?: string | null;
}

export interface Schedule {
  id: string;
  name: string;
  timezone: string;
  currentVersion: number;
  isPublished: boolean;
  prayers: PrayerTime[];
  // Fallback Azan audio when a prayer has no custom audio; null ⇒ notification only.
  defaultAudioId?: string | null;
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

export type AudioKind = "AZAN" | "ANNOUNCEMENT";

export interface AzanAudio {
  id: string;
  label?: string | null;
  kind?: AudioKind;
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

// Resolved audio meta as embedded in an Announcement (published payload shape).
export interface AnnouncementAudio {
  id?: string;
  label?: string | null;
  version: number;
  path?: string;
  mimeType?: string;
  sizeBytes?: number;
  checksumSha256?: string;
}

export interface Announcement {
  id: string;
  label?: string | null;
  scheduledAt: string; // ISO 8601 instant (UTC)
  enabled: boolean;
  audioId?: string;
  audio: AnnouncementAudio;
  createdAt?: string;
}

export interface AppRelease {
  id?: string;
  versionCode: number;
  versionName: string;
  notes?: string | null;
  mandatory: boolean;
  sizeBytes: number;
  checksumSha256: string;
  createdAt?: string;
}

export interface LatestVersion {
  versionCode: number;
  versionName: string;
  notes?: string | null;
  mandatory: boolean;
  sizeBytes: number;
  checksumSha256: string;
  apkPath: string;
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
