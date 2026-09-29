# AGENTS.md
- This Lovable app is a dashboard frontend for the IncidentIQ FastAPI backend (GitHub repo astacatalyst/Incident-Response-Agent); all backend calls go through server functions in src/lib/incidents.functions.ts — keeps the backend URL server-side and avoids CORS.
- Backend URL comes from INCIDENTIQ_API_URL (defaults to https://incidentiq-backend.onrender.com) — lets the Render address change without code edits.
- src/data/incidents.json mirrors backend/app/db/real_incidents.json and is the offline fallback for list and dashboard — screens stay populated when the free backend sleeps.
- Single dark theme defined in src/styles.css tokens; fonts Space Grotesk / IBM Plex Sans / JetBrains Mono — matches the repo frontend's brand.
- Incident data lives in the Lovable Cloud incidents table (public read-only); src/data/incidents.json is only the fallback if Cloud is unreachable. Render is used only for AI compare and memory-bank stats — keeps screens live without the sleeping backend.
