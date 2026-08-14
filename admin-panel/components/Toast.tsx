"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

type ToastKind = "success" | "error" | "info";

interface Toast {
  id: number;
  kind: ToastKind;
  message: string;
}

interface ToastContextValue {
  push: (kind: ToastKind, message: string) => void;
  success: (message: string) => void;
  error: (message: string) => void;
  info: (message: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

let nextId = 1;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const remove = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const push = useCallback(
    (kind: ToastKind, message: string) => {
      const id = nextId++;
      setToasts((prev) => [...prev, { id, kind, message }]);
      setTimeout(() => remove(id), 4500);
    },
    [remove]
  );

  const value = useMemo<ToastContextValue>(
    () => ({
      push,
      success: (m) => push("success", m),
      error: (m) => push("error", m),
      info: (m) => push("info", m),
    }),
    [push]
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        aria-live="polite"
        aria-atomic="true"
        className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex flex-col items-center gap-2 px-4 sm:bottom-6 sm:right-6 sm:left-auto sm:items-end"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            role="status"
            className={[
              "pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-lg px-4 py-3 text-sm shadow-card-hover ring-1 ring-black/5",
              t.kind === "success" && "bg-brand-600 text-white",
              t.kind === "error" && "bg-red-600 text-white",
              t.kind === "info" && "bg-slate-800 text-white",
            ]
              .filter(Boolean)
              .join(" ")}
          >
            <span aria-hidden className="mt-0.5 shrink-0">
              {t.kind === "success" ? "✓" : t.kind === "error" ? "!" : "i"}
            </span>
            <span className="flex-1">{t.message}</span>
            <button
              type="button"
              onClick={() => remove(t.id)}
              aria-label="Dismiss notification"
              className="shrink-0 rounded p-0.5 opacity-80 hover:opacity-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
            >
              ✕
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}
