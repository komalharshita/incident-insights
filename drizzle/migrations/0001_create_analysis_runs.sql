CREATE TABLE public.analysis_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id integer NOT NULL,
  service text NOT NULL,
  score_before integer NOT NULL,
  score_after integer NOT NULL,
  memories_recalled integer NOT NULL DEFAULT 0,
  recalled_ids integer[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.analysis_runs TO anon, authenticated;
GRANT ALL ON public.analysis_runs TO service_role;
ALTER TABLE public.analysis_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Runs are publicly readable" ON public.analysis_runs FOR SELECT TO anon, authenticated USING (true);