import type { Analysis, Incident } from "./types";

const STOP = new Set("the a an of to in on for and or is was were with after before by from due that this into at as be".split(" "));
const words = (t: string) => new Set((t.toLowerCase().match(/[a-z0-9]{3,}/g) || []).filter((w) => !STOP.has(w)));

export type Target = Pick<Incident, "service" | "severity" | "symptoms" | "logs" | "description">;

/** Memory recall: rank past resolved incidents by word overlap with the new incident's signals. */
export function recall(target: Target, pool: Incident[], limit = 3) {
  const q = words([target.service, target.description, ...target.symptoms].join(" "));
  return pool
    .map((i) => {
      const d = words([i.service, i.description, ...(i.symptoms || []), i.root_cause || "", i.lessons_learned || ""].join(" "));
      let hit = 0;
      q.forEach((w) => d.has(w) && hit++);
      return { i, score: q.size ? hit / q.size : 0 };
    })
    .filter((r) => r.score > 0.05)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["summary", "likely_root_cause", "confidence", "evidence", "recommended_actions", "similar_incidents", "memory_insights", "uncertainties"],
  properties: {
    summary: { type: "string" },
    likely_root_cause: { type: "string" },
    confidence: { type: "string", enum: ["low", "medium", "high"] },
    evidence: { type: "array", items: { type: "string" } },
    recommended_actions: {
      type: "array",
      items: { type: "object", additionalProperties: false, required: ["step", "reason"], properties: { step: { type: "string" }, reason: { type: "string" } } },
    },
    similar_incidents: {
      type: "array",
      items: { type: "object", additionalProperties: false, required: ["incident_id", "reason"], properties: { incident_id: { type: "string" }, reason: { type: "string" } } },
    },
    memory_insights: { type: "array", items: { type: "string" } },
    uncertainties: { type: "array", items: { type: "string" } },
  },
};

export async function analyze(target: Target, memories: ReturnType<typeof recall>): Promise<Analysis["analysis"]> {
  const key = process.env["LOVABLE_API_KEY"];
  if (!key) throw new Error("AI is not configured for this project.");
  const mem = memories.length
    ? memories
        .map(({ i }) => `- Incident #${i.id} (${i.service}): ${i.description}\n  Root cause: ${i.root_cause}\n  Fix: ${i.resolution}\n  Lessons: ${i.lessons_learned}`)
        .join("\n")
    : "";
  const system =
    "You are an SRE incident-response agent. Diagnose the live incident from its signals. Be specific and concise. " +
    (mem
      ? "You have memory of past resolved incidents below. Cite any that are relevant in similar_incidents (use their numeric id) and state what they teach in memory_insights."
      : "You have no memory of past incidents. Leave similar_incidents and memory_insights empty.");
  const user =
    `Service: ${target.service}\nSeverity: ${target.severity}\nDescription: ${target.description}\nSymptoms:\n${target.symptoms.map((s) => `- ${s}`).join("\n")}\nLogs:\n${target.logs.replace(/https?:\S+/g, "").slice(0, 4000)}` +
    (mem ? `\n\nPast incidents from memory:\n${mem}` : "");

  const res = await fetch("https://ai.gateway.lovable.dev/v1/responses", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Lovable-API-Key": key, Authorization: `Bearer ${key}`, "X-Lovable-AIG-SDK": "fetch" },
    body: JSON.stringify({
      model: "openai/gpt-6-astra",
      stream: true,
      store: false,
      reasoning: { effort: "low" },
      input: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      text: { format: { type: "json_schema", name: "analysis", strict: true, schema: SCHEMA } },
    }),
  });
  if (!res.ok || !res.body) {
    const body = await res.text().catch(() => "");
    let msg = `AI request failed (${res.status})`;
    try { msg = JSON.parse(body)?.error?.message || JSON.parse(body)?.message || msg; } catch { /* keep */ }
    if (res.status === 402) msg = "Out of AI credits. Add credits in Settings → Plans & credits.";
    if (res.status === 429) msg = "AI is rate limited right now. Try again in a minute.";
    throw new Error(msg);
  }
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "", text = "", refused = false;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let idx;
    while ((idx = buf.indexOf("\n\n")) >= 0) {
      const frame = buf.slice(0, idx);
      buf = buf.slice(idx + 2);
      const line = frame.split("\n").find((l) => l.startsWith("data:"));
      if (!line) continue;
      const raw = line.slice(5).trim();
      if (raw === "[DONE]") continue;
      try {
        const ev = JSON.parse(raw);
        if (ev.type === "response.output_text.delta") text += ev.delta;
        if (ev.type === "response.refusal.delta") refused = true;
        if (ev.type === "error" || ev.type === "response.failed") throw new Error(ev.error?.message || ev.response?.error?.message || "AI request failed");
      } catch (e) {
        if (e instanceof SyntaxError) continue;
        throw e;
      }
    }
  }
  if (refused || !text) throw new Error("The AI declined to answer this incident.");
  return JSON.parse(text);
}
