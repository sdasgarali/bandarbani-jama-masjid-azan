"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import { Spinner } from "@/components/ui";

// Entry point: route to dashboard or login once the session is resolved.
export default function Home() {
  const { admin, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    router.replace(admin ? "/dashboard" : "/login");
  }, [admin, loading, router]);

  return (
    <div className="flex min-h-screen items-center justify-center">
      <Spinner label="Starting" />
    </div>
  );
}
