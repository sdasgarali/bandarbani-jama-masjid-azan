"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { useToast } from "@/components/Toast";

interface NavItem {
  href: string;
  label: string;
  icon: string;
}

const NAV: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: "🏠" },
  { href: "/schedule", label: "Schedule", icon: "🕐" },
  { href: "/audio", label: "Azan Audio", icon: "🔊" },
  { href: "/announcements", label: "Announcements", icon: "📢" },
  { href: "/devices", label: "Devices", icon: "📱" },
  { href: "/versions", label: "App Versions", icon: "🏷️" },
  { href: "/updates", label: "App Updates", icon: "⬆️" },
];

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { admin, logout } = useAuth();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  async function handleLogout() {
    setLoggingOut(true);
    try {
      await logout();
      toast.info("You have been signed out.");
      router.replace("/login");
    } finally {
      setLoggingOut(false);
    }
  }

  const navList = (
    <nav className="flex-1 space-y-1 px-3 py-4" aria-label="Main navigation">
      {NAV.map((item) => {
        const active =
          pathname === item.href || pathname.startsWith(item.href + "/");
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={() => setOpen(false)}
            aria-current={active ? "page" : undefined}
            className={[
              "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition",
              active
                ? "bg-brand-700 text-white"
                : "text-brand-100 hover:bg-brand-800/60 hover:text-white",
            ].join(" ")}
          >
            <span aria-hidden className="text-base">
              {item.icon}
            </span>
            {item.label}
          </Link>
        );
      })}
    </nav>
  );

  const sidebarInner = (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 px-5 py-5">
        <span
          aria-hidden
          className="flex h-9 w-9 items-center justify-center rounded-lg bg-gold-500 text-xl"
        >
          🕌
        </span>
        <div className="leading-tight">
          <p className="text-sm font-bold text-white">Azan Admin</p>
          <p className="text-xs text-brand-200">Prayer control</p>
        </div>
      </div>

      {navList}

      <div className="border-t border-brand-800 px-3 py-4">
        <div className="mb-2 px-2">
          <p className="truncate text-sm font-medium text-white">
            {admin?.name || "Administrator"}
          </p>
          <p className="truncate text-xs text-brand-200">{admin?.email}</p>
        </div>
        <button
          type="button"
          onClick={handleLogout}
          disabled={loggingOut}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-brand-100 transition hover:bg-brand-800/60 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-gold-400 disabled:opacity-60"
        >
          <span aria-hidden>↩</span>
          {loggingOut ? "Signing out…" : "Sign out"}
        </button>
      </div>
    </div>
  );

  return (
    <>
      {/* Mobile top bar */}
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3 lg:hidden">
        <div className="flex items-center gap-2">
          <span aria-hidden className="text-xl">
            🕌
          </span>
          <span className="font-bold text-brand-800">Azan Admin</span>
        </div>
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Open navigation menu"
          className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
        >
          ☰
        </button>
      </header>

      {/* Desktop sidebar */}
      <aside className="hidden w-64 shrink-0 bg-brand-900 lg:block">
        {sidebarInner}
      </aside>

      {/* Mobile drawer */}
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setOpen(false)}
            aria-hidden
          />
          <aside className="absolute left-0 top-0 h-full w-64 bg-brand-900 shadow-xl">
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close navigation menu"
              className="absolute right-3 top-3 rounded-lg p-2 text-brand-100 hover:bg-brand-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-gold-400"
            >
              ✕
            </button>
            {sidebarInner}
          </aside>
        </div>
      )}
    </>
  );
}
