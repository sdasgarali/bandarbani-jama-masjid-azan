"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  Spinner,
  Stat,
} from "@/components/ui";
import { useToast } from "@/components/Toast";
import {
  getDevices,
  sendTestAzan,
  sendTestNotification,
} from "@/lib/services";
import { ApiRequestError } from "@/lib/api";
import { formatDateTime, timeAgo } from "@/lib/format";
import type { Device } from "@/lib/types";

export default function DevicesPage() {
  const toast = useToast();
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sendingNotif, setSendingNotif] = useState(false);
  const [sendingAzan, setSendingAzan] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getDevices();
      setDevices(data);
      // Drop selections that no longer exist.
      setSelected((prev) => {
        const ids = new Set(data.map((d) => d.deviceId));
        return new Set([...prev].filter((id) => ids.has(id)));
      });
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

  const activeCount = useMemo(
    () => devices.filter((d) => d.status === "ACTIVE").length,
    [devices]
  );

  const allSelected = devices.length > 0 && selected.size === devices.length;
  const someSelected = selected.size > 0 && !allSelected;

  function toggleAll() {
    setSelected(
      allSelected ? new Set() : new Set(devices.map((d) => d.deviceId))
    );
  }

  function toggleOne(deviceId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(deviceId)) next.delete(deviceId);
      else next.add(deviceId);
      return next;
    });
  }

  const targetIds = selected.size > 0 ? [...selected] : undefined;
  const targetLabel =
    selected.size > 0 ? `${selected.size} selected device${selected.size === 1 ? "" : "s"}` : "all devices";

  async function handleTestNotification() {
    setSendingNotif(true);
    try {
      await sendTestNotification(targetIds);
      toast.success(`Test notification sent to ${targetLabel}.`);
    } catch (e) {
      toast.error(
        e instanceof ApiRequestError
          ? e.message
          : "Failed to send test notification."
      );
    } finally {
      setSendingNotif(false);
    }
  }

  async function handleTestAzan() {
    setSendingAzan(true);
    try {
      await sendTestAzan(targetIds);
      toast.success(`Test Azan triggered on ${targetLabel}.`);
    } catch (e) {
      toast.error(
        e instanceof ApiRequestError ? e.message : "Failed to trigger test Azan."
      );
    } finally {
      setSendingAzan(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Devices"
        description="Registered Android installs and remote test actions"
        action={
          <Button variant="secondary" onClick={load}>
            Refresh
          </Button>
        }
      />

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Stat label="Total devices" value={devices.length} icon="📱" />
        <Stat
          label="Active"
          value={activeCount}
          icon="✅"
          tone="brand"
          hint="Recently synced"
        />
        <Stat
          label="Inactive"
          value={devices.length - activeCount}
          icon="💤"
          tone="slate"
        />
      </div>

      {/* Action bar */}
      <Card className="mb-4">
        <div className="flex flex-wrap items-center gap-3 px-5 py-4">
          <p className="text-sm text-slate-600">
            Target:{" "}
            <span className="font-semibold text-slate-900">{targetLabel}</span>
          </p>
          <div className="ml-auto flex flex-wrap gap-2">
            <Button
              variant="secondary"
              onClick={handleTestNotification}
              loading={sendingNotif}
              disabled={devices.length === 0}
            >
              🔔 Send test notification
            </Button>
            <Button
              variant="gold"
              onClick={handleTestAzan}
              loading={sendingAzan}
              disabled={devices.length === 0}
            >
              📣 Trigger test Azan
            </Button>
          </div>
        </div>
      </Card>

      {loading ? (
        <Spinner label="Loading devices" />
      ) : error ? (
        <ErrorState message={error} onRetry={load} />
      ) : devices.length === 0 ? (
        <Card>
          <EmptyState
            icon="📭"
            title="No devices registered yet"
            description="Devices appear here after the Android app registers on first run."
          />
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-100 text-sm">
              <thead className="bg-slate-50">
                <tr className="text-left text-xs font-medium uppercase tracking-wide text-slate-500">
                  <th className="px-4 py-3">
                    <input
                      type="checkbox"
                      aria-label="Select all devices"
                      checked={allSelected}
                      ref={(el) => {
                        if (el) el.indeterminate = someSelected;
                      }}
                      onChange={toggleAll}
                      className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                    />
                  </th>
                  <th className="px-4 py-3">Device</th>
                  <th className="px-4 py-3">Model</th>
                  <th className="px-4 py-3">App</th>
                  <th className="px-4 py-3">Android</th>
                  <th className="px-4 py-3">Timezone</th>
                  <th className="px-4 py-3">Last sync</th>
                  <th className="px-4 py-3">Last active</th>
                  <th className="px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {devices.map((d) => {
                  const checked = selected.has(d.deviceId);
                  return (
                    <tr
                      key={d.id || d.deviceId}
                      className={checked ? "bg-brand-50/50" : "hover:bg-slate-50"}
                    >
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          aria-label={`Select device ${d.deviceId}`}
                          checked={checked}
                          onChange={() => toggleOne(d.deviceId)}
                          className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                        />
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className="block max-w-[160px] truncate font-mono text-xs text-slate-600"
                          title={d.deviceId}
                        >
                          {d.deviceId}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-700">
                        {d.model || "—"}
                      </td>
                      <td className="px-4 py-3 text-slate-700">
                        {d.appVersion || "—"}
                      </td>
                      <td className="px-4 py-3 text-slate-700">
                        {d.androidVersion ?? "—"}
                      </td>
                      <td className="px-4 py-3 text-slate-500">{d.timezone}</td>
                      <td
                        className="px-4 py-3 text-slate-500"
                        title={formatDateTime(d.lastSyncAt)}
                      >
                        {timeAgo(d.lastSyncAt)}
                      </td>
                      <td
                        className="px-4 py-3 text-slate-500"
                        title={formatDateTime(d.lastActiveAt)}
                      >
                        {timeAgo(d.lastActiveAt)}
                      </td>
                      <td className="px-4 py-3">
                        {d.status === "ACTIVE" ? (
                          <Badge tone="success">Active</Badge>
                        ) : (
                          <Badge tone="danger">Inactive</Badge>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </>
  );
}
