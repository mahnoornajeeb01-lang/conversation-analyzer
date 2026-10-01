"use client";

import { ArrowUpRight, TriangleAlert, type LucideIcon } from "lucide-react";
import { Button as AriaButton } from "react-aria-components";

import { focusRing } from "@/components/aria";

export function Card({
  title,
  subtitle,
  action,
  children,
  className = "",
  bodyClassName = "p-5",
}: {
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section className={`flex min-w-0 flex-col rounded-xl border border-slate-200 bg-surface shadow-xs ${className}`}>
      {(title || action) && (
        <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-slate-100 px-5 py-4">
          <div className="min-w-0">
            {title && <h2 className="text-sm font-semibold text-slate-900">{title}</h2>}
            {subtitle && <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p>}
          </div>
          {action}
        </header>
      )}
      <div className={`flex-1 ${bodyClassName}`}>{children}</div>
    </section>
  );
}

/** The title block at the top of every view, so all three pages line up the same way. */
export function PageHeader({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow: string;
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <p className="text-xs font-semibold tracking-wider text-violet-600 uppercase dark:text-violet-700">{eyebrow}</p>
        <h1 className="mt-1.5 text-2xl font-semibold tracking-tight text-slate-900">{title}</h1>
        <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-slate-500">{description}</p>
      </div>
      {action}
    </header>
  );
}

/** Overview metric tile; when it has an action the whole tile is a button that opens the detail view. */
export function StatCard({
  icon: Icon,
  label,
  value,
  hint,
  accent = "#7c3aed",
  onPress,
}: {
  icon: LucideIcon;
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  accent?: string;
  onPress?: () => void;
}) {
  const body = (
    <>
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-medium text-slate-500">{label}</p>
        <span
          className="flex h-8 w-8 items-center justify-center rounded-lg"
          style={{ background: `color-mix(in srgb, ${accent} 12%, transparent)`, color: accent }}
        >
          <Icon className="h-4 w-4" />
        </span>
      </div>
      <p className="mt-3 truncate text-xl font-semibold tracking-tight text-slate-900 tabular-nums sm:text-2xl">{value}</p>
      <div className="mt-1 flex items-center justify-between gap-2 text-xs text-slate-500">
        <span className="truncate">{hint}</span>
        {onPress && (
          <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-slate-400 transition-[color,translate] group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-violet-600" />
        )}
      </div>
    </>
  );
  const base = "flex h-full w-full min-w-0 flex-col rounded-xl border border-slate-200 bg-surface p-4 text-left shadow-xs sm:p-5";
  return onPress ? (
    <AriaButton
      onPress={onPress}
      className={`group ${base} cursor-pointer transition-[border-color,box-shadow,translate,scale] duration-200 hover:-translate-y-0.5 hover:border-violet-300 hover:shadow-md pressed:scale-[0.99] pressed:bg-slate-50 ${focusRing}`}
    >
      {body}
    </AriaButton>
  ) : (
    <div className={base}>{body}</div>
  );
}

export function MiniStat({ label, value, hint }: { label: string; value: React.ReactNode; hint?: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-surface px-5 py-4 shadow-xs">
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className="mt-1.5 text-xl font-semibold tracking-tight text-slate-900 tabular-nums">{value}</p>
      <p className="mt-0.5 h-4 truncate text-xs text-slate-400">{hint}</p>
    </div>
  );
}

export function Legend({ items }: { items: { label: string; color: string }[] }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-slate-600">
      {items.map((item) => (
        <span key={item.label} className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: item.color }} />
          {item.label}
        </span>
      ))}
    </div>
  );
}

export function SpeakerAvatar({
  initials,
  color,
  size = "md",
}: {
  initials: string;
  color: string;
  size?: "sm" | "md" | "lg";
}) {
  const dims = { sm: "h-6 w-6 text-[10px]", md: "h-9 w-9 text-xs", lg: "h-14 w-14 text-base" }[size];
  return (
    <span
      className={`flex shrink-0 items-center justify-center rounded-full font-semibold text-white ${dims}`}
      style={{ background: color }}
    >
      {initials}
    </span>
  );
}

export function EmptyState({ icon: Icon, title, text }: { icon: LucideIcon; title: string; text: string }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
      <span className="flex h-11 w-11 items-center justify-center rounded-full bg-slate-100 text-slate-400">
        <Icon className="h-5 w-5" />
      </span>
      <p className="mt-3 text-sm font-semibold text-slate-700">{title}</p>
      <p className="mt-1 max-w-sm text-sm text-slate-500">{text}</p>
    </div>
  );
}

export function Alert({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div role="alert" className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
      <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
      <div className="min-w-0">
        <p className="font-semibold">{title}</p>
        <p className="mt-0.5 break-words">{children}</p>
      </div>
    </div>
  );
}

/** Short explanation callout under a chart. */
export function Insight({ children }: { children: React.ReactNode }) {
  return <p className="mt-5 rounded-lg bg-slate-50 px-3.5 py-2.5 text-xs leading-relaxed text-slate-600">{children}</p>;
}
