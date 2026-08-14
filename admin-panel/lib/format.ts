// Small formatting helpers.

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function timeAgo(value: string | null | undefined): string {
  if (!value) return "never";
  const d = new Date(value);
  if (isNaN(d.getTime())) return "never";
  const diff = Date.now() - d.getTime();
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  return `${day}d ago`;
}

export function formatBytes(bytes: number | null | undefined): string {
  if (bytes == null || isNaN(bytes)) return "—";
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const val = bytes / Math.pow(1024, i);
  return `${val.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

export function shortChecksum(sum: string | null | undefined): string {
  if (!sum) return "—";
  return sum.length > 16 ? `${sum.slice(0, 8)}…${sum.slice(-8)}` : sum;
}

// Validate "HH:mm" 24-hour format.
export function isValidTime(value: string): boolean {
  return /^([01]\d|2[0-3]):([0-5]\d)$/.test(value);
}

// Convert a <input type="datetime-local"> value ("YYYY-MM-DDTHH:mm", interpreted in the
// browser's local timezone) to an ISO 8601 instant (UTC). Returns null if invalid/empty.
export function localInputToIso(value: string): string | null {
  if (!value) return null;
  const d = new Date(value); // datetime-local is parsed as local time
  if (isNaN(d.getTime())) return null;
  return d.toISOString();
}

// Convert an ISO instant back to a datetime-local input value in the browser's local tz.
export function isoToLocalInput(value: string | null | undefined): string {
  if (!value) return "";
  const d = new Date(value);
  if (isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `T${pad(d.getHours())}:${pad(d.getMinutes())}`
  );
}

export const PRAYER_LABELS: Record<string, string> = {
  FAJR: "Fajr",
  DHUHR: "Dhuhr",
  ASR: "Asr",
  MAGHRIB: "Maghrib",
  ISHA: "Isha",
};
