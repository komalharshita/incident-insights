import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { useState } from "react";
import { z } from "zod";
import { listIncidents, listServices } from "@/lib/incidents.functions";
import { PageHeader, SeverityBadge, SourceNote, formatDay, formatMinutes } from "@/components/app-shell";

const search = z.object({
  service: z.string().optional(),
  severity: z.enum(["low", "medium", "high", "critical"]).optional(),
  status: z.enum(["open", "resolved"]).optional(),
  page: z.number().int().min(1).optional(),
});
type Search = z.infer<typeof search>;

const incidentsQuery = (s: Search) =>
  queryOptions({
    queryKey: ["incidents", s],
    queryFn: () => listIncidents({ data: { ...s, page: s.page ?? 1, page_size: 12 } }),
  });
const servicesQuery = queryOptions({ queryKey: ["services"], queryFn: () => listServices() });

export const Route = createFileRoute("/incidents")({
  staticData: { sitemap: true },
  validateSearch: search,
  head: () => ({
    meta: [
      { title: "Incident history — IncidentIQ" },
      { name: "description", content: "Browse real outages by service, severity and status, with root cause, fix and lessons learned." },
      { property: "og:title", content: "Incident history — IncidentIQ" },
      { property: "og:description", content: "Filter 25 real public outages and see what caused them and how they were fixed." },
    ],
  }),
  loaderDeps: ({ search }) => search,
  loader: ({ context, deps }) =>
    Promise.all([context.queryClient.ensureQueryData(incidentsQuery(deps)), context.queryClient.ensureQueryData(servicesQuery)]),
  component: IncidentsPage,
});

const selectCls = "w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring";

function IncidentsPage() {
  const s = Route.useSearch();
  const navigate = useNavigate({ from: "/incidents" });
  const { data: services } = useSuspenseQuery(servicesQuery);
  const { data, isFetching } = useSuspenseQuery(incidentsQuery(s));
  const [open, setOpen] = useState<number | null>(null);
  const set = (patch: Partial<Search>) => navigate({ search: (prev) => ({ ...prev, ...patch, page: undefined }) });

  return (
    <>
      <PageHeader eyebrow="Incident history" title="Every outage, and what fixed it">
        Filter by service, severity and status. Open an incident to see its root cause, resolution and lessons learned.
      </PageHeader>
      {data && <SourceNote source={data.source} />}

      <div className="grid gap-4 rounded-lg border border-border bg-card p-4 md:grid-cols-4">
        <label className="text-xs uppercase tracking-wider text-muted-foreground">
          Service
          <select className={`${selectCls} mt-1`} value={s.service ?? ""} onChange={(e) => set({ service: e.target.value || undefined })}>
            <option value="">All services</option>
            {services.map((x) => <option key={x} value={x}>{x}</option>)}
          </select>
        </label>
        <label className="text-xs uppercase tracking-wider text-muted-foreground">
          Severity
          <select className={`${selectCls} mt-1`} value={s.severity ?? ""} onChange={(e) => set({ severity: (e.target.value || undefined) as Search["severity"] })}>
            <option value="">Any severity</option>
            {["critical", "high", "medium", "low"].map((x) => <option key={x}>{x}</option>)}
          </select>
        </label>
        <label className="text-xs uppercase tracking-wider text-muted-foreground">
          Status
          <select className={`${selectCls} mt-1`} value={s.status ?? ""} onChange={(e) => set({ status: (e.target.value || undefined) as Search["status"] })}>
            <option value="">Any status</option>
            <option value="resolved">resolved</option>
            <option value="open">open</option>
          </select>
        </label>
        <div className="flex items-end justify-between gap-2 text-sm text-muted-foreground">
          <span>{data ? `${data.total} incidents` : ""}{isFetching ? " · updating…" : ""}</span>
          {(s.service || s.severity || s.status) && (
            <button className="text-primary hover:underline" onClick={() => navigate({ search: {} })}>Clear</button>
          )}
        </div>
      </div>

      <div className="mt-6 space-y-3">
        {data?.items.length === 0 && (
          <div className="rounded-lg border border-dashed border-border p-10 text-center text-muted-foreground">No incidents match these filters.</div>
        )}
        {data?.items.map((i) => {
          const isOpen = open === i.id;
          const source = i.metrics?.['source'] as string | undefined;
          return (
            <article key={i.id} className="rounded-lg border border-border bg-card transition-colors hover:border-primary/40">
              <button className="flex w-full flex-wrap items-center gap-3 p-4 text-left" onClick={() => setOpen(isOpen ? null : i.id)} aria-expanded={isOpen}>
                <span className="font-mono text-xs text-muted-foreground">#{i.id}</span>
                <span className="font-mono text-sm font-semibold">{i.service}</span>
                <SeverityBadge severity={i.severity} />
                <span className={`rounded px-2 py-0.5 text-[11px] uppercase ${i.status === "resolved" ? "bg-success/15 text-success" : "bg-warning/15 text-warning"}`}>{i.status}</span>
                <span className="ml-auto text-xs text-muted-foreground">{formatDay(i.created_at)} · {formatMinutes(i.resolution_time_minutes)}</span>
                <p className="w-full text-sm text-muted-foreground">{i.description}</p>
              </button>
              {isOpen && (
                <div className="grid gap-5 border-t border-border p-5 md:grid-cols-2">
                  <Field label="Symptoms">
                    <ul className="list-disc space-y-0.5 pl-4">{i.symptoms.map((x) => <li key={x}>{x}</li>)}</ul>
                  </Field>
                  <Field label="Root cause" accent>{i.root_cause || "Not recorded yet"}</Field>
                  <Field label="Resolution">{i.resolution || "Not recorded yet"}</Field>
                  <Field label="Lessons learned">{i.lessons_learned || "—"}</Field>
                  <div className="flex flex-wrap items-center gap-3 md:col-span-2">
                    {i.status === "resolved" && (
                      <Link to="/compare" search={{ incident: i.id }} className="rounded-md bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90">
                        Replay in before / after demo
                      </Link>
                    )}
                    {source && (
                      <a href={source} target="_blank" rel="noreferrer" className="text-sm text-accent hover:underline">Read the original postmortem ↗</a>
                    )}
                  </div>
                </div>
              )}
            </article>
          );
        })}
      </div>

      {data && data.pages > 1 && (
        <div className="mt-6 flex items-center justify-center gap-4 text-sm">
          <button className="rounded-md border border-border px-3 py-1.5 disabled:opacity-40" disabled={(s.page ?? 1) <= 1} onClick={() => navigate({ search: (p) => ({ ...p, page: (p.page ?? 1) - 1 }) })}>Previous</button>
          <span className="text-muted-foreground">Page {data.page} of {data.pages}</span>
          <button className="rounded-md border border-border px-3 py-1.5 disabled:opacity-40" disabled={(s.page ?? 1) >= data.pages} onClick={() => navigate({ search: (p) => ({ ...p, page: (p.page ?? 1) + 1 }) })}>Next</button>
        </div>
      )}
    </>
  );
}

function Field({ label, children, accent }: { label: string; children: React.ReactNode; accent?: boolean }) {
  return (
    <div>
      <div className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`text-sm leading-relaxed ${accent ? "border-l-2 border-accent pl-3" : ""}`}>{children}</div>
    </div>
  );
}
