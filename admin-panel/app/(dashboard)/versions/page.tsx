"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import {
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  ErrorState,
  Spinner,
  Stat,
} from "@/components/ui";
import { getDevices } from "@/lib/services";
import { ApiRequestError } from "@/lib/api";
import type { Device } from "@/lib/types";

interface VersionRow {
  version: string;
  total: number;
  active: number;
}

export default function VersionsPage() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setDevices(await getDevices());
    } catch (e) {
      setError(
        e instanceof ApiRequestError
          ? e.message
          : "Unable to load devices. The backend may be offline — check the API connection and try again."
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const rows = useMemo<VersionRow[]>(() => {
    const map = new Map<string, VersionRow>();
    for (const d of devices) {
      const v = d.appVersion || "unknown";
      const row = map.get(v) || { version: v, total: 0, active: 0 };
      row.total += 1;
      if (d.status === "ACTIVE") row.active += 1;
      map.set(v, row);
    }
    // Sort by install count desc, then version label.
    return [...map.values()].sort(
      (a, b) => b.total - a.total || a.version.localeCompare(b.version)
    );
  }, [devices]);

  const distinctCount = rows.length;
  const maxTotal = rows.reduce((m, r) => Math.max(m, r.total), 0) || 1;

  return (
    <>
      <PageHeader
        title="App Versions"
        description="Distribution of installed app versions across devices"
        action={
          <Button variant="secondary" onClick={load}>
            Refresh
          </Button>
        }
      />

      {loading ? (
        <Spinner label="Loading versions" />
      ) : error ? (
        <ErrorState message={error} onRetry={load} />
      ) : (
        <>
          <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Stat
              label="Distinct versions"
              value={distinctCount}
              icon="🏷️"
              tone="gold"
            />
            <Stat label="Total devices" value={devices.length} icon="📱" />
          </div>

          <Card>
            <CardHeader
              title="Version breakdown"
              description="Derived from registered devices"
            />
            {rows.length === 0 ? (
              <EmptyState
                icon="🏷️"
                title="No version data"
                description="Once devices register, their app versions appear here."
              />
            ) : (
              <ul className="divide-y divide-slate-100">
                {rows.map((r) => (
                  <li key={r.version} className="px-5 py-4">
                    <div className="mb-2 flex items-center justify-between">
                      <span className="flex items-center gap-2">
                        <Badge tone="brand">{r.version}</Badge>
                        <span className="text-sm text-slate-500">
                          {r.active} active / {r.total} total
                        </span>
                      </span>
                      <span className="text-sm font-semibold text-slate-900">
                        {Math.round((r.total / devices.length) * 100)}%
                      </span>
                    </div>
                    <div
                      className="h-2 w-full overflow-hidden rounded-full bg-slate-100"
                      role="progressbar"
                      aria-valuenow={r.total}
                      aria-valuemin={0}
                      aria-valuemax={devices.length}
                      aria-label={`${r.version}: ${r.total} of ${devices.length} devices`}
                    >
                      <div
                        className="h-full rounded-full bg-brand-500"
                        style={{ width: `${(r.total / maxTotal) * 100}%` }}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </>
      )}
    </>
  );
}
