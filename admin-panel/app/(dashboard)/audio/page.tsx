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
import { getAudioList, uploadAudio } from "@/lib/services";
import { ApiRequestError, mediaUrl } from "@/lib/api";
import {
  formatBytes,
  formatDateTime,
  shortChecksum,
} from "@/lib/format";
import type { AzanAudio } from "@/lib/types";

const MAX_MB = 10;

export default function AudioPage() {
  const toast = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [list, setList] = useState<AzanAudio[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getAudioList();
      setList(data);
    } catch (e) {
      setError(
        e instanceof ApiRequestError
          ? e.message
          : "Unable to load audio. The backend may be offline — check the API connection and try again."
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function validateFile(file: File): string | null {
    if (file.type !== "audio/mpeg" && !file.name.toLowerCase().endsWith(".mp3")) {
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

  async function doUpload() {
    if (!selectedFile) return;
    setUploading(true);
    try {
      const created = await uploadAudio(selectedFile);
      toast.success(
        `Uploaded "${created.filename}" as audio v${created.version} (now active).`
      );
      setSelectedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      await load();
    } catch (e) {
      toast.error(
        e instanceof ApiRequestError
          ? e.message
          : "Upload failed. Please try again."
      );
    } finally {
      setUploading(false);
    }
  }

  const active = list.find((a) => a.isActive) ?? null;
  const previous = [...list]
    .filter((a) => !a.isActive)
    .sort((a, b) => b.version - a.version);

  return (
    <>
      <PageHeader
        title="Azan Audio"
        description="Upload and manage the Azan (Adhan) recording"
        action={
          <Button variant="secondary" onClick={load}>
            Refresh
          </Button>
        }
      />

      {/* Upload */}
      <Card className="mb-6">
        <CardHeader
          title="Upload / replace audio"
          description={`MP3 only · max ${MAX_MB} MB. Uploading sets the new file active.`}
        />
        <div className="flex flex-wrap items-center gap-3 px-5 py-4">
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50 focus-within:ring-2 focus-within:ring-brand-500">
            <span aria-hidden>📁</span>
            Choose MP3
            <input
              ref={fileInputRef}
              type="file"
              accept="audio/mpeg,.mp3"
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
          <Button
            onClick={doUpload}
            loading={uploading}
            disabled={!selectedFile}
            className="ml-auto"
          >
            {uploading ? "Uploading" : "Upload"}
          </Button>
        </div>
      </Card>

      {loading ? (
        <Spinner label="Loading audio" />
      ) : error ? (
        <ErrorState message={error} onRetry={load} />
      ) : (
        <>
          {/* Active audio */}
          <Card className="mb-6">
            <CardHeader
              title="Active audio"
              description="Currently served to all devices"
              action={active ? <Badge tone="success">Active</Badge> : undefined}
            />
            {active ? (
              <div className="space-y-4 px-5 py-4">
                <div className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
                  <Meta label="Version" value={`v${active.version}`} />
                  <Meta label="Filename" value={active.filename} />
                  <Meta label="Size" value={formatBytes(active.sizeBytes)} />
                  <Meta
                    label="Uploaded"
                    value={formatDateTime(active.createdAt)}
                  />
                  <Meta
                    label="Checksum (SHA-256)"
                    value={shortChecksum(active.checksumSha256)}
                    mono
                  />
                  <Meta label="Type" value={active.mimeType} />
                </div>
                <div>
                  <p className="mb-1.5 text-sm font-medium text-slate-700">
                    Preview
                  </p>
                  {/* Native player; streams from the audio file route (supports Range). */}
                  <audio
                    controls
                    preload="none"
                    className="w-full"
                    src={mediaUrl(`/audio/${active.version}/file`)}
                  >
                    Your browser does not support the audio element.
                  </audio>
                </div>
              </div>
            ) : (
              <EmptyState
                icon="🔇"
                title="No active audio"
                description="Upload an MP3 above to set the Azan recording devices will play."
              />
            )}
          </Card>

          {/* Previous versions */}
          <Card>
            <CardHeader
              title="Previous versions"
              description={`${previous.length} archived recording${previous.length === 1 ? "" : "s"}`}
            />
            {previous.length === 0 ? (
              <EmptyState
                icon="🗂️"
                title="No previous versions"
                description="Older recordings will appear here after you upload a replacement."
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-100 text-sm">
                  <thead>
                    <tr className="text-left text-xs font-medium uppercase tracking-wide text-slate-400">
                      <th className="px-5 py-3">Version</th>
                      <th className="px-5 py-3">Filename</th>
                      <th className="px-5 py-3">Size</th>
                      <th className="px-5 py-3">Uploaded</th>
                      <th className="px-5 py-3">Preview</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {previous.map((a) => (
                      <tr key={a.id || a.version}>
                        <td className="px-5 py-3">
                          <Badge tone="neutral">v{a.version}</Badge>
                        </td>
                        <td className="px-5 py-3 text-slate-700">
                          {a.filename}
                        </td>
                        <td className="px-5 py-3 text-slate-500">
                          {formatBytes(a.sizeBytes)}
                        </td>
                        <td className="px-5 py-3 text-slate-500">
                          {formatDateTime(a.createdAt)}
                        </td>
                        <td className="px-5 py-3">
                          <audio
                            controls
                            preload="none"
                            className="h-8 max-w-[220px]"
                            src={mediaUrl(`/audio/${a.version}/file`)}
                          />
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
