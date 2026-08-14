"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
  createAnnouncement,
  deleteAnnouncement,
  getAudioList,
  listAnnouncements,
  updateAnnouncement,
} from "@/lib/services";
import { ApiRequestError, mediaUrl } from "@/lib/api";
import {
  formatBytes,
  formatDateTime,
  localInputToIso,
} from "@/lib/format";
import type { Announcement, AzanAudio } from "@/lib/types";

const MAX_MB = 10;

// The create form offers two audio sources: a fresh MP3 upload or an existing clip.
type AudioSource = "upload" | "existing";

function errMsg(e: unknown, fallback: string): string {
  if (e instanceof ApiRequestError) return e.message;
  return fallback;
}

export default function AnnouncementsPage() {
  const toast = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [list, setList] = useState<Announcement[]>([]);
  const [audios, setAudios] = useState<AzanAudio[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Create-form state.
  const [audioSource, setAudioSource] = useState<AudioSource>("upload");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [audioId, setAudioId] = useState("");
  const [scheduledLocal, setScheduledLocal] = useState("");
  const [label, setLabel] = useState("");
  const [enabled, setEnabled] = useState(true);

  // Confirm-before-create (auto-publishes) + row action state.
  const [confirmCreate, setConfirmCreate] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [items, audioList] = await Promise.all([
        listAnnouncements(),
        getAudioList().catch(() => [] as AzanAudio[]),
      ]);
      setList(
        [...items].sort(
          (a, b) =>
            new Date(b.scheduledAt).getTime() - new Date(a.scheduledAt).getTime()
        )
      );
      setAudios(audioList);
    } catch (e) {
      setError(
        errMsg(
          e,
          "Unable to load announcements. The backend may be offline — check the API connection and try again."
        )
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Prefer announcement-kind clips, but allow any existing audio to be reused.
  const existingAudios = [...audios].sort((a, b) => {
    const ak = (a.kind || "AZAN") === "ANNOUNCEMENT" ? 0 : 1;
    const bk = (b.kind || "AZAN") === "ANNOUNCEMENT" ? 0 : 1;
    if (ak !== bk) return ak - bk;
    return b.version - a.version;
  });

  function validateFile(file: File): string | null {
    if (
      file.type !== "audio/mpeg" &&
      !file.name.toLowerCase().endsWith(".mp3")
    ) {
      return "Only MP3 files (audio/mpeg) are allowed.";
    }
    if (file.size > MAX_MB * 1024 * 1024) {
      return `File exceeds the ${MAX_MB} MB limit.`;
    }
    return null;
  }

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    if (!file) {
      setSelectedFile(null);
      return;
    }
    const err = validateFile(file);
    if (err) {
      toast.error(err);
      setSelectedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }
    setSelectedFile(file);
  }

  function resetForm() {
    setAudioSource("upload");
    setSelectedFile(null);
    setAudioId("");
    setScheduledLocal("");
    setLabel("");
    setEnabled(true);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  // Validate the form; on success open the confirm dialog (creating auto-publishes).
  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;

    if (audioSource === "upload") {
      if (!selectedFile) {
        toast.error("Choose an MP3 file, or switch to an existing recording.");
        return;
      }
      const fileErr = validateFile(selectedFile);
      if (fileErr) {
        toast.error(fileErr);
        return;
      }
    } else if (!audioId) {
      toast.error("Pick an existing recording, or switch to upload.");
      return;
    }

    const iso = localInputToIso(scheduledLocal);
    if (!iso) {
      toast.error("Choose a valid date & time for the announcement.");
      return;
    }
    if (new Date(iso).getTime() <= Date.now()) {
      toast.error("The scheduled time must be in the future.");
      return;
    }

    setConfirmCreate(true);
  }

  async function doCreate() {
    const iso = localInputToIso(scheduledLocal);
    if (!iso) {
      setConfirmCreate(false);
      return;
    }
    setSubmitting(true);
    try {
      const form = new FormData();
      if (audioSource === "upload" && selectedFile) {
        form.append("audio", selectedFile);
      } else {
        form.append("audioId", audioId);
      }
      form.append("scheduledAt", iso);
      if (label.trim()) form.append("label", label.trim());
      form.append("enabled", enabled ? "true" : "false");

      await createAnnouncement(form);
      toast.success(
        "Announcement scheduled and published — devices are being notified."
      );
      setConfirmCreate(false);
      resetForm();
      await load();
    } catch (e) {
      toast.error(errMsg(e, "Failed to create the announcement. Please try again."));
    } finally {
      setSubmitting(false);
    }
  }

  async function toggleEnabled(a: Announcement, next: boolean) {
    setBusyId(a.id);
    // Optimistic update.
    setList((prev) =>
      prev.map((x) => (x.id === a.id ? { ...x, enabled: next } : x))
    );
    try {
      await updateAnnouncement(a.id, { enabled: next });
      toast.success(
        next
          ? "Announcement enabled — republished to devices."
          : "Announcement disabled — republished to devices."
      );
    } catch (e) {
      // rollback
      setList((prev) =>
        prev.map((x) => (x.id === a.id ? { ...x, enabled: !next } : x))
      );
      toast.error(errMsg(e, "Failed to update the announcement."));
    } finally {
      setBusyId(null);
    }
  }

  async function doDelete() {
    if (!confirmDeleteId) return;
    setDeleting(true);
    try {
      await deleteAnnouncement(confirmDeleteId);
      toast.success("Announcement deleted — republished to devices.");
      setConfirmDeleteId(null);
      await load();
    } catch (e) {
      toast.error(errMsg(e, "Failed to delete the announcement."));
    } finally {
      setDeleting(false);
    }
  }

  const deleteTarget = list.find((a) => a.id === confirmDeleteId) ?? null;

  return (
    <>
      <PageHeader
        title="Announcements"
        description="Schedule one-off audio broadcasts. Creating auto-publishes to every device."
        action={
          <Button variant="secondary" onClick={load}>
            Refresh
          </Button>
        }
      />

      {/* Create form */}
      <Card className="mb-6">
        <CardHeader
          title="Schedule an announcement"
          description={`Upload an MP3 (max ${MAX_MB} MB) or reuse a recording. Creating publishes immediately.`}
        />
        <form onSubmit={onSubmit} className="space-y-4 px-5 py-4">
          {/* Audio source toggle */}
          <div>
            <span className="mb-1.5 block text-sm font-medium text-slate-700">
              Audio source
            </span>
            <div className="inline-flex rounded-lg border border-slate-300 p-0.5 text-sm">
              <button
                type="button"
                onClick={() => setAudioSource("upload")}
                className={[
                  "rounded-md px-3 py-1.5 font-medium transition",
                  audioSource === "upload"
                    ? "bg-brand-600 text-white"
                    : "text-slate-600 hover:bg-slate-100",
                ].join(" ")}
              >
                Upload MP3
              </button>
              <button
                type="button"
                onClick={() => setAudioSource("existing")}
                className={[
                  "rounded-md px-3 py-1.5 font-medium transition",
                  audioSource === "existing"
                    ? "bg-brand-600 text-white"
                    : "text-slate-600 hover:bg-slate-100",
                ].join(" ")}
              >
                Use existing recording
              </button>
            </div>
          </div>

          {audioSource === "upload" ? (
            <div>
              <label
                htmlFor="ann-file"
                className="mb-1.5 block text-sm font-medium text-slate-700"
              >
                MP3 file <span className="text-red-600">*</span>
              </label>
              <div className="flex flex-wrap items-center gap-3">
                <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50 focus-within:ring-2 focus-within:ring-brand-500">
                  <span aria-hidden>📁</span>
                  Choose MP3
                  <input
                    id="ann-file"
                    ref={fileInputRef}
                    type="file"
                    accept=".mp3,audio/mpeg"
                    onChange={onPick}
                    className="sr-only"
                  />
                </label>
                {selectedFile ? (
                  <span className="text-sm text-slate-600">
                    {selectedFile.name}{" "}
                    <span className="text-slate-400">
                      ({formatBytes(selectedFile.size)})
                    </span>
                  </span>
                ) : (
                  <span className="text-sm text-slate-400">
                    No file selected
                  </span>
                )}
              </div>
            </div>
          ) : (
            <div>
              <label
                htmlFor="ann-audio-id"
                className="mb-1.5 block text-sm font-medium text-slate-700"
              >
                Existing recording <span className="text-red-600">*</span>
              </label>
              <select
                id="ann-audio-id"
                value={audioId}
                onChange={(e) => setAudioId(e.target.value)}
                className="block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-200 sm:max-w-md"
              >
                <option value="">Select a recording…</option>
                {existingAudios.map((a) => (
                  <option key={a.id} value={a.id}>
                    {(a.label || a.filename) +
                      ` · v${a.version} · ${a.kind || "AZAN"}`}
                  </option>
                ))}
              </select>
              {existingAudios.length === 0 && (
                <p className="mt-1 text-xs text-slate-400">
                  No recordings in the library yet — upload one instead.
                </p>
              )}
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label
                htmlFor="ann-when"
                className="mb-1.5 block text-sm font-medium text-slate-700"
              >
                Scheduled time <span className="text-red-600">*</span>
              </label>
              <input
                id="ann-when"
                type="datetime-local"
                value={scheduledLocal}
                onChange={(e) => setScheduledLocal(e.target.value)}
                className="block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 shadow-sm outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-200"
              />
              <p className="mt-1 text-xs text-slate-400">
                Uses your device&apos;s local timezone. Must be in the future.
              </p>
            </div>
            <div>
              <label
                htmlFor="ann-label"
                className="mb-1.5 block text-sm font-medium text-slate-700"
              >
                Label{" "}
                <span className="font-normal text-slate-400">(optional)</span>
              </label>
              <input
                id="ann-label"
                type="text"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="e.g. Eid Jama'at notice"
                className="block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 shadow-sm outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-200"
              />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Toggle
              label="Announcement enabled"
              checked={enabled}
              onChange={setEnabled}
            />
            <span className="text-sm text-slate-700">
              Enabled
              <span className="ml-1 text-xs text-slate-400">
                (only future, enabled announcements reach devices)
              </span>
            </span>
          </div>

          <div className="rounded-lg border border-gold-200 bg-gold-50 px-4 py-3 text-sm text-gold-800">
            Creating an announcement <span className="font-semibold">
              auto-publishes
            </span>{" "}
            a new schedule version and notifies every device so it can arm an
            exact alarm for the scheduled time.
          </div>

          <div className="flex justify-end">
            <Button type="submit" loading={submitting}>
              {submitting ? "Scheduling" : "Schedule announcement"}
            </Button>
          </div>
        </form>
      </Card>

      {loading ? (
        <Spinner label="Loading announcements" />
      ) : error ? (
        <ErrorState message={error} onRetry={load} />
      ) : (
        <Card>
          <CardHeader
            title="Scheduled announcements"
            description={`${list.length} announcement${list.length === 1 ? "" : "s"} · newest first`}
          />
          {list.length === 0 ? (
            <EmptyState
              icon="📢"
              title="No announcements yet"
              description="Schedule an audio broadcast above — it will play once on every device at the chosen time."
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-100 text-sm">
                <thead>
                  <tr className="text-left text-xs font-medium uppercase tracking-wide text-slate-400">
                    <th className="px-5 py-3">Label</th>
                    <th className="px-5 py-3">Scheduled</th>
                    <th className="px-5 py-3">Status</th>
                    <th className="px-5 py-3">Audio</th>
                    <th className="px-5 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {list.map((a) => {
                    const busy = busyId === a.id;
                    const past = new Date(a.scheduledAt).getTime() <= Date.now();
                    return (
                      <tr key={a.id}>
                        <td className="px-5 py-3 font-medium text-slate-800">
                          {a.label || (
                            <span className="text-slate-400">Untitled</span>
                          )}
                        </td>
                        <td className="px-5 py-3 text-slate-600">
                          {formatDateTime(a.scheduledAt)}
                          {past && (
                            <span className="ml-2 text-xs text-slate-400">
                              (past)
                            </span>
                          )}
                        </td>
                        <td className="px-5 py-3">
                          {a.enabled ? (
                            <Badge tone="success">Enabled</Badge>
                          ) : (
                            <Badge tone="neutral">Disabled</Badge>
                          )}
                        </td>
                        <td className="px-5 py-3">
                          {a.audio?.version != null ? (
                            <div className="flex flex-col gap-1">
                              <span className="text-slate-600">
                                {a.audio.label || `v${a.audio.version}`}
                              </span>
                              <audio
                                controls
                                preload="none"
                                className="h-8 max-w-[220px]"
                                src={mediaUrl(`/audio/${a.audio.version}/file`)}
                              />
                            </div>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </td>
                        <td className="px-5 py-3">
                          <div className="flex items-center justify-end gap-3">
                            <div className="flex items-center gap-2">
                              <Toggle
                                label={`Toggle ${a.label || "announcement"}`}
                                checked={a.enabled}
                                disabled={busy}
                                onChange={(v) => toggleEnabled(a, v)}
                              />
                            </div>
                            <Button
                              variant="danger"
                              onClick={() => setConfirmDeleteId(a.id)}
                              disabled={busy}
                              className="px-3 py-1.5"
                            >
                              Delete
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      <ConfirmDialog
        open={confirmCreate}
        title="Schedule & publish announcement?"
        message={`This creates the announcement for ${
          scheduledLocal
            ? formatDateTime(localInputToIso(scheduledLocal))
            : "the chosen time"
        } and immediately publishes a new schedule version, notifying every device. Continue?`}
        confirmLabel="Schedule & publish"
        loading={submitting}
        onConfirm={doCreate}
        onCancel={() => !submitting && setConfirmCreate(false)}
      />

      <ConfirmDialog
        open={confirmDeleteId != null}
        title="Delete announcement?"
        message={`This permanently removes ${
          deleteTarget?.label ? `"${deleteTarget.label}"` : "this announcement"
        } and republishes the schedule to every device. This cannot be undone.`}
        confirmLabel="Delete"
        destructive
        loading={deleting}
        onConfirm={doDelete}
        onCancel={() => !deleting && setConfirmDeleteId(null)}
      />
    </>
  );
}
