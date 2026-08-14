// Typed service functions — one per backend endpoint used by the panel.

import { apiRequest } from "./api";
import {
  getRefreshToken,
  saveSession,
  setRefreshToken,
} from "./auth";
import type {
  Admin,
  AzanAudio,
  Device,
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
  timezone: string;
  name?: string;
}): Promise<Schedule> {
  return apiRequest<Schedule>("/schedule", {
    method: "PUT",
    body: payload,
  });
}

export function updatePrayer(
  prayer: Prayer,
  payload: Partial<
    Pick<
      PrayerTime,
      "time" | "enabled" | "audioEnabled" | "notificationEnabled"
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

export function uploadAudio(file: File): Promise<AzanAudio> {
  const form = new FormData();
  form.append("file", file);
  return apiRequest<AzanAudio>("/audio", {
    method: "POST",
    body: form,
    raw: true,
  });
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
