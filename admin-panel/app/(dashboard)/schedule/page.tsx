"use client";

import { useCallback, useEffect, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import {
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  ErrorState,
  Spinner,
  Toggle,
} from "@/components/ui";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { useToast } from "@/components/Toast";
import {
  getAudioList,
  getSchedule,
  getScheduleVersions,
  publishSchedule,
  setDefaultAudio,
  updatePrayer,
  updateScheduleMeta,
} from "@/lib/services";
import { ApiRequestError } from "@/lib/api";
import {
  PRAYERS,
  type AzanAudio,
  type Prayer,
  type PrayerTime,
  type Schedule,
  type ScheduleVersion,
} from "@/lib/types";
import { formatDateTime, isValidTime, PRAYER_LABELS } from "@/lib/format";

type ToggleField = "enabled" | "audioEnabled" | "notificationEnabled";

function errMsg(e: unknown, fallback: string): string {
  if (e instanceof ApiRequestError) return e.message;
  return fallback;
}

export default function SchedulePage() {
  const toast = useToast();
  const [schedule, setSchedule] = useState<Schedule | null>(null);
  const [versions, setVersions] = useState<ScheduleVersion[]>([]);
  const [audios, setAudios] = useState<AzanAudio[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingDefault, setSavingDefault] = useState(false);

  // Local edit state for prayer times (so typing doesn't fire a request per keystroke).
  const [timeDraft, setTimeDraft] = useState<Record<string, string>>({});
  const [timezone, setTimezone] = useState("");
  const [savingTz, setSavingTz] = useState(false);
  const [busyPrayer, setBusyPrayer] = useState<string | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [confirmPublish, setConfirmPublish] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [s, v, a] = await Promise.all([
        getSchedule(),
        getScheduleVersions().catch(() => [] as ScheduleVersion[]),
        getAudioList().catch(() => [] as AzanAudio[]),
      ]);
      setSchedule(s);
      setVersions(v);
      setAudios(a);
      setTimezone(s.timezone || "");
      const drafts: Record<string, string> = {};
      s.prayers?.forEach((p) => (drafts[p.prayer] = p.time));
      setTimeDraft(drafts);
    } catch (e) {
      setError(
        errMsg(
          e,
          "Unable to load the schedule. The backend may be offline — check the API connection and try again."
        )
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function prayerFor(p: Prayer): PrayerTime | undefined {
    return schedule?.prayers?.find((x) => x.prayer === p);
  }

  function patchLocalPrayer(p: Prayer, patch: Partial<PrayerTime>) {
    setSchedule((prev) =>
      prev
        ? {
            ...prev,
            prayers: prev.prayers.map((x) =>
              x.prayer === p ? { ...x, ...patch } : x
            ),
          }
        : prev
    );
  }

  async function saveTime(p: Prayer) {
    const value = timeDraft[p];
    if (!isValidTime(value)) {
      toast.error(`${PRAYER_LABELS[p]}: enter a valid time in HH:mm (24h).`);
      return;
    }
    const current = prayerFor(p);
    if (current && current.time === value) return; // no change
    setBusyPrayer(p);
    try {
      await updatePrayer(p, { time: value });
      patchLocalPrayer(p, { time: value });
      toast.success(`${PRAYER_LABELS[p]} time updated to ${value}.`);
    } catch (e) {
      toast.error(errMsg(e, `Failed to update ${PRAYER_LABELS[p]} time.`));
    } finally {
      setBusyPrayer(null);
    }
  }

  async function saveToggle(p: Prayer, field: ToggleField, next: boolean) {
    setBusyPrayer(p);
    // Optimistic update.
    patchLocalPrayer(p, { [field]: next } as Partial<PrayerTime>);
    try {
      await updatePrayer(p, { [field]: next });
    } catch (e) {
      // rollback
      patchLocalPrayer(p, { [field]: !next } as Partial<PrayerTime>);
      toast.error(errMsg(e, `Failed to update ${PRAYER_LABELS[p]}.`));
    } finally {
      setBusyPrayer(null);
    }
  }

  async function savePrayerAudio(p: Prayer, audioId: string | null) {
    const current = prayerFor(p);
    const prev = current?.audioId ?? null;
    if (prev === audioId) return; // no change
    setBusyPrayer(p);
    patchLocalPrayer(p, { audioId });
    try {
      await updatePrayer(p, { audioId });
      toast.success(
        audioId
          ? `${PRAYER_LABELS[p]} Azan audio updated.`
          : `${PRAYER_LABELS[p]} now uses the default Azan audio.`
      );
    } catch (e) {
      patchLocalPrayer(p, { audioId: prev });
      toast.error(errMsg(e, `Failed to update ${PRAYER_LABELS[p]} audio.`));
    } finally {
      setBusyPrayer(null);
    }
  }

  async function saveDefaultAudio(audioId: string | null) {
    const prev = schedule?.defaultAudioId ?? null;
    if (prev === audioId) return;
    setSavingDefault(true);
    setSchedule((s) => (s ? { ...s, defaultAudioId: audioId } : s));
    try {
      const updated = await setDefaultAudio(audioId);
      setSchedule((s) =>
        s ? { ...s, defaultAudioId: updated.defaultAudioId ?? audioId } : s
      );
      toast.success(
        audioId
          ? "Default Azan audio updated."
          : "Default Azan audio cleared (notification only)."
      );
    } catch (e) {
      setSchedule((s) => (s ? { ...s, defaultAudioId: prev } : s));
      toast.error(errMsg(e, "Failed to update the default Azan audio."));
    } finally {
      setSavingDefault(false);
    }
  }

  async function saveTimezone() {
    if (!timezone.trim()) {
      toast.error("Timezone cannot be empty (e.g. Asia/Dhaka).");
      return;
    }
    setSavingTz(true);
    try {
      const updated = await updateScheduleMeta({ timezone: timezone.trim() });
      setSchedule((prev) => (prev ? { ...prev, timezone: updated.timezone } : prev));
      toast.success("Timezone saved.");
    } catch (e) {
      toast.error(errMsg(e, "Failed to update timezone."));
    } finally {
      setSavingTz(false);
    }
  }

  async function doPublish() {
    setPublishing(true);
    try {
      const version = await publishSchedule();
      toast.success(
        `Schedule published as version ${version.version}. Devices are being notified.`
      );
      setConfirmPublish(false);
      await load();
    } catch (e) {
      toast.error(errMsg(e, "Publish failed. Please try again."));
    } finally {
      setPublishing(false);
    }
  }

  if (loading) {
    return (
      <>
        <PageHeader title="Schedule" description="Prayer times & settings" />
        <Spinner label="Loading schedule" />
      </>
    );
  }

  if (error || !schedule) {
    return (
      <>
        <PageHeader title="Schedule" description="Prayer times & settings" />
        <ErrorState message={error || "Schedule not found."} onRetry={load} />
      </>
    );
  }

  const latestVersion =
    versions.length > 0
      ? [...versions].sort((a, b) => b.version - a.version)[0]
      : null;

  // Only Azan-kind clips are assignable to prayers / as the default.
  const azanAudios = audios
    .filter((a) => (a.kind || "AZAN") === "AZAN")
    .sort((a, b) => b.version - a.version);

  function audioLabel(a: AzanAudio): string {
    return `${a.label || a.filename} · v${a.version}`;
  }

  return (
    <>
      <PageHeader
        title="Schedule"
        description="Set prayer times, per-prayer Azan audio and toggles. Publish to push changes to devices."
        action={
          <div className="flex items-center gap-2">
            {schedule.isPublished ? (
              <Badge tone="success">Published v{schedule.currentVersion}</Badge>
            ) : (
              <Badge tone="gold">Draft</Badge>
            )}
            <Button variant="gold" onClick={() => setConfirmPublish(true)}>
              🚀 Publish schedule
            </Button>
          </div>
        }
      />

      {/* Default Azan audio */}
      <Card className="mb-6">
        <CardHeader
          title="Default Azan audio"
          description="The fallback Azan played for any prayer without its own custom clip."
        />
        <div className="flex flex-wrap items-end gap-3 px-5 py-4">
          <div className="flex-1">
            <label
              htmlFor="default-audio"
              className="mb-1.5 block text-sm font-medium text-slate-700"
            >
              Default Azan clip
            </label>
            <select
              id="default-audio"
              value={schedule.defaultAudioId ?? ""}
              disabled={savingDefault}
              onChange={(e) =>
                saveDefaultAudio(e.target.value === "" ? null : e.target.value)
              }
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-200 disabled:opacity-60 sm:max-w-md"
            >
              <option value="">No default (notification only)</option>
              {azanAudios.map((a) => (
                <option key={a.id} value={a.id}>
                  {audioLabel(a)}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-slate-400">
              {azanAudios.length === 0
                ? "No Azan clips in the library yet — upload one on the Azan Audio page."
                : "Applies to prayers set to “Default”. Publish to push to devices."}
            </p>
          </div>
          {savingDefault && (
            <span
              aria-hidden
              className="mb-2 h-4 w-4 animate-spin rounded-full border-2 border-brand-500 border-t-transparent"
            />
          )}
        </div>
      </Card>

      {/* Prayer times */}
      <Card>
        <CardHeader
          title="Prayer times"
          description="24-hour format (HH:mm). Choose an Azan clip and toggle audio/notifications per prayer."
        />
        <div className="divide-y divide-slate-100">
          {/* Header row (desktop) */}
          <div className="hidden grid-cols-12 gap-4 px-5 py-2 text-xs font-medium uppercase tracking-wide text-slate-400 sm:grid">
            <div className="col-span-3">Prayer</div>
            <div className="col-span-4">Time</div>
            <div className="col-span-2 text-center">Enabled</div>
            <div className="col-span-2 text-center">Audio</div>
            <div className="col-span-1 text-center">Notify</div>
          </div>

          {PRAYERS.map((p) => {
            const pt = prayerFor(p);
            if (!pt) return null;
            const draft = timeDraft[p] ?? pt.time;
            const invalid = draft.length > 0 && !isValidTime(draft);
            const busy = busyPrayer === p;
            return (
              <div key={p} className="px-5 py-4">
              <div
                className="grid grid-cols-2 items-center gap-4 sm:grid-cols-12"
              >
                <div className="col-span-2 flex items-center gap-2 sm:col-span-3">
                  <span
                    aria-hidden
                    className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-50 text-sm font-bold text-brand-700"
                  >
                    {PRAYER_LABELS[p].charAt(0)}
                  </span>
                  <span className="font-semibold text-slate-900">
                    {PRAYER_LABELS[p]}
                  </span>
                </div>

                <div className="col-span-2 flex items-center gap-2 sm:col-span-4">
                  <input
                    type="time"
                    aria-label={`${PRAYER_LABELS[p]} time`}
                    value={draft}
                    onChange={(e) =>
                      setTimeDraft((prev) => ({ ...prev, [p]: e.target.value }))
                    }
                    onBlur={() => saveTime(p)}
                    className={[
                      "w-32 rounded-lg border px-3 py-2 text-sm shadow-sm outline-none transition focus:ring-2",
                      invalid
                        ? "border-red-400 focus:border-red-500 focus:ring-red-200"
                        : "border-slate-300 focus:border-brand-500 focus:ring-brand-200",
                    ].join(" ")}
                  />
                  {busy && (
                    <span
                      aria-hidden
                      className="h-4 w-4 animate-spin rounded-full border-2 border-brand-500 border-t-transparent"
                    />
                  )}
                </div>

                <div className="flex items-center gap-2 sm:col-span-2 sm:justify-center">
                  <span className="text-xs text-slate-500 sm:hidden">
                    Enabled
                  </span>
                  <Toggle
                    label={`${PRAYER_LABELS[p]} enabled`}
                    checked={pt.enabled}
                    disabled={busy}
                    onChange={(v) => saveToggle(p, "enabled", v)}
                  />
                </div>

                <div className="flex items-center gap-2 sm:col-span-2 sm:justify-center">
                  <span className="text-xs text-slate-500 sm:hidden">Audio</span>
                  <Toggle
                    label={`${PRAYER_LABELS[p]} audio`}
                    checked={pt.audioEnabled}
                    disabled={busy}
                    onChange={(v) => saveToggle(p, "audioEnabled", v)}
                  />
                </div>

                <div className="flex items-center gap-2 sm:col-span-1 sm:justify-center">
                  <span className="text-xs text-slate-500 sm:hidden">
                    Notify
                  </span>
                  <Toggle
                    label={`${PRAYER_LABELS[p]} notifications`}
                    checked={pt.notificationEnabled}
                    disabled={busy}
                    onChange={(v) => saveToggle(p, "notificationEnabled", v)}
                  />
                </div>
              </div>

              {/* Per-prayer Azan audio */}
              <div className="mt-3 flex flex-wrap items-center gap-2 sm:mt-2 sm:pl-10">
                <label
                  htmlFor={`audio-${p}`}
                  className="text-xs font-medium uppercase tracking-wide text-slate-400"
                >
                  Azan audio
                </label>
                <select
                  id={`audio-${p}`}
                  value={pt.audioId ?? ""}
                  disabled={busy}
                  onChange={(e) =>
                    savePrayerAudio(
                      p,
                      e.target.value === "" ? null : e.target.value
                    )
                  }
                  className="min-w-[220px] rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm shadow-sm outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-200 disabled:opacity-60"
                >
                  <option value="">
                    Default
                    {schedule.defaultAudioId
                      ? ""
                      : " (notification only)"}
                  </option>
                  {azanAudios.map((a) => (
                    <option key={a.id} value={a.id}>
                      {audioLabel(a)}
                    </option>
                  ))}
                </select>
              </div>
              </div>
            );
          })}
        </div>
      </Card>

      {/* Timezone + versions */}
      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="Timezone"
            description="IANA timezone applied to all prayer times."
          />
          <div className="flex flex-wrap items-end gap-3 px-5 py-4">
            <div className="flex-1">
              <label
                htmlFor="timezone"
                className="mb-1.5 block text-sm font-medium text-slate-700"
              >
                Timezone (IANA)
              </label>
              <input
                id="timezone"
                type="text"
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
                placeholder="Asia/Dhaka"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-200"
              />
            </div>
            <Button
              onClick={saveTimezone}
              loading={savingTz}
              disabled={timezone.trim() === (schedule.timezone || "")}
            >
              Save
            </Button>
          </div>
        </Card>

        <Card>
          <CardHeader
            title="Published versions"
            description={
              latestVersion
                ? `Latest: v${latestVersion.version}`
                : "No versions published yet"
            }
          />
          {versions.length === 0 ? (
            <EmptyState
              icon="🗂️"
              title="Nothing published yet"
              description="Publish the schedule to create the first immutable version."
            />
          ) : (
            <ul className="max-h-64 divide-y divide-slate-100 overflow-y-auto">
              {[...versions]
                .sort((a, b) => b.version - a.version)
                .map((v) => (
                  <li
                    key={v.id || v.version}
                    className="flex items-center justify-between px-5 py-3 text-sm"
                  >
                    <span className="flex items-center gap-2 font-medium text-slate-900">
                      <Badge tone="brand">v{v.version}</Badge>
                      <span className="text-slate-500">{v.timezone}</span>
                    </span>
                    <span className="text-slate-400">
                      {formatDateTime(v.publishedAt)}
                    </span>
                  </li>
                ))}
            </ul>
          )}
        </Card>
      </div>

      <ConfirmDialog
        open={confirmPublish}
        title="Publish schedule?"
        message="This snapshots the current draft as a new immutable version and sends a push notification to every registered device so they re-sync. Continue?"
        confirmLabel="Publish now"
        loading={publishing}
        onConfirm={doPublish}
        onCancel={() => !publishing && setConfirmPublish(false)}
      />
    </>
  );
}
