import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { getDashboard } from "@/lib/incidents.functions";
import { PageHeader, SourceNote, formatDay, formatMinutes } from "@/components/app-shell";

const dashboardQuery = queryOptions({ queryKey: ["dashboard"], queryFn: () => getDashboard() });

export const Route = createFileRoute("/")({
  staticData: { sitemap: true },
  head: () => ({
    meta: [
      { title: "IncidentIQ — memory dashboard" },
      { name: "description", content: "What the IncidentIQ agent has learned from 25 real public outages: recurring root causes, time to resolve, and lessons." },
      { property: "og:title", content: "IncidentIQ — memory dashboard" },
      { property: "og:description", content: "Recurring root causes and lessons learned from real outages at AWS, Cloudflare, GitHub, Meta and more." },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(dashboardQuery),
  component: Overview,
});

const COLORS = ["var(--chart-2)", "var(--chart-1)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)", "var(--muted-foreground)"];

function Stat({ label, value, hint }: { label: string; value: string | number; hint?: string | undefined }) {
  return (
    <div className="rounded-lg border border-border bg-card p-5">
      <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-2 font-display text-3xl font-bold">{value}</div>
      {hint && <div className="mt-1 text-xs text-muted-foreground">{hint}</div>}
    </div>
  );
}

function Overview() {
  const { data } = useSuspenseQuery(dashboardQuery);
  const top = data.root_causes[0];
  const bank = data.bank ?? { memories: data.resolved, runs: 0, avg_before: null, avg_after: null, recent_runs: [] };
  return (
    <>
      <PageHeader eyebrow="Memory dashboard" title="What the agent has learned">
        Every resolved incident becomes memory. The next time something similar breaks, the agent recalls it before answering.
      </PageHeader>
      <SourceNote source={data.source} />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Incidents on record" value={data.total} hint={`${data.open} still open`} />
        <Stat label="Resolutions learned" value={data.resolved} hint="stored as memory" />
        <Stat label="Services covered" value={data.services} />
        <Stat label="Median time to resolve" value={formatMinutes(data.median_minutes)} hint={top ? `Top cause: ${top.name}` : undefined} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <section className="rounded-lg border border-border bg-card p-6 shadow-memory lg:col-span-2">
          <h2 className="text-lg font-bold">Recurring root causes</h2>
          <p className="text-sm text-muted-foreground">Resolved incidents grouped by what actually caused them.</p>
          <div className="mt-4 h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.root_causes} layout="vertical" margin={{ left: 10, right: 20 }}>
                <XAxis type="number" allowDecimals={false} stroke="var(--muted-foreground)" fontSize={12} />
                <YAxis type="category" dataKey="name" width={170} stroke="var(--muted-foreground)" fontSize={12} />
                <Tooltip
                  cursor={{ fill: "var(--secondary)" }}
                  contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8, color: "var(--foreground)" }}
                />
                <Bar dataKey="value" name="Incidents" radius={[0, 4, 4, 0]}>
                  {data.root_causes.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="rounded-lg border border-border bg-card p-6">
          <h2 className="text-lg font-bold">Memory bank</h2>
          <dl className="mt-4 space-y-2 font-mono text-sm">
            {[
              ["memories stored", bank.memories],
              ["before/after runs", bank.runs],
              ["avg score without memory", bank.avg_before ?? "—"],
              ["avg score with memory", bank.avg_after ?? "—"],
            ].map(([k, v]) => (
              <div key={String(k)} className="flex justify-between gap-4 border-b border-border pb-1.5">
                <dt className="text-muted-foreground">{k}</dt>
                <dd>{String(v)}</dd>
              </div>
            ))}
          </dl>
          {bank.recent_runs.length > 0 && (
            <>
              <h3 className="mt-6 text-sm font-bold uppercase tracking-wider text-muted-foreground">Recent replays</h3>
              <ul className="mt-2 space-y-1.5 font-mono text-xs">
                {bank.recent_runs.map((r) => (
                  <li key={r.at} className="flex justify-between gap-2">
                    <span className="truncate text-muted-foreground">#{r.incident_id} {r.service}</span>
                    <span>{r.before} → <span className="text-accent">{r.after}</span></span>
                  </li>
                ))}
              </ul>
            </>
          )}
          <h3 className="mt-6 text-sm font-bold uppercase tracking-wider text-muted-foreground">By severity</h3>
          <div className="mt-2 flex flex-wrap gap-2">
            {data.by_severity.map((s) => (
              <span key={s.name} className="rounded-md bg-secondary px-2.5 py-1 font-mono text-xs">
                {s.name} · {s.value}
              </span>
            ))}
          </div>
          <h3 className="mt-6 text-sm font-bold uppercase tracking-wider text-muted-foreground">Most incidents</h3>
          <ul className="mt-2 space-y-1 text-sm">
            {data.by_company.slice(0, 5).map((c) => (
              <li key={c.name} className="flex justify-between">
                <span>{c.name}</span>
                <span className="font-mono text-muted-foreground">{c.value}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <section className="mt-6 rounded-lg border border-border bg-card p-6">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">Recently learned lessons</h2>
          <Link to="/incidents" className="text-sm text-primary hover:underline">All incidents →</Link>
        </div>
        <ul className="mt-4 divide-y divide-border">
          {data.recent_lessons.map((l) => (
            <li key={l.id} className="grid gap-1 py-3 md:grid-cols-[200px_1fr]">
              <div>
                <div className="font-mono text-sm">#{l.id} · {l.service}</div>
                <div className="text-xs text-muted-foreground">{formatDay(l.date)}</div>
              </div>
              <p className="text-sm">{l.lessons}</p>
            </li>
          ))}
        </ul>
      </section>

      <div className="mt-6 flex flex-col items-start justify-between gap-4 rounded-lg border border-accent/30 bg-accent/10 p-6 md:flex-row md:items-center">
        <div>
          <h2 className="text-lg font-bold">See memory make a difference</h2>
          <p className="text-sm text-muted-foreground">Replay a real outage with memory off and on, and compare the scores.</p>
        </div>
        <Link to="/compare" className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90">
          Open the before / after demo
        </Link>
      </div>
    </>
  );
}
