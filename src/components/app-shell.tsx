import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import type { ReactNode } from "react";
import { getHealth } from "@/lib/incidents.functions";
import { cn } from "@/lib/utils";

const NAV = [
  { to: "/", label: "Overview" },
  { to: "/incidents", label: "Incidents" },
  { to: "/compare", label: "Before / After" },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  const health = useServerFn(getHealth);
  const { data } = useQuery({ queryKey: ["health"], queryFn: () => health(), refetchInterval: 60000 });
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-20 border-b border-border bg-background/85 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center gap-6 px-6 py-3">
          <Link to="/" className="flex items-center gap-2.5">
            <span className="grid h-8 w-8 place-items-center rounded-md bg-brand font-mono text-sm font-bold text-primary-foreground">IQ</span>
            <span className="font-display text-lg font-bold tracking-tight">IncidentIQ</span>
          </Link>
          <nav className="flex gap-1">
            {NAV.map((n) => (
              <Link
                key={n.to}
                to={n.to}
                activeOptions={{ exact: n.to === "/" }}
                className="rounded-md px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                activeProps={{ className: "bg-secondary text-foreground" }}
              >
                {n.label}
              </Link>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-2 font-mono text-xs text-muted-foreground">
            <span
              className={cn(
                "h-2 w-2 rounded-full",
                data == null ? "bg-muted-foreground" : data.online ? "bg-success" : "bg-warning",
              )}
            />
            {data == null ? "checking AI backend…" : data.online ? `data: cloud · AI ${data.status}` : "data: cloud · AI backend asleep"}
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-6 py-8">{children}</main>
      <footer className="mx-auto max-w-7xl px-6 pb-10 text-xs text-muted-foreground">
        Incident data: 25 real outages summarised from each company's public postmortem. Log lines are reconstructed from the reports.
      </footer>
    </div>
  );
}

export function PageHeader({ eyebrow, title, children }: { eyebrow: string; title: string; children?: ReactNode }) {
  return (
    <div className="mb-8">
      <div className="font-mono text-xs uppercase tracking-[0.18em] text-accent">{eyebrow}</div>
      <h1 className="mt-2 text-3xl font-bold md:text-4xl">{title}</h1>
      {children && <p className="mt-2 max-w-3xl text-muted-foreground">{children}</p>}
    </div>
  );
}

const SEV: Record<string, string> = {
  critical: "bg-destructive/15 text-destructive border-destructive/30",
  high: "bg-warning/15 text-warning border-warning/30",
  medium: "bg-chart-3/15 text-chart-3 border-chart-3/30",
  low: "bg-success/15 text-success border-success/30",
};

export function SeverityBadge({ severity }: { severity: string }) {
  return (
    <span className={cn("rounded border px-2 py-0.5 font-mono text-[11px] uppercase tracking-wide", SEV[severity] || "border-border")}>
      {severity}
    </span>
  );
}

export function SourceNote({ source }: { source: "live" | "offline" }) {
  if (source === "live") return null;
  return (
    <div className="mb-6 rounded-md border border-warning/30 bg-warning/10 px-4 py-2.5 text-sm text-warning">
      The IncidentIQ backend isn't reachable, so this page shows the bundled copy of the 25 real incidents.
    </div>
  );
}

export function formatMinutes(m?: number | null) {
  if (m == null) return "—";
  if (m >= 1440) return `${(m / 1440).toFixed(m % 1440 ? 1 : 0)} d`;
  if (m >= 60) return `${Math.floor(m / 60)}h ${m % 60 ? `${m % 60}m` : ""}`.trim();
  return `${m} min`;
}

export function formatDay(v?: string | null) {
  if (!v) return "—";
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? v : d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}
