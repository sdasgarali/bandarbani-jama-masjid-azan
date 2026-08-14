// Central REST client with a refresh-on-401 interceptor.
//
// All responses follow: { data: ... } on success, { error: { code, message } } on failure.
// The client:
//  - attaches the in-memory access token as a Bearer header,
//  - on a 401/AUTH_EXPIRED, attempts a single /auth/refresh using the stored refresh token,
//    then retries the original request once,
//  - de-duplicates concurrent refreshes so only one refresh flight runs at a time,
//  - clears the session and signals logout if refresh fails.

import {
  clearSession,
  getAccessToken,
  getRefreshToken,
  setAccessToken,
  setRefreshToken,
} from "./auth";
import type { ApiError } from "./types";

export const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE?.replace(/\/$/, "") ||
  "http://localhost:4000/api/v1";

export class ApiRequestError extends Error {
  code: string;
  status: number;
  constructor(code: string, message: string, status: number) {
    super(message);
    this.name = "ApiRequestError";
    this.code = code;
    this.status = status;
  }
}

let refreshPromise: Promise<boolean> | null = null;

async function doRefresh(): Promise<boolean> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) return false;

  try {
    const res = await fetch(`${API_BASE}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken }),
    });
    if (!res.ok) return false;
    const json = await res.json().catch(() => null);
    const data = json?.data ?? json;
    if (!data?.accessToken || !data?.refreshToken) return false;
    setAccessToken(data.accessToken);
    setRefreshToken(data.refreshToken);
    return true;
  } catch {
    return false;
  }
}

async function refreshOnce(): Promise<boolean> {
  if (!refreshPromise) {
    refreshPromise = doRefresh().finally(() => {
      refreshPromise = null;
    });
  }
  return refreshPromise;
}

interface RequestOptions {
  method?: string;
  body?: unknown;
  // When true, `body` is passed through untouched (e.g. FormData) and no JSON header is set.
  raw?: boolean;
  headers?: Record<string, string>;
  // Skip the auth header + refresh flow (used by login/refresh themselves).
  skipAuth?: boolean;
  signal?: AbortSignal;
}

async function parse<T>(res: Response): Promise<T> {
  const text = await res.text();
  let json: any = null;
  if (text) {
    try {
      json = JSON.parse(text);
    } catch {
      // non-JSON body
    }
  }
  if (!res.ok) {
    const err: ApiError = json?.error ?? {
      code: mapStatusToCode(res.status),
      message: json?.message || res.statusText || "Request failed",
    };
    throw new ApiRequestError(err.code, err.message, res.status);
  }
  // Unwrap { data: ... } envelope; fall back to raw json.
  return (json && "data" in json ? json.data : json) as T;
}

function mapStatusToCode(status: number): string {
  switch (status) {
    case 400:
      return "VALIDATION";
    case 401:
      return "AUTH_INVALID";
    case 403:
      return "FORBIDDEN";
    case 404:
      return "NOT_FOUND";
    case 415:
      return "FILE_INVALID";
    case 429:
      return "RATE_LIMITED";
    default:
      return "INTERNAL";
  }
}

async function rawFetch(
  path: string,
  opts: RequestOptions,
  accessToken: string | null
): Promise<Response> {
  const headers: Record<string, string> = { ...(opts.headers || {}) };
  if (!opts.raw && opts.body !== undefined) {
    headers["Content-Type"] = "application/json";
  }
  if (!opts.skipAuth && accessToken) {
    headers["Authorization"] = `Bearer ${accessToken}`;
  }

  const body =
    opts.body === undefined
      ? undefined
      : opts.raw
        ? (opts.body as BodyInit)
        : JSON.stringify(opts.body);

  return fetch(`${API_BASE}${path}`, {
    method: opts.method || "GET",
    headers,
    body,
    signal: opts.signal,
  });
}

export async function apiRequest<T = unknown>(
  path: string,
  opts: RequestOptions = {}
): Promise<T> {
  let res = await rawFetch(path, opts, getAccessToken());

  // Attempt a single refresh + retry on auth failure.
  if (res.status === 401 && !opts.skipAuth) {
    const refreshed = await refreshOnce();
    if (refreshed) {
      res = await rawFetch(path, opts, getAccessToken());
    } else {
      clearSession();
      throw new ApiRequestError(
        "AUTH_EXPIRED",
        "Your session has expired. Please sign in again.",
        401
      );
    }
  }

  return parse<T>(res);
}

// Build an authenticated URL for media (e.g. audio streaming) — the <audio> element
// cannot send Authorization headers, so we surface the plain URL. If the backend
// requires auth on these routes, a token query param would be needed; per API.md the
// audio file route is device/admin readable and used directly by the app.
export function mediaUrl(path: string): string {
  return `${API_BASE}${path}`;
}
