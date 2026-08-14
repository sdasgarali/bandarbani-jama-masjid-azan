"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import { useToast } from "@/components/Toast";
import { login } from "@/lib/services";
import { ApiRequestError } from "@/lib/api";
import { Button } from "@/components/ui";

export default function LoginPage() {
  const router = useRouter();
  const { admin, loading, setAdmin } = useAuth();
  const toast = useToast();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // If already authenticated, bounce to the dashboard.
  useEffect(() => {
    if (!loading && admin) router.replace("/dashboard");
  }, [admin, loading, router]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (!email.trim() || !password) {
      setError("Please enter both email and password.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await login(email.trim(), password);
      setAdmin(res.admin);
      toast.success(`Welcome back, ${res.admin.name || "admin"}.`);
      router.replace("/dashboard");
    } catch (err) {
      const message =
        err instanceof ApiRequestError
          ? err.code === "AUTH_INVALID"
            ? "Invalid email or password."
            : err.message
          : "Unable to reach the server. Check your connection and try again.";
      setError(message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="pattern-bg flex min-h-screen items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center text-white">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gold-500 text-3xl shadow-lg">
            <span aria-hidden>🕌</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Azan Admin Panel</h1>
          <p className="mt-1 text-sm text-brand-100">
            Sign in to manage the prayer schedule
          </p>
        </div>

        <div className="rounded-2xl bg-white p-6 shadow-card-hover sm:p-8">
          <form onSubmit={onSubmit} noValidate className="space-y-5">
            {error && (
              <div
                role="alert"
                className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
              >
                {error}
              </div>
            )}

            <div>
              <label
                htmlFor="email"
                className="mb-1.5 block text-sm font-medium text-slate-700"
              >
                Email address
              </label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="username"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm shadow-sm outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-200"
                placeholder="admin@example.com"
              />
            </div>

            <div>
              <label
                htmlFor="password"
                className="mb-1.5 block text-sm font-medium text-slate-700"
              >
                Password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm shadow-sm outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-200"
                placeholder="••••••••"
              />
            </div>

            <Button
              type="submit"
              loading={submitting}
              className="w-full py-2.5"
            >
              {submitting ? "Signing in" : "Sign in"}
            </Button>
          </form>
        </div>

        <p className="mt-6 text-center text-xs text-brand-100/80">
          Bandarbani Jama Masjid · Admin access only
        </p>
      </div>
    </main>
  );
}
