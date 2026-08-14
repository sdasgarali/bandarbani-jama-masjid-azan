// Token store.
//
// The access token is kept in memory (module scope) so it never lands on disk.
// The refresh token is persisted in localStorage so a page reload can re-establish
// a session. NOTE: localStorage is readable by any script on this origin, so it is
// vulnerable to XSS. An httpOnly, Secure, SameSite=Strict cookie set by the backend
// would be the production-grade choice; we use localStorage here for simplicity and
// because the admin panel is a same-origin SPA. Keep this trade-off in mind.

import type { Admin } from "./types";

const REFRESH_KEY = "azan_admin_refresh_token";
const ADMIN_KEY = "azan_admin_profile";

let accessToken: string | null = null;

type Listener = () => void;
const listeners = new Set<Listener>();

function notify() {
  listeners.forEach((l) => l());
}

export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getAccessToken(): string | null {
  return accessToken;
}

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

export function getRefreshToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(REFRESH_KEY);
}

export function setRefreshToken(token: string | null): void {
  if (typeof window === "undefined") return;
  if (token) window.localStorage.setItem(REFRESH_KEY, token);
  else window.localStorage.removeItem(REFRESH_KEY);
}

export function getStoredAdmin(): Admin | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(ADMIN_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Admin;
  } catch {
    return null;
  }
}

export function setStoredAdmin(admin: Admin | null): void {
  if (typeof window === "undefined") return;
  if (admin) window.localStorage.setItem(ADMIN_KEY, JSON.stringify(admin));
  else window.localStorage.removeItem(ADMIN_KEY);
}

export function saveSession(
  access: string,
  refresh: string,
  admin: Admin
): void {
  setAccessToken(access);
  setRefreshToken(refresh);
  setStoredAdmin(admin);
  notify();
}

export function clearSession(): void {
  setAccessToken(null);
  setRefreshToken(null);
  setStoredAdmin(null);
  notify();
}

export function hasSession(): boolean {
  // A session is recoverable if we still hold a refresh token.
  return Boolean(accessToken) || Boolean(getRefreshToken());
}
