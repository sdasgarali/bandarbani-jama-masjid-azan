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
} from "@/components/ui";
import { useToast } from "@/components/Toast";
import {
  getLatestVersion,
  listAppReleases,
  uploadAppRelease,
} from "@/lib/services";
import { ApiRequestError } from "@/lib/api";
import { formatBytes, formatDateTime } from "@/lib/format";
import type { AppRelease, LatestVersion } from "@/lib/types";

const MAX_MB = 100;

export default function UpdatesPage() {
  const toast = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [releases, setReleases] = useState<AppRelease[]>([]);
  const [latest, setLatest] = useState<LatestVersion | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  // Form state
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [versionCode, setVersionCode] = useState("");
  const [versionName, setVersionName] = useState("");
  const [notes, setNotes] = useState("");
  const [mandatory, setMandatory] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Fetch the list first (admin) and the latest version (public). A 404 on the
      // latest-version endpoint simply means no releases exist yet — not an error.
      const [list, latestVersion] = await Promise.all([
        listAppReleases(),
        getLatestVersion().catch((e) => {
          if (e instanceof ApiRequestError && e.status === 404) return null;
          throw e;
        }),
      ]);
      setReleases(
        [...list].sort((a, b) => b.versionCode - a.versionCode)
      );
      setLatest(latestVersion);
    } catch (e) {
      setError(
        e instanceof ApiRequestError
          ? e.message
          : "Unable to load app releases. The backend may be offline — check the API connection and try again."
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function validateFile(file: File): string | null {
    if (!file.name.toLowerCase().endsWith(".apk")) {
      return "Only Android APK files (.apk) are allowed.";
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
    setSelectedFile(null);
    setVersionCode("");
    setVersionName("");
    setNotes("");
    setMandatory(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (uploading) return;

    // Client-side validation.
    if (!selectedFile) {
      toast.error("Choose a signed APK file to upload.");
      return;
    }
    const fileErr = validateFile(selectedFile);
    if (fileErr) {
      toast.error(fileErr);
      return;
    }
    const codeNum = Number(versionCode);
    if (!Number.isInteger(codeNum) || codeNum <= 0) {
      toast.error("Version code must be a whole number greater than 0.");
      return;
    }
    if (!versionName.trim()) {
      toast.error("Version name is required.");
      return;
    }

    // Confirm before publishing a mandatory (non-dismissible) update.
    if (mandatory) {
      const ok = window.confirm(
        `Publish version ${versionName.trim()} (${codeNum}) as a MANDATORY update?\n\n` +
          "Devices will be forced to update and cannot dismiss the prompt."
      );
      if (!ok) return;
    }

    const form = new FormData();
    form.append("apk", selectedFile);
    form.append("versionCode", String(codeNum));
    form.append("versionName", versionName.trim());
    if (notes.trim()) form.append("notes", notes.trim());
    form.append("mandatory", mandatory ? "true" : "false");

    setUploading(true);
    try {
      const created = await uploadAppRelease(form);
      toast.success(
        `Uploaded ${created.versionName} (versionCode ${created.versionCode}). Devices will be prompted to update.`
      );
      resetForm();
      await load();
    } catch (e) {
      toast.error(
        e instanceof ApiRequestError ? e.message : "Upload failed. Please try again."
      );
    } finally {
      setUploading(false);
    }
  }

  return (
    <>
      <PageHeader
        title="App Updates"
        description="Upload signed APK releases for in-app auto-updates"
        action={
          <Button variant="secondary" onClick={load}>
            Refresh
          </Button>
        }
      />

      {/* Upload form */}
      <Card className="mb-6">
        <CardHeader
          title="Upload a new release"
          description={`APK only · max ${MAX_MB} MB. A higher versionCode prompts devices to update.`}
        />
        <form onSubmit={onSubmit} className="space-y-4 px-5 py-4">
          <div>
            <label
              htmlFor="apk-file"
              className="mb-1.5 block text-sm font-medium text-slate-700"
            >
              APK file <span className="text-red-600">*</span>
            </label>
            <div className="flex flex-wrap items-center gap-3">
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50 focus-within:ring-2 focus-within:ring-brand-500">
                <span aria-hidden>📁</span>
                Choose APK
                <input
                  id="apk-file"
                  ref={fileInputRef}
                  type="file"
                  accept=".apk"
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
                <span className="text-sm text-slate-400">No file selected</span>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label
                htmlFor="version-code"
                className="mb-1.5 block text-sm font-medium text-slate-700"
              >
                Version code <span className="text-red-600">*</span>
              </label>
              <input
                id="version-code"
                type="number"
                inputMode="numeric"
                min={1}
                step={1}
                required
                value={versionCode}
                onChange={(e) => setVersionCode(e.target.value)}
                placeholder="e.g. 3"
                className="block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
              <p className="mt-1 text-xs text-slate-400">
                Integer, must be higher than the current release.
              </p>
            </div>
            <div>
              <label
                htmlFor="version-name"
                className="mb-1.5 block text-sm font-medium text-slate-700"
              >
                Version name <span className="text-red-600">*</span>
              </label>
              <input
                id="version-name"
                type="text"
                required
                value={versionName}
                onChange={(e) => setVersionName(e.target.value)}
                placeholder="e.g. 1.2.0"
                className="block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
              <p className="mt-1 text-xs text-slate-400">
                Human-readable label shown to users.
              </p>
            </div>
          </div>

          <div>
            <label
              htmlFor="notes"
              className="mb-1.5 block text-sm font-medium text-slate-700"
            >
              Release notes{" "}
              <span className="font-normal text-slate-400">(optional)</span>
            </label>
            <textarea
              id="notes"
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="What changed in this release?"
              className="block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>

          <div className="flex items-start gap-2">
            <input
              id="mandatory"
              type="checkbox"
              checked={mandatory}
              onChange={(e) => setMandatory(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
            />
            <label htmlFor="mandatory" className="text-sm text-slate-700">
              <span className="font-medium">Mandatory update</span>
              <span className="block text-xs text-slate-400">
                Forces devices to update — the prompt cannot be dismissed.
              </span>
            </label>
          </div>

          <div className="rounded-lg border border-gold-200 bg-gold-50 px-4 py-3 text-sm text-gold-800">
            <p>
              Upload a new signed APK with a{" "}
              <span className="font-semibold">higher versionCode</span>. Devices will
              be prompted to update. The APK must be signed with the{" "}
              <span className="font-semibold">same keystore</span> as the installed
              app, or Android will reject the update.
            </p>
          </div>

          <div className="flex justify-end">
            <Button type="submit" loading={uploading} disabled={!selectedFile}>
              {uploading ? "Uploading" : "Upload release"}
            </Button>
          </div>
        </form>
      </Card>

      {loading ? (
        <Spinner label="Loading releases" />
      ) : error ? (
        <ErrorState message={error} onRetry={load} />
      ) : (
        <>
          {/* Current latest version */}
          <Card className="mb-6">
            <CardHeader
              title="Current latest version"
              description="What devices see when they check for updates"
              action={
                latest?.mandatory ? (
                  <Badge tone="danger">Mandatory</Badge>
                ) : latest ? (
                  <Badge tone="success">Optional</Badge>
                ) : undefined
              }
            />
            {latest ? (
              <div className="grid grid-cols-2 gap-4 px-5 py-4 text-sm sm:grid-cols-4">
                <Meta
                  label="Version"
                  value={`${latest.versionName} (${latest.versionCode})`}
                />
                <Meta label="Size" value={formatBytes(latest.sizeBytes)} />
                <Meta
                  label="Mandatory"
                  value={latest.mandatory ? "Yes" : "No"}
                />
                <Meta
                  label="Latest release"
                  value={
                    releases.find(
                      (r) => r.versionCode === latest.versionCode
                    )?.createdAt
                      ? formatDateTime(
                          releases.find(
                            (r) => r.versionCode === latest.versionCode
                          )?.createdAt
                        )
                      : "—"
                  }
                />
                {latest.notes ? (
                  <div className="col-span-2 sm:col-span-4">
                    <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
                      Notes
                    </p>
                    <p className="mt-0.5 whitespace-pre-wrap text-sm text-slate-800">
                      {latest.notes}
                    </p>
                  </div>
                ) : null}
              </div>
            ) : (
              <EmptyState
                icon="📦"
                title="No releases yet"
                description="Upload a signed APK above to publish the first release for auto-updates."
              />
            )}
          </Card>

          {/* Releases table */}
          <Card>
            <CardHeader
              title="All releases"
              description={`${releases.length} release${releases.length === 1 ? "" : "s"} · newest first`}
            />
            {releases.length === 0 ? (
              <EmptyState
                icon="🗂️"
                title="No releases uploaded"
                description="Uploaded APK releases will appear here."
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-100 text-sm">
                  <thead>
                    <tr className="text-left text-xs font-medium uppercase tracking-wide text-slate-400">
                      <th className="px-5 py-3">Version code</th>
                      <th className="px-5 py-3">Version name</th>
                      <th className="px-5 py-3">Size</th>
                      <th className="px-5 py-3">Mandatory</th>
                      <th className="px-5 py-3">Uploaded</th>
                      <th className="px-5 py-3">Notes</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {releases.map((r) => (
                      <tr key={r.id || r.versionCode}>
                        <td className="px-5 py-3">
                          <Badge tone="brand">{r.versionCode}</Badge>
                        </td>
                        <td className="px-5 py-3 text-slate-700">
                          {r.versionName}
                        </td>
                        <td className="px-5 py-3 text-slate-500">
                          {formatBytes(r.sizeBytes)}
                        </td>
                        <td className="px-5 py-3">
                          {r.mandatory ? (
                            <Badge tone="danger">Mandatory</Badge>
                          ) : (
                            <Badge tone="neutral">Optional</Badge>
                          )}
                        </td>
                        <td className="px-5 py-3 text-slate-500">
                          {formatDateTime(r.createdAt)}
                        </td>
                        <td className="px-5 py-3 text-slate-500">
                          <span
                            className="block max-w-[280px] truncate"
                            title={r.notes || undefined}
                          >
                            {r.notes || "—"}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </>
      )}
    </>
  );
}

function Meta({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
        {label}
      </p>
      <p
        className={[
          "mt-0.5 break-all text-slate-800",
          mono ? "font-mono text-xs" : "text-sm",
        ].join(" ")}
      >
        {value}
      </p>
    </div>
  );
}
