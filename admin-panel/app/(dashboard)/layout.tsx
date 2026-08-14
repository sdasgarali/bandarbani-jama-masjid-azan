"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import { Sidebar } from "@/components/Sidebar";
import { Spinner } from "@/components/ui";

// Protects every route in the (dashboard) group: redirects to /login when
// there is no authenticated session once loading resolves.
export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { admin, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !admin) router.replace("/login");
  }, [admin, loading, router]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner label="Loading session" />
      </div>
    );
  }

  if (!admin) {
    // Redirect effect is in flight; render nothing to avoid a flash.
    return null;
  }

  return (
    <div className="flex min-h-screen flex-col lg:flex-row">
      <Sidebar />
      <main className="flex-1 overflow-x-hidden">
        <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          {children}
        </div>
      </main>
    </div>
  );
}
