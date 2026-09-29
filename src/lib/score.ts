import type { Analysis } from "./types";

const STOP = new Set("the a an of to in on for and or is was were with after before by from due that this into at as be".split(" "));
const words = (t?: string | null) =>
  new Set((String(t || "").toLowerCase().match(/[a-z0-9]{3,}/g) || []).filter((w) => !STOP.has(w)));

export function rootCauseMatch(predicted?: string | null, actual?: string | null) {
  const a = words(actual);
  if (!a.size) return null;
  const p = words(predicted);
  let hit = 0;
  a.forEach((w) => p.has(w) && hit++);
  return hit / a.size;
}

export interface Score {
  total: number;
  match: number | null;
  parts: { label: string; value: number; max: number }[];
}

export function scoreAnalysis(result: Analysis, actualRootCause?: string | null): Score {
  const a = result.analysis;
  const conf = ({ low: 5, medium: 15, high: 25 } as Record<string, number>)[a.confidence] ?? 0;
  const parts = [
    { label: "Confidence", value: conf, max: 25 },
    { label: "Memories recalled", value: Math.min(result.memory?.memories_retrieved || 0, 5) * 3, max: 15 },
    { label: "Similar incidents cited", value: Math.min(a.similar_incidents?.length || 0, 3) * 5, max: 15 },
    { label: "Concrete actions", value: Math.min(a.recommended_actions?.length || 0, 5) * 2, max: 10 },
  ];
  const match = rootCauseMatch(a.likely_root_cause, actualRootCause);
  if (match != null) parts.push({ label: "Matches real root cause", value: Math.round(match * 35), max: 35 });
  const max = parts.reduce((s, p) => s + p.max, 0);
  return { total: Math.round((parts.reduce((s, p) => s + p.value, 0) / max) * 100), parts, match };
}
