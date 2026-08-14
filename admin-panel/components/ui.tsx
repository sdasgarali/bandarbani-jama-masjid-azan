"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";

// ---- Button ----

type Variant = "primary" | "secondary" | "danger" | "ghost" | "gold";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  loading?: boolean;
}

const variantClasses: Record<Variant, string> = {
  primary:
    "bg-brand-600 text-white hover:bg-brand-700 focus-visible:ring-brand-500",
  secondary:
    "bg-white text-brand-800 ring-1 ring-inset ring-brand-200 hover:bg-brand-50 focus-visible:ring-brand-500",
  danger: "bg-red-600 text-white hover:bg-red-700 focus-visible:ring-red-500",
  ghost:
    "bg-transparent text-slate-700 hover:bg-slate-100 focus-visible:ring-slate-400",
  gold: "bg-gold-500 text-gold-950 hover:bg-gold-400 focus-visible:ring-gold-500",
};

export function Button({
  variant = "primary",
  loading = false,
  disabled,
  className = "",
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      className={[
        "inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60",
        variantClasses[variant],
        className,
      ].join(" ")}
    >
      {loading && (
        <span
          aria-hidden
          className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"
        />
      )}
      {children}
    </button>
  );
}

// ---- Card ----

export function Card({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={[
        "rounded-xl border border-slate-200 bg-white shadow-card",
        className,
      ].join(" ")}
    >
      {children}
    </div>
  );
}

export function CardHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
      <div>
        <h2 className="text-base font-semibold text-slate-900">{title}</h2>
        {description && (
          <p className="mt-0.5 text-sm text-slate-500">{description}</p>
        )}
      </div>
      {action}
    </div>
  );
}

// ---- Badge ----

export function Badge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "success" | "danger" | "neutral" | "gold" | "brand";
}) {
  const tones: Record<string, string> = {
    success: "bg-brand-100 text-brand-800 ring-brand-200",
    danger: "bg-red-100 text-red-700 ring-red-200",
    neutral: "bg-slate-100 text-slate-600 ring-slate-200",
    gold: "bg-gold-100 text-gold-800 ring-gold-200",
    brand: "bg-brand-600 text-white ring-brand-700",
  };
  return (
    <span
      className={[
        "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset",
        tones[tone],
      ].join(" ")}
    >
      {children}
    </span>
  );
}

// ---- State placeholders ----

export function Spinner({ label = "Loading" }: { label?: string }) {
  return (
    <div
      role="status"
      className="flex items-center justify-center gap-3 py-12 text-slate-500"
    >
      <span
        aria-hidden
        className="h-6 w-6 animate-spin rounded-full border-2 border-brand-500 border-t-transparent"
      />
      <span className="text-sm">{label}…</span>
    </div>
  );
}

export function ErrorState({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-red-100 bg-red-50 px-6 py-10 text-center">
      <span aria-hidden className="text-2xl">
        ⚠️
      </span>
      <p className="max-w-md text-sm text-red-700">{message}</p>
      {onRetry && (
        <Button variant="secondary" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}

export function EmptyState({
  title,
  description,
  icon = "📭",
  action,
}: {
  title: string;
  description?: string;
  icon?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-12 text-center">
      <span aria-hidden className="text-3xl">
        {icon}
      </span>
      <p className="font-medium text-slate-700">{title}</p>
      {description && (
        <p className="max-w-sm text-sm text-slate-500">{description}</p>
      )}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

// ---- Toggle switch ----

export function Toggle({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={[
        "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full transition focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
        checked ? "bg-brand-600" : "bg-slate-300",
      ].join(" ")}
    >
      <span
        aria-hidden
        className={[
          "pointer-events-none inline-block h-5 w-5 translate-y-0.5 transform rounded-full bg-white shadow transition",
          checked ? "translate-x-5" : "translate-x-0.5",
        ].join(" ")}
      />
    </button>
  );
}

// ---- Stat tile ----

export function Stat({
  label,
  value,
  hint,
  icon,
  tone = "brand",
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  icon?: ReactNode;
  tone?: "brand" | "gold" | "slate";
}) {
  const tones: Record<string, string> = {
    brand: "bg-brand-50 text-brand-700",
    gold: "bg-gold-50 text-gold-700",
    slate: "bg-slate-100 text-slate-600",
  };
  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-slate-500">{label}</p>
          <p className="mt-1 text-2xl font-bold text-slate-900">{value}</p>
          {hint && <p className="mt-1 text-xs text-slate-400">{hint}</p>}
        </div>
        {icon && (
          <span
            aria-hidden
            className={["rounded-lg p-2 text-lg", tones[tone]].join(" ")}
          >
            {icon}
          </span>
        )}
      </div>
    </Card>
  );
}
