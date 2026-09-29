export type Severity = "low" | "medium" | "high" | "critical";

export interface Incident {
  id: number;
  service: string;
  severity: Severity | string;
  status: "open" | "resolved" | string;
  symptoms: string[];
  logs: string;
  metrics: Record<string, any>;
  deployment_version: string;
  description: string;
  root_cause: string | null;
  resolution: string | null;
  successful: boolean | null;
  resolution_time_minutes: number | null;
  lessons_learned: string | null;
  is_synthetic: boolean;
  created_at: string;
  resolved_at: string | null;
  metadata_company?: string;
}

export interface IncidentList {
  items: Incident[];
  page: number;
  page_size: number;
  total: number;
  pages: number;
  source: "live" | "offline";
}

export interface Dashboard {
  source: "live" | "offline";
  total: number;
  resolved: number;
  open: number;
  services: number;
  median_minutes: number;
  by_severity: { name: string; value: number }[];
  by_company: { name: string; value: number }[];
  root_causes: { name: string; value: number }[];
  recent_lessons: { id: number; service: string; lessons: string; date: string | null }[];
  bank: Record<string, any> | null;
}

export interface Health {
  online: boolean;
  status: string;
  detail: Record<string, any>;
}

export interface Analysis {
  incident: Incident;
  analysis: {
    summary: string;
    likely_root_cause: string;
    confidence: "low" | "medium" | "high" | string;
    evidence: string[];
    recommended_actions: { action?: string; title?: string; rationale?: string; priority?: string }[];
    similar_incidents: Record<string, any>[];
    memory_insights: string[];
    uncertainties: string[];
  };
  memory: {
    memory_used: boolean;
    memories_retrieved: number;
    memories: { id?: string | null; content: string; metadata?: Record<string, any>; [k: string]: any }[];
    status: string;
    error?: string | null;
  };
}
