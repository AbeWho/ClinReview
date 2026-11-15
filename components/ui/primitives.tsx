import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "./cn";

export const buttonClasses = (variant: "primary" | "secondary" | "ghost" | "danger" = "secondary", size: "sm" | "md" = "md") =>
  cn(
    "inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60 whitespace-nowrap",
    size === "sm" ? "px-2.5 py-1.5 text-xs" : "px-3.5 py-2 text-sm",
    variant === "primary" && "bg-brand text-white hover:bg-brand-dark shadow-sm",
    variant === "secondary" && "border border-line bg-white text-ink hover:bg-canvas",
    variant === "ghost" && "text-ink-2 hover:bg-canvas hover:text-ink",
    variant === "danger" && "border border-danger/30 bg-white text-danger hover:bg-danger-pale",
  );

export function ButtonLink({ href, variant, size, className, ...rest }: ComponentProps<typeof Link> & { variant?: Parameters<typeof buttonClasses>[0]; size?: "sm" | "md" }) {
  return <Link href={href} className={cn(buttonClasses(variant, size), className)} {...rest} />;
}

export function Card({ className, children, ...rest }: ComponentProps<"section">) {
  return (
    <section className={cn("rounded-xl border border-line bg-white shadow-[var(--shadow-card)]", className)} {...rest}>
      {children}
    </section>
  );
}

export function CardHeader({ title, icon, actions, subtitle, as: H = "h2" }: { title: ReactNode; icon?: ReactNode; actions?: ReactNode; subtitle?: ReactNode; as?: "h2" | "h3" }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-2 border-b border-line px-4 py-3">
      <div className="min-w-0">
        <H className="flex items-center gap-2 text-[15px] font-semibold text-ink">
          {icon && <span className="text-brand" aria-hidden>{icon}</span>}
          {title}
        </H>
        {subtitle && <p className="mt-0.5 text-xs text-ink-2">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function PageHeader({ title, description, actions, icon }: { title: string; description?: ReactNode; actions?: ReactNode; icon?: ReactNode }) {
  return (
    <header className="mb-5 flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h1 className="flex items-center gap-2.5 text-2xl font-semibold tracking-tight text-ink">
          {icon && <span className="text-brand" aria-hidden>{icon}</span>}
          {title}
        </h1>
        {description && <p className="mt-1 max-w-3xl text-sm text-ink-2">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

type Tone = "neutral" | "brand" | "ok" | "warn" | "danger" | "info" | "violet";
const toneClasses: Record<Tone, string> = {
  neutral: "bg-canvas text-ink-2 border-line",
  brand: "bg-brand-pale text-brand-dark border-brand/20",
  ok: "bg-ok-pale text-ok border-ok/20",
  warn: "bg-warn-pale text-warn border-warn/20",
  danger: "bg-danger-pale text-danger border-danger/20",
  info: "bg-info-pale text-info border-info/20",
  violet: "bg-violet-pale text-violet border-violet/20",
};

export function Badge({ tone = "neutral", children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return <span className={cn("inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-xs font-medium whitespace-nowrap", toneClasses[tone], className)}>{children}</span>;
}

export function DemoBadge() {
  return <Badge tone="violet">Demo data</Badge>;
}

export function EmptyState({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-line bg-canvas/50 px-6 py-10 text-center">
      <p className="font-medium text-ink">{title}</p>
      {children && <div className="mt-1 max-w-md text-sm text-ink-2">{children}</div>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Notice({ tone = "info", title, children }: { tone?: "info" | "warn" | "danger" | "ok"; title?: string; children: ReactNode }) {
  const cls = { info: "border-info/25 bg-info-pale text-ink", warn: "border-warn/30 bg-warn-pale text-ink", danger: "border-danger/30 bg-danger-pale text-ink", ok: "border-ok/25 bg-ok-pale text-ink" }[tone];
  return (
    <div className={cn("rounded-lg border px-3.5 py-2.5 text-sm", cls)} role={tone === "danger" ? "alert" : undefined}>
      {title && <p className="font-semibold">{title}</p>}
      <div className={title ? "mt-0.5" : ""}>{children}</div>
    </div>
  );
}

export function Stat({ label, value, hint, icon }: { label: string; value: ReactNode; hint?: ReactNode; icon?: ReactNode }) {
  return (
    <Card className="flex items-center gap-3 px-4 py-3.5">
      {icon && <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-brand-pale text-brand" aria-hidden>{icon}</div>}
      <div className="min-w-0">
        <p className="text-xs font-medium text-ink-2">{label}</p>
        <p className="text-2xl font-semibold tabular-nums text-ink">{value}</p>
        {hint && <p className="text-xs text-ink-2">{hint}</p>}
      </div>
    </Card>
  );
}

export const inputClasses = "w-full rounded-lg border border-line bg-white px-3 py-2 text-sm text-ink placeholder:text-ink-2/60 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20 aria-[invalid=true]:border-danger";
export const labelClasses = "block text-sm font-medium text-ink";

export function Field({ label, htmlFor, hint, error, required, children, className }: { label: ReactNode; htmlFor: string; hint?: ReactNode; error?: string[] | string; required?: boolean; children: ReactNode; className?: string }) {
  const errs = typeof error === "string" ? [error] : error;
  return (
    <div className={cn("space-y-1", className)}>
      <label htmlFor={htmlFor} className={labelClasses}>
        {label} {required && <span className="text-danger" aria-hidden>*</span>}
        {required && <span className="sr-only">(required)</span>}
      </label>
      {children}
      {hint && <p id={`${htmlFor}-hint`} className="text-xs text-ink-2">{hint}</p>}
      {errs?.length ? <p id={`${htmlFor}-error`} className="text-xs font-medium text-danger">{errs.join(" ")}</p> : null}
    </div>
  );
}

export function KeyValue({ items }: { items: [ReactNode, ReactNode][] }) {
  return (
    <dl className="grid grid-cols-[minmax(110px,auto)_1fr] gap-x-4 gap-y-1.5 text-sm">
      {items.map(([k, v], i) => (
        <div key={i} className="contents">
          <dt className="text-ink-2">{k}</dt>
          <dd className="min-w-0 break-words text-ink">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

export function formatDate(d: Date | string | null | undefined, withTime = true) {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", ...(withTime ? { hour: "numeric", minute: "2-digit" } : {}) });
}

export function humanize(key: string | null | undefined) {
  if (!key) return "—";
  return key.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}
