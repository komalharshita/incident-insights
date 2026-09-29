CREATE TABLE public.incidents (
  id integer PRIMARY KEY,
  service text NOT NULL,
  severity text NOT NULL,
  status text NOT NULL DEFAULT 'resolved',
  symptoms jsonb NOT NULL DEFAULT '[]'::jsonb,
  logs text NOT NULL DEFAULT '',
  metrics jsonb NOT NULL DEFAULT '{}'::jsonb,
  deployment_version text NOT NULL DEFAULT 'public-postmortem',
  description text NOT NULL DEFAULT '',
  root_cause text,
  resolution text,
  successful boolean,
  resolution_time_minutes integer,
  lessons_learned text,
  is_synthetic boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);
GRANT SELECT ON public.incidents TO anon, authenticated;
GRANT ALL ON public.incidents TO service_role;
ALTER TABLE public.incidents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Incidents are publicly readable" ON public.incidents FOR SELECT TO anon, authenticated USING (true);