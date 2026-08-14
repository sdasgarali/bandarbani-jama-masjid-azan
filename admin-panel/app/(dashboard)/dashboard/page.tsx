"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { PageHeader } from "@/components/PageHeader";
import { Button, Card, ErrorState, Spinner, Stat, Badge } from "@/components/ui";
import {
  getAudioList,
  getDevices,
  getSchedule,
  getScheduleVersions,
} from "@/lib/services";
import { ApiRequestError } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import type {
  AzanAudio,
  Device,
  Schedule,
  ScheduleVersion,
} from "@/lib/types";

interface Overview {
  schedule: Schedule | null;
  versions: ScheduleVersion[];
  audio: AzanAudio[];
  devices: Device[];
}

export default function DashboardPage() {
  const [data, setData] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    // Fetch all four in parallel; tolerate individual failures so one dead
    // endpoint doesn't blank the whole dashboard.
    const [scheduleR, versionsR, audioR, devicesR] = await Promise.allSettled([
      getSchedule(),
      getScheduleVersions(),
      getAudioList(),
      getDevices(),
    ]);

    const anyAuthError = [scheduleR, versionsR, audioR, devicesR].some(
      (r) =>
        r.status === "rejected" &&
        r.reason instanceof ApiRequestError &&
        r.reason.status === 401
    );
    if (anyAuthError) {
      setError("Your session has expired. Please sign in again.");
      setLoading(false);
      return;
    }

    const allRejected = [scheduleR, versionsR, audioR, devicesR].every(
      (r) => r.status === "rejected"
    );
    if (allRejected) {
      setError(
        "Unable to load dashboard data. The backend may be offline — check the API connection and try again."
      );
      setLoading(false);
      return;
    }

    setData({
      schedule: scheduleR.status === "fulfilled" ? scheduleR.value : null,
      versions: versionsR.status === "fulfilled" ? versionsR.value : [],
      audio: audioR.status === "fulfilled" ? audioR.value : [],
      devices: devicesR.status === "fulfilled" ? devicesR.value : [],
    });
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return (
      <>
        <PageHeader
          title="Dashboard"
          description="Overview of your Azan system"
        />
        <Spinner label="Loading dashboard" />
      </>
    );
  }

  if (error) {
    return (
      <>
        <PageHeader
          title="Dashboard"
          description="Overview of your Azan system"
        />
        <ErrorState message={error} onRetry={load} />
      </>
    );
  }

  const devices = data?.devices ?? [];
  const activeDevices = devices.filter((d) => d.status === "ACTIVE").length;
  const inactiveDevices = devices.length - activeDevices;
  const activeAudio = data?.audio.find((a) => a.isActive) ?? null;
  const latestVersion =
    data?.versions && data.versions.length
      ? [...data.versions].sort((a, b) => b.version - a.version)[0]
      : null;
  const schedule = data?.schedule ?? null;

  return (
    <>
      <PageHeader
        title="Dashboard"
        description="Overview of your Azan system"
        action={
          <Button variant="secondary" onClick={load}>
            Refresh
          </Button>
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat
          label="Total devices"
          value={devices.length}
          hint={`${activeDevices} active · ${inactiveDevices} inactive`}
          icon="📱"
        />
        <Stat
          label="Active devices"
          value={activeDevices}
          hint={
            devices.length
              ? `${Math.round((activeDevices / devices.length) * 100)}% online`
              : "No devices yet"
          }
          icon="✅"
          tone="brand"
        />
        <Stat
          label="Schedule version"
          value={
            schedule ? `v${schedule.currentVersion}` : latestVersion ? `v${latestVersion.version}` : "—"
          }
          hint={
            schedule?.isPublished ? "Published" : "Draft not yet published"
          }
          icon="🕐"
          tone="gold"
        />
        <Stat
          label="Active audio"
          value={activeAudio ? `v${activeAudio.version}` : "—"}
          hint={activeAudio ? activeAudio.filename : "No audio uploaded"}
          icon="🔊"
          tone="slate"
        />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card className="p-5">
          <h2 className="mb-4 text-base font-semibold text-slate-900">
            Publish status
          </h2>
          <dl className="space-y-3 text-sm">
            <div className="flex items-center justify-between">
              <dt className="text-slate-500">Current version</dt>
              <dd className="font-medium text-slate-900">
                {schedule ? `v${schedule.currentVersion}` : "—"}
              </dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-slate-500">State</dt>
              <dd>
                {schedule?.isPublished ? (
                  <Badge tone="success">Published</Badge>
                ) : (
                  <Badge tone="gold">Draft</Badge>
                )}
              </dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-slate-500">Last publish</dt>
              <dd className="font-medium text-slate-900">
                {formatDateTime(latestVersion?.publishedAt)}
              </dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-slate-500">Timezone</dt>
              <dd className="font-medium text-slate-900">
                {schedule?.timezone || "—"}
              </dd>
            </div>
          </dl>
          <div className="mt-5">
            <Link href="/schedule">
              <Button variant="secondary" className="w-full">
                Open schedule editor
              </Button>
            </Link>
          </div>
        </Card>

        <Card className="p-5">
          <h2 className="mb-4 text-base font-semibold text-slate-900">
            Quick actions
          </h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Link href="/audio">
              <Button variant="secondary" className="w-full">
                🔊 Manage audio
              </Button>
            </Link>
            <Link href="/devices">
              <Button variant="secondary" className="w-full">
                📱 View devices
              </Button>
            </Link>
            <Link href="/versions">
              <Button variant="secondary" className="w-full">
                🏷️ App versions
              </Button>
            </Link>
            <Link href="/schedule">
              <Button variant="gold" className="w-full">
                🚀 Publish schedule
              </Button>
            </Link>
          </div>
          <p className="mt-4 text-xs text-slate-400">
            Publishing snapshots the current draft into a new version and
            notifies every registered device.
          </p>
        </Card>
      </div>
    </>
  );
}
