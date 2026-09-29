# AGENTS.md
- Single dark theme defined in src/styles.css tokens; fonts Space Grotesk / IBM Plex Sans / JetBrains Mono — matches the repo frontend's brand.
- Everything runs on Lovable Cloud only (no Render): incidents table is memory; AI analysis runs in src/lib/analysis.server.ts via Lovable AI Gateway (openai/gpt-6-astra) — keeps the demo live without an external backend.
- Before/after runs are scored server-side and logged to analysis_runs; the memory dashboard reads averages from it — proves memory lift over time.
