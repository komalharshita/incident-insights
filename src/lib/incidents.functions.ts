import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import seed from "@/data/incidents.json";
import type { Incident, IncidentList, Dashboard, Analysis, Health } from "./types";

const DEFAULT_API = "https://incidentiq-backend.onrender.com";
const apiBase = () => (process.env['INCIDENTIQ_API_URL'] || DEFAULT_API).replace(/\/$/, "");

async function call<T>(path: string, init?: RequestInit, timeoutMs = 12000): Promise<T> {
  const res = await fetch(`${apiBase()}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
    signal: AbortSignal.timeout(timeoutMs),
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const d = body?.detail;
    throw new Error(typeof d === "string" ? d : d?.message || `Backend returned ${res.status}`);
  }
  return body as T;
}

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
  // Memory-bank stats still come from the Render backend when it happens to be awake.
  let live: any = null;
  try {
    live = await call<any>("/api/memory", undefined, 4000);
  } catch {
    live = null;
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
    bank: live ? { status: live.hindsight_status, stats: live.hindsight_stats } : null,
  };
});

export const getHealth = createServerFn({ method: "GET" }).handler(async (): Promise<Health> => {
  try {
    const h = await call<any>("/health", undefined, 8000);
    return { online: true, status: h?.status || "ok", detail: h };
  } catch (e) {
    return { online: false, status: "offline", detail: { message: (e as Error).message } };
  }
});

const compareInput = z.object({
  incident: z.object({
    service: z.string().min(1).max(120),
    severity: z.enum(["low", "medium", "high", "critical"]),
    symptoms: z.array(z.string().min(1).max(500)).min(1).max(30),
    logs: z.string().min(1).max(20000),
    metrics: z.record(z.string(), z.any()).default({}),
    deployment_version: z.string().max(120),
    description: z.string().max(5000),
  }),
  exclude_incident_id: z.number().int().optional(),
});

export const compareAnalyses = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => compareInput.parse(d))
  .handler(async ({ data }): Promise<{ before: Analysis | null; after: Analysis | null; errors: string[] }> => {
    const body = JSON.stringify(data.incident);
    const exclude = data.exclude_incident_id ? `&exclude_incident_id=${data.exclude_incident_id}` : "";
    const [before, after] = await Promise.allSettled([
      call<Analysis>("/api/incidents/analyze?use_memory=false", { method: "POST", body }, 90000),
      call<Analysis>(`/api/incidents/analyze?use_memory=true${exclude}`, { method: "POST", body }, 90000),
    ]);
    const errors = [before, after]
      .filter((r): r is PromiseRejectedResult => r.status === "rejected")
      .map((r) =>
        r.reason?.name === "TimeoutError" || /fetch failed|ENOTFOUND|ECONNREFUSED|returned (404|502|503)/i.test(String(r.reason?.message))
          ? "The IncidentIQ backend is offline or still waking up. Try again in about 30 seconds."
          : String(r.reason?.message || r.reason),
      );
    return {
      before: before.status === "fulfilled" ? before.value : null,
      after: after.status === "fulfilled" ? after.value : null,
      errors: [...new Set(errors)],
    };
  });
