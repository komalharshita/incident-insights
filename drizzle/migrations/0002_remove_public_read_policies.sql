DROP POLICY IF EXISTS "Runs are publicly readable" ON public.analysis_runs;
DROP POLICY IF EXISTS "Incidents are publicly readable" ON public.incidents;
REVOKE SELECT ON public.analysis_runs FROM anon;
REVOKE SELECT ON public.incidents FROM anon;
GRANT ALL ON public.analysis_runs TO service_role;
GRANT ALL ON public.incidents TO service_role;