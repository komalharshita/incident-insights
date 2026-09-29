import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { queryOptions, useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { compareAnalyses, listIncidents } from "@/lib/incidents.functions";
import { PageHeader, SeverityBadge, SourceNote } from "@/components/app-shell";
import { scoreAnalysis, type Score } from "@/lib/score";
import type { Analysis, Incident } from "@/lib/types";
import { cn } from "@/lib/utils";

const resolvedQuery = queryOptions({
  queryKey: ["incidents", "resolved-all"],
  queryFn: () => listIncidents({ data: { status: "resolved", page: 1, page_size: 100 } }),
});

export const Route = createFileRoute("/compare")({
  validateSearch: z.object({ incident: z.number().int().optional() }),
  head: () => ({
    meta: [
      { title: "Before / after memory demo — IncidentIQ" },
      { name: "description", content: "Replay a real outage through the agent with memory off and on, and see the score difference." },
      { property: "og:title", content: "Before / after memory demo — IncidentIQ" },
      { property: "og:description", content: "Same real incident, two answers: without memory and with recalled experience." },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(resolvedQuery),
  component: ComparePage,
});

function toPayload(i: Incident) {
  return {
    service: i.service,
    severity: i.severity as "low" | "medium" | "high" | "critical",
    symptoms: i.symptoms.length ? i.symptoms : [i.description],
    logs: i.logs || i.description,
    metrics: {},
    deployment_version: i.deployment_version || "unknown",
    description: i.description,
  };
}

function ComparePage() {
  const { data: list } = useSuspenseQuery(resolvedQuery);
  const { incident } = Route.useSearch();
  const navigate = useNavigate({ from: "/compare" });
  const compare = useServerFn(compareAnalyses);
  const picked = list.items.find((i) => i.id === incident) ?? list.items[0];

  const qc = useQueryClient();
  const run = useMutation({
    onSuccess: () => qc.invalidateQueries({ queryKey: ["dashboard"] }),
    mutationFn: (i: Incident) => compare({ data: { incident_id: i.id } }),
  });
  const res = run.data;
  const truth = picked?.root_cause;
  const sBefore = res?.before ? scoreAnalysis(res.before, truth) : null;
  const sAfter = res?.after ? scoreAnalysis(res.after, truth) : null;
  const delta = sBefore && sAfter ? sAfter.total - sBefore.total : null;

  return (
    <>
      <PageHeader eyebrow="Before / after" title="Same real incident, two answers">
        Pick a real outage. The agent sees only its symptoms. It answers once with memory switched off, and once recalling similar past incidents from its memory in Lovable Cloud. That incident's own memory is hidden, and its real root cause is used only to score the answers.
      </PageHeader>
      <SourceNote source={list.source} />

      <div className="grid gap-4 rounded-lg border border-border bg-card p-5 md:grid-cols-[1fr_auto] md:items-end">
        <label className="text-xs uppercase tracking-wider text-muted-foreground">
          Real incident to replay
          <select
            className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm normal-case tracking-normal text-foreground"
            value={picked?.id ?? ""}
            onChange={(e) => {
              run.reset();
              navigate({ search: { incident: Number(e.target.value) } });
            }}
          >
            {list.items.map((i) => (
              <option key={i.id} value={i.id}>#{i.id} · {i.service} — {i.description.slice(0, 80)}</option>
            ))}
          </select>
        </label>
        <button
          disabled={!picked || run.isPending}
          onClick={() => picked && run.mutate(picked)}
          className="rounded-md bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {run.isPending ? "Running both answers…" : "Compare answers"}
        </button>
        {picked && (
          <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground md:col-span-2">
            <SeverityBadge severity={picked.severity} />
            <span>Symptoms the agent sees:</span>
            {picked.symptoms.map((s) => <span key={s} className="rounded bg-secondary px-2 py-0.5 font-mono text-xs text-foreground">{s}</span>)}
          </div>
        )}
      </div>

      {run.isPending && (
        <div className="mt-6 animate-pulse rounded-lg border border-border bg-card p-6 text-sm text-muted-foreground">
          Asking the agent twice… this takes up to a minute, longer if the backend is waking up.
        </div>
      )}
      {run.error && <ErrorBox>{(run.error as Error).message}</ErrorBox>}
      {res?.errors.length ? <ErrorBox>{res.errors.join(" · ")}</ErrorBox> : null}

      {sBefore && sAfter && (
        <section className="mt-6 rounded-lg border border-accent/30 bg-card p-6 shadow-memory">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <div className="font-mono text-xs uppercase tracking-[0.18em] text-accent">Score difference</div>
              <div className={cn("mt-1 font-display text-5xl font-bold", delta! > 0 ? "text-success" : delta! < 0 ? "text-destructive" : "")}>
                {delta! > 0 ? "+" : ""}{delta} <span className="text-lg text-muted-foreground">points with memory</span>
              </div>
            </div>
            {sBefore.match != null && sAfter.match != null && (
              <div className="text-sm text-muted-foreground">
                Match with real root cause: <b className="text-foreground">{Math.round(sBefore.match * 100)}%</b> → <b className="text-foreground">{Math.round(sAfter.match * 100)}%</b>
              </div>
            )}
          </div>
          <p className="mt-4 border-l-2 border-accent pl-3 text-sm"><span className="text-muted-foreground">Real root cause: </span>{truth}</p>
          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <ScoreCard title="Without memory" score={sBefore} tone="before" />
            <ScoreCard title="With recalled experience" score={sAfter} tone="after" />
          </div>
        </section>
      )}

      {res && (res.before || res.after) && (
        <div className="mt-6 grid gap-6 md:grid-cols-2">
          <AnswerCard title="Without memory" result={res.before} />
          <AnswerCard title="With recalled experience" result={res.after} memory />
        </div>
      )}
    </>
  );
}

function ErrorBox({ children }: { children: React.ReactNode }) {
  return <div className="mt-6 rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">{children}</div>;
}

function ScoreCard({ title, score, tone }: { title: string; score: Score; tone: "before" | "after" }) {
  return (
    <div className="rounded-lg border border-border bg-background/40 p-5">
      <div className="flex items-baseline justify-between">
        <h3 className="font-bold">{title}</h3>
        <div className="font-display text-3xl font-bold">{score.total}<span className="text-base text-muted-foreground">/100</span></div>
      </div>
      <div className="mt-4 space-y-2.5">
        {score.parts.map((p) => (
          <div key={p.label} className="grid grid-cols-[1fr_110px_48px] items-center gap-3 text-xs">
            <span className="text-muted-foreground">{p.label}</span>
            <div className="h-1.5 overflow-hidden rounded-full bg-secondary">
              <div className={cn("h-full rounded-full", tone === "after" ? "bg-accent" : "bg-primary")} style={{ width: `${(p.value / p.max) * 100}%` }} />
            </div>
            <span className="text-right font-mono">{p.value}/{p.max}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function AnswerCard({ title, result, memory }: { title: string; result: Analysis | null; memory?: boolean }) {
  return (
    <article className={cn("rounded-lg border bg-card p-6", memory ? "border-accent/40 shadow-memory" : "border-border")}>
      <h2 className={cn("font-mono text-xs uppercase tracking-[0.18em]", memory ? "text-accent" : "text-muted-foreground")}>{title}</h2>
      {!result ? (
        <p className="mt-3 text-sm text-muted-foreground">This answer failed.</p>
      ) : (
        <div className="mt-3 space-y-4 text-sm">
          <p>{result.analysis.summary}</p>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-bold">Likely root cause</h3>
              <span className="rounded bg-secondary px-2 py-0.5 font-mono text-[11px]">{result.analysis.confidence} confidence</span>
            </div>
            <p className="mt-1">{result.analysis.likely_root_cause}</p>
          </div>
          {result.analysis.recommended_actions.length > 0 && (
            <div>
              <h3 className="font-bold">Recommended steps</h3>
              <ol className="mt-1 list-decimal space-y-1 pl-5">
                {result.analysis.recommended_actions.map((a, n) => <li key={n}>{a.step}<span className="text-muted-foreground"> — {a.reason}</span></li>)}
              </ol>
            </div>
          )}
          {memory && (
            <div className="rounded-md border border-accent/30 bg-accent/10 p-3">
              <h3 className="font-bold text-accent">Recalled {result.memory.memories_retrieved} memories</h3>
              {result.analysis.similar_incidents.length > 0 ? (
                <ul className="mt-1 space-y-1">
                  {result.analysis.similar_incidents.map((s) => <li key={s.incident_id}><span className="font-mono">#{s.incident_id}</span> — {s.reason}</li>)}
                </ul>
              ) : (
                <p className="mt-1 text-muted-foreground">{result.memory.status === "ok" ? "No similar past incidents were cited." : `Memory ${result.memory.status}: ${result.memory.error ?? ""}`}</p>
              )}
            </div>
          )}
        </div>
      )}
    </article>
  );
}
