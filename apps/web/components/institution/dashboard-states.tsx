"use client"

import { Skeleton } from "@/components/ui/skeleton"

/** Full-dashboard loading skeleton — shape-matches the real layout so
 *  nothing jumps when data arrives. */
export function DashboardLoading() {
  return (
    <div className="flex flex-col gap-8">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="flex flex-col gap-3 rounded-2xl p-5"
            style={{ backgroundColor: "var(--surface)", border: "1px solid var(--border)" }}
          >
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-8 w-16" />
          </div>
        ))}
      </div>
      <div className="flex flex-col gap-3 rounded-2xl p-5" style={{ backgroundColor: "var(--surface)", border: "1px solid var(--border)" }}>
        <Skeleton className="h-5 w-40" />
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
    </div>
  )
}

/** Inline section loading — for a panel refreshing on its own (e.g. the
 *  false-positive queue after a filter change), not the whole page. */
export function SectionLoading({ rows = 3 }: { rows?: number }) {
  return (
    <div className="flex flex-col gap-2">
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-14 w-full rounded-xl" />
      ))}
    </div>
  )
}

export function EmptyState({
  title,
  body,
  icon = "inbox",
}: {
  title: string
  body: string
  icon?: "inbox" | "check"
}) {
  return (
    <div
      className="flex flex-col items-center gap-3 rounded-2xl p-10 text-center"
      style={{ backgroundColor: "var(--surface-sunken)", border: "1px dashed var(--border)" }}
    >
      <span
        aria-hidden
        className="flex size-11 items-center justify-center rounded-full"
        style={{ backgroundColor: "var(--muted)" }}
      >
        {icon === "check" ? (
          <svg viewBox="0 0 24 24" className="size-5" fill="none">
            <path d="M5 12.5L9.5 17L19 6.5" stroke="var(--safe)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" className="size-5" fill="none">
            <path d="M4 8l2-4h12l2 4M4 8v10a1 1 0 001 1h14a1 1 0 001-1V8M4 8h16M8 12h2a1 1 0 001 1v0a1 1 0 001-1h2" stroke="var(--muted-foreground)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </span>
      <div className="flex flex-col gap-1">
        <span className="text-sm font-semibold">{title}</span>
        <p className="text-muted-foreground max-w-xs text-xs leading-relaxed">{body}</p>
      </div>
    </div>
  )
}

export function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div
      className="flex flex-col items-center gap-3 rounded-2xl p-10 text-center"
      style={{ backgroundColor: "var(--threat-subtle)", border: "1px solid var(--threat)" }}
    >
      <span aria-hidden className="flex size-11 items-center justify-center rounded-full" style={{ backgroundColor: "var(--surface)" }}>
        <svg viewBox="0 0 24 24" className="size-5" fill="none">
          <path d="M12 9v4m0 4h.01M10.29 3.86l-8.18 14.18A1 1 0 003 19.5h18a1 1 0 00.87-1.46L13.7 3.86a1 1 0 00-1.72 0z" stroke="var(--threat)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
      <div className="flex flex-col gap-1">
        <span className="text-sm font-semibold" style={{ color: "var(--threat-text)" }}>
          Couldn&apos;t load the dashboard
        </span>
        <p className="text-muted-foreground max-w-xs text-xs leading-relaxed">{message}</p>
      </div>
      <button
        type="button"
        onClick={onRetry}
        className="focus-visible:ring-ring rounded-lg px-4 py-2 text-xs font-semibold transition-colors duration-fast ease-standard focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
        style={{ backgroundColor: "var(--foreground)", color: "var(--background)" }}
      >
        Retry
      </button>
    </div>
  )
}
