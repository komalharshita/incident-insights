import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import seed from "@/data/incidents.json";
import type { Incident, IncidentList, Dashboard, Analysis, Health } from "./types";

// Bundled copy of the same 25 real public postmortems the backend seeds.
function seedIncidents(): Incident[] {
  return (seed as any[]).map((r) => ({
    id: r.id,
    service: r.service,
    severity: r.severity,
    status: "resolved",
    symptoms: r.symptoms,
    logs: `[reconstructed from public postmortem: ${r.source}]`,
    metrics: { company: r.company, source: r.source },
    deployment_version: "public-postmortem",
    description: `${r.company}: ${r.description}`,
    root_cause: r.root_cause,
    resolution: r.resolution,
    successful: true,
    resolution_time_minutes: r.minutes,
    lessons_learned: r.lessons,
    is_synthetic: true,
    created_at: r.date,
    resolved_at: new Date(new Date(r.date).getTime() + r.minutes * 60000).toISOString(),
  }));
}

const listInput = z.object({
  service: z.string().max(120).optional(),
  severity: z.enum(["low", "medium", "high", "critical"]).optional(),
  status: z.enum(["open", "resolved"]).optional(),
  page: z.number().int().min(1).default(1),
  page_size: z.number().int().min(1).max(100).default(12),
});

// Public read-only client for the incidents table in Lovable Cloud.
async function db() {
  const { createClient } = await import("@supabase/supabase-js");
  const key = process.env['SUPABASE_PUBLISHABLE_KEY']!;
  return createClient(process.env['SUPABASE_URL']!, key, {
    auth: { persistSession: false, autoRefreshToken: false, storage: undefined },
    global: {
      fetch: (input, init) => {
        const h = new Headers(init?.headers);
        if (key.startsWith("sb_") && h.get("Authorization") === `Bearer ${key}`) h.delete("Authorization");
        h.set("apikey", key);
        return fetch(input, { ...init, headers: h });
      },
    },
  });
}

async function allIncidents(): Promise<{ items: Incident[]; cloud: boolean }> {
  try {
    const { data, error } = await (await db()).from("incidents").select("*").order("created_at", { ascending: false });
    if (error) throw error;
    return { items: (data || []) as unknown as Incident[], cloud: true };
  } catch {
    return { items: seedIncidents().sort((a, b) => b.created_at.localeCompare(a.created_at)), cloud: false };
  }
}

export const listIncidents = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => listInput.parse(d ?? {}))
  .handler(async ({ data }): Promise<IncidentList> => {
    let { items, cloud } = await allIncidents();
    if (data.service) items = items.filter((i) => i.service === data.service);
    if (data.severity) items = items.filter((i) => i.severity === data.severity);
    if (data.status) items = items.filter((i) => i.status === data.status);
    const total = items.length;
    const start = (data.page - 1) * data.page_size;
    return {
      items: items.slice(start, start + data.page_size),
      page: data.page,
      page_size: data.page_size,
      total,
      pages: Math.max(1, Math.ceil(total / data.page_size)),
      source: cloud ? "live" : "offline",
    };
  });

export const listServices = createServerFn({ method: "GET" }).handler(async (): Promise<string[]> => {
  const { items } = await allIncidents();
  return [...new Set(items.map((i) => i.service))].sort();
});

export const getDashboard = createServerFn({ method: "GET" }).handler(async (): Promise<Dashboard> => {
  let runs: any[] = [];
  try {
    const { data } = await (await db()).from("analysis_runs").select("*").order("created_at", { ascending: false }).limit(200);
    runs = data || [];
  } catch {
    runs = [];
  }
  const { items: incidents, cloud } = await allIncidents();
  const resolved = incidents.filter((i) => i.status === "resolved");
  const count = (key: (i: Incident) => string) => {
    const m = new Map<string, number>();
    incidents.forEach((i) => m.set(key(i), (m.get(key(i)) || 0) + 1));
    return [...m.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  };
  const company = (i: Incident) => String(i.metrics?.['company'] || i.service.split("-")[0]);
  const themes: [string, RegExp][] = [
    ["Bad config / rule push", /config|rule|policy|feature file|flag|channel file/i],
    ["Human command error", /typo|mistyp|manual|ran |command|script/i],
    ["Network / BGP / DNS", /bgp|dns|network|route|partition|backbone|transit/i],
    ["Capacity & scaling", /capacity|scal|quota|surge|load/i],
    ["Software bug", /bug|race|regex|parser|out-of-bounds|leap/i],
    ["Physical / power", /power|water|fire|generator/i],
  ];
  const causes = themes
    .map(([name, re]) => ({ name, value: resolved.filter((i) => re.test(i.root_cause || "")).length }))
    .filter((c) => c.value > 0)
    .sort((a, b) => b.value - a.value);
  const minutes = resolved.map((i) => i.resolution_time_minutes || 0).sort((a, b) => a - b);
  return {
    source: cloud ? "live" : "offline",
    total: incidents.length,
    resolved: resolved.length,
    open: incidents.length - resolved.length,
    services: new Set(incidents.map((i) => i.service)).size,
    median_minutes: minutes[Math.floor(minutes.length / 2)] ?? 0,
    by_severity: count((i) => i.severity),
    by_company: count(company).slice(0, 8),
    root_causes: causes,
    recent_lessons: resolved
      .slice()
      .sort((a, b) => (b.resolved_at || "").localeCompare(a.resolved_at || ""))
      .slice(0, 5)
      .map((i) => ({ id: i.id, service: i.service, lessons: i.lessons_learned || "", date: i.resolved_at })),
    bank: {
      memories: resolved.length,
      runs: runs.length,
      avg_before: runs.length ? Math.round(runs.reduce((t, r) => t + r.score_before, 0) / runs.length) : null,
      avg_after: runs.length ? Math.round(runs.reduce((t, r) => t + r.score_after, 0) / runs.length) : null,
      recent_runs: runs.slice(0, 5).map((r) => ({ incident_id: r.incident_id, service: r.service, before: r.score_before, after: r.score_after, recalled: r.memories_recalled, at: r.created_at })),
    },
  };
});

export const getHealth = createServerFn({ method: "GET" }).handler(async (): Promise<Health> => {
  const ai = !!process.env["LOVABLE_API_KEY"];
  return { online: ai, status: ai ? "ready" : "not configured", detail: {} };
});

const compareInput = z.object({ incident_id: z.number().int().positive() });

export const compareAnalyses = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => compareInput.parse(d))
  .handler(async ({ data }): Promise<{ before: Analysis | null; after: Analysis | null; errors: string[]; scores: { before: number; after: number } | null }> => {
    const { analyze, recall } = await import("./analysis.server");
    const { scoreAnalysis } = await import("./score");
    const { items } = await allIncidents();
    const target = items.find((i) => i.id === data.incident_id);
    if (!target) return { before: null, after: null, errors: ["Incident not found."], scores: null };
    // The replayed incident's own memory is excluded so the comparison stays honest.
    const pool = items.filter((i) => i.id !== target.id && i.status === "resolved");
    const memories = recall(target, pool);
    const pack = (analysis: Analysis["analysis"], used: boolean): Analysis => ({
      incident: target,
      analysis,
      memory: {
        memory_used: used,
        memories_retrieved: used ? memories.length : 0,
        memories: used
          ? memories.map(({ i, score }) => ({ id: String(i.id), content: `${i.description} Root cause: ${i.root_cause}`, relevance: Math.round(score * 100) / 100, metadata: { incident_id: i.id, service: i.service, date: i.created_at } }))
          : [],
        status: "ok",
        error: null,
      },
    });
    const [b, a] = await Promise.allSettled([analyze(target, []), analyze(target, memories)]);
    const errors = [...new Set([b, a].filter((r): r is PromiseRejectedResult => r.status === "rejected").map((r) => String(r.reason?.message || r.reason)))];
    const before = b.status === "fulfilled" ? pack(b.value, false) : null;
    const after = a.status === "fulfilled" ? pack(a.value, true) : null;
    let scores = null;
    if (before && after) {
      scores = { before: scoreAnalysis(before, target.root_cause).total, after: scoreAnalysis(after, target.root_cause).total };
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      await supabaseAdmin.from("analysis_runs").insert({
        incident_id: target.id,
        service: target.service,
        score_before: scores.before,
        score_after: scores.after,
        memories_recalled: memories.length,
        recalled_ids: memories.map((m) => m.i.id),
      });
    }
    return { before, after, errors, scores };
  });
