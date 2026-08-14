// Typed service functions — one per backend endpoint used by the panel.

import { apiRequest } from "./api";
import {
  getRefreshToken,
  saveSession,
  setRefreshToken,
} from "./auth";
import type {
  Admin,
  Announcement,
  AppRelease,
  AudioKind,
  AzanAudio,
  Device,
  LatestVersion,
  LoginResponse,
  Prayer,
  PrayerTime,
  Schedule,
  ScheduleVersion,
} from "./types";

// ---- Auth ----

export async function login(
  email: string,
  password: string
): Promise<LoginResponse> {
  const data = await apiRequest<LoginResponse>("/auth/login", {
    method: "POST",
    body: { email, password },
    skipAuth: true,
  });
  saveSession(data.accessToken, data.refreshToken, data.admin);
  return data;
}

export async function logout(): Promise<void> {
  const refreshToken = getRefreshToken();
  if (refreshToken) {
    try {
      await apiRequest("/auth/logout", {
        method: "POST",
        body: { refreshToken },
      });
    } catch {
      // ignore — we clear locally regardless
    }
  }
}

export async function fetchMe(): Promise<Admin> {
  return apiRequest<Admin>("/auth/me");
}

// Attempt to restore a session from a persisted refresh token on app load.
export async function restoreSession(): Promise<Admin | null> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) return null;
  try {
    const data = await apiRequest<{
      accessToken: string;
      refreshToken: string;
    }>("/auth/refresh", {
      method: "POST",
      body: { refreshToken },
      skipAuth: true,
    });
    setRefreshToken(data.refreshToken);
    // setAccessToken via saveSession requires admin; fetch it.
    // We set the access token first through a lightweight path:
    const { setAccessToken } = await import("./auth");
    setAccessToken(data.accessToken);
    const admin = await fetchMe();
    saveSession(data.accessToken, data.refreshToken, admin);
    return admin;
  } catch {
    return null;
  }
}

// ---- Schedule ----

export function getSchedule(): Promise<Schedule> {
  return apiRequest<Schedule>("/schedule");
}

export function updateScheduleMeta(payload: {
  timezone?: string;
  name?: string;
}): Promise<Schedule> {
  return apiRequest<Schedule>("/schedule", {
    method: "PUT",
    body: payload,
  });
}

// Set (or clear, with null) the fallback Azan audio for prayers without a custom clip.
export function setDefaultAudio(
  defaultAudioId: string | null
): Promise<Schedule> {
  return apiRequest<Schedule>("/schedule", {
    method: "PUT",
    body: { defaultAudioId },
  });
}

export function updatePrayer(
  prayer: Prayer,
  payload: Partial<
    Pick<
      PrayerTime,
      "time" | "enabled" | "audioEnabled" | "notificationEnabled" | "audioId"
    >
  >
): Promise<PrayerTime> {
  return apiRequest<PrayerTime>(`/schedule/prayers/${prayer}`, {
    method: "PUT",
    body: payload,
  });
}

export function publishSchedule(): Promise<ScheduleVersion> {
  return apiRequest<ScheduleVersion>("/schedule/publish", {
    method: "POST",
  });
}

export function getScheduleVersions(): Promise<ScheduleVersion[]> {
  return apiRequest<ScheduleVersion[]>("/schedule/versions");
}

// ---- Audio ----

export function getAudioList(): Promise<AzanAudio[]> {
  return apiRequest<AzanAudio[]>("/audio");
}

export function uploadAudio(
  file: File,
  opts?: { label?: string; kind?: AudioKind }
): Promise<AzanAudio> {
  const form = new FormData();
  form.append("file", file);
  if (opts?.label && opts.label.trim()) form.append("label", opts.label.trim());
  if (opts?.kind) form.append("kind", opts.kind);
  return apiRequest<AzanAudio>("/audio", {
    method: "POST",
    body: form,
    raw: true,
  });
}

// ---- Announcements ----

export function listAnnouncements(): Promise<Announcement[]> {
  return apiRequest<Announcement[]>("/announcements");
}

// Multipart create: either an `audio` MP3 file OR an existing `audioId`,
// plus `scheduledAt` (ISO instant), optional `label` and `enabled`.
export function createAnnouncement(form: FormData): Promise<Announcement> {
  return apiRequest<Announcement>("/announcements", {
    method: "POST",
    body: form,
    raw: true,
  });
}

export function updateAnnouncement(
  id: string,
  body: {
    scheduledAt?: string;
    label?: string | null;
    enabled?: boolean;
    audioId?: string;
  }
): Promise<Announcement> {
  return apiRequest<Announcement>(`/announcements/${id}`, {
    method: "PUT",
    body,
  });
}

export function deleteAnnouncement(id: string): Promise<void> {
  return apiRequest<void>(`/announcements/${id}`, {
    method: "DELETE",
  });
}

// ---- App releases / auto-update ----

// Upload a signed APK release. Expects a FormData with the `apk` file plus the
// `versionCode`, `versionName`, `notes`, and `mandatory` fields (multipart), mirroring
// the audio upload approach.
export function uploadAppRelease(form: FormData): Promise<AppRelease> {
  return apiRequest<AppRelease>("/app/releases", {
    method: "POST",
    body: form,
    raw: true,
  });
}

export function listAppReleases(): Promise<AppRelease[]> {
  return apiRequest<AppRelease[]>("/app/releases");
}

export function getLatestVersion(): Promise<LatestVersion> {
  return apiRequest<LatestVersion>("/app/latest-version", { skipAuth: true });
}

// ---- Devices ----

export function getDevices(): Promise<Device[]> {
  return apiRequest<Device[]>("/devices");
}

// ---- Admin actions ----

export function sendTestNotification(
  deviceIds?: string[]
): Promise<{ sent?: number } | unknown> {
  return apiRequest("/admin/test-notification", {
    method: "POST",
    body: deviceIds && deviceIds.length ? { deviceIds } : {},
  });
}

export function sendTestAzan(
  deviceIds?: string[]
): Promise<{ sent?: number } | unknown> {
  return apiRequest("/admin/test-azan", {
    method: "POST",
    body: deviceIds && deviceIds.length ? { deviceIds } : {},
  });
}
