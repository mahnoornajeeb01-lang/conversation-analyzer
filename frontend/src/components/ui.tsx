"use client";

import { motion } from "framer-motion";
import { ArrowUpRight, type LucideIcon } from "lucide-react";

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
    <section
      className={`rounded-2xl border border-slate-200/80 bg-surface shadow-[0_1px_2px_rgba(15,23,42,0.04)] backdrop-blur-xl ${className}`}
    >
      {(title || action) && (
        <header className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <div className="min-w-0">
            {title && <h3 className="text-sm font-semibold text-slate-900">{title}</h3>}
            {subtitle && <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p>}
          </div>
          {action}
        </header>
      )}
      <div className={bodyClassName}>{children}</div>
    </section>
  );
}

/** Overview metric tile: rises in, lifts and glows on hover, opens its detail section on click. */
export function StatCard({
  icon: Icon,
  label,
  value,
  hint,
  accent = "#7c3aed",
  onClick,
  delay = 0,
}: {
  icon: LucideIcon;
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  accent?: string;
  onClick?: () => void;
  delay?: number;
}) {
  const motionProps = {
    initial: { opacity: 0, y: 10 },
    animate: { opacity: 1, y: 0 },
    transition: { delay: delay / 1000, duration: 0.35, ease: "easeOut" as const },
    whileHover: { y: -4 },
    className:
      "group relative flex w-full flex-col overflow-hidden rounded-2xl border border-slate-200/80 bg-surface p-4 text-left shadow-[0_1px_2px_rgba(15,23,42,0.04)] backdrop-blur-xl transition-[border-color,box-shadow] duration-200 hover:border-violet-500/40 hover:shadow-[0_12px_32px_-12px_rgba(139,92,246,0.45)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-500",
  };
  const body = (
    <>
      <span
        className="absolute inset-x-0 top-0 h-0.5 origin-left scale-x-0 transition-transform duration-300 group-hover:scale-x-100"
        style={{ background: accent, boxShadow: `0 0 12px ${accent}` }}
      />
      <span
        aria-hidden
        className="pointer-events-none absolute -top-10 -right-10 h-28 w-28 rounded-full opacity-0 blur-2xl transition-opacity duration-300 group-hover:opacity-100"
        style={{ background: `color-mix(in srgb, ${accent} 22%, transparent)` }}
      />
      <div className="relative flex items-center justify-between">
        <span
          className="flex h-9 w-9 items-center justify-center rounded-xl transition-transform duration-200 group-hover:scale-110"
          style={{ background: `color-mix(in srgb, ${accent} 14%, transparent)`, color: accent }}
        >
          <Icon className="h-[18px] w-[18px]" />
        </span>
        {onClick && (
          <ArrowUpRight className="h-4 w-4 text-slate-300 transition group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-violet-500" />
        )}
      </div>
      <p className="relative mt-4 text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className="relative mt-1 text-2xl font-semibold tracking-tight text-slate-900">{value}</p>
      {hint && <p className="relative mt-1 text-xs text-slate-500">{hint}</p>}
    </>
  );
  return onClick ? (
    <motion.button type="button" onClick={onClick} {...motionProps}>
      {body}
    </motion.button>
  ) : (
    <motion.div {...motionProps}>{body}</motion.div>
  );
}

export function SectionHeader({
  icon: Icon,
  eyebrow,
  title,
  description,
  action,
}: {
  icon: LucideIcon;
  eyebrow: string;
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div className="flex items-start gap-4">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-tr from-violet-600 to-indigo-600 text-white shadow-[0_0_20px_rgba(139,92,246,0.35)]">
          <Icon className="h-5 w-5" />
        </span>
        <div>
          <p className="text-xs font-bold tracking-wider text-violet-600 uppercase dark:text-violet-400">{eyebrow}</p>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900 md:text-3xl">{title}</h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-500">{description}</p>
        </div>
      </div>
      {action}
    </div>
  );
}

export function MiniStat({ label, value, hint }: { label: string; value: React.ReactNode; hint?: string }) {
  return (
    <div className="rounded-xl border border-slate-200/70 bg-surface px-4 py-3 backdrop-blur-xl transition hover:border-violet-500/40 hover:shadow-[0_0_18px_-6px_rgba(139,92,246,0.4)]">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-1 text-xl font-semibold tracking-tight text-slate-900">{value}</p>
      {hint && <p className="text-[11px] text-slate-400">{hint}</p>}
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
      className={`flex shrink-0 items-center justify-center rounded-full font-semibold text-white ring-2 ring-surface ${dims}`}
      style={{ background: color }}
    >
      {initials}
    </span>
  );
}

export function EmptyState({ icon: Icon, title, text }: { icon: LucideIcon; title: string; text: string }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
        <Icon className="h-6 w-6" />
      </span>
      <p className="mt-3 text-sm font-semibold text-slate-700">{title}</p>
      <p className="mt-1 max-w-sm text-sm text-slate-500">{text}</p>
    </div>
  );
}
