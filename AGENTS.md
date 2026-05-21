<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Everde AI Operations — deployment context

Ship for **localhost** during design and QA. The roadmap is a **hosted, multi-device web portal** (phones, tablets, desktops) with appropriate auth and hosting; keep layouts responsive and avoid assumptions that only apply to a single desktop on VPN.

## Everde — saved decisions & backlog (handoff)

**Repo / app:** Next.js portal at `C:\Users\isunderland\everde-ai-operations` (package `everde-ai-operations`). Data config: `src/config/portal.ts` (`DATA_ROOT_UNC` = `\\192.168.190.10\Claude Sandbox\DataDrops`).

**Current portal behavior:** Subsections are in-app routes only. They **do not** open Excel over SMB and **do not** recalculate workbooks yet — `ReportPlaceholder` + `ReportShell` show UNC paths for traceability; real metrics require a future **ingest → compute → persist → bind UI** pipeline.

**Data / pipeline (planned):** Weekly import (and optional manual upload). Prefer **deterministic** code or existing Python (`Sales Plan Review` builders, etc.); **do not** depend on Claude tokens for runtime dashboard math. Optional LLM only for narratives/on-demand explanations.

**In-portal AI assistant:** Portal **compendium** analyst — header + drawer; **OpenAI / Claude toggle**. Context: catalog + **freight** + **sales plan** + **nursery DEMAND** + **retail** + **weather** Blob JSON (compacted). **Backlog:** live weather API fetch; rate limits; optional page-only mode.

**Snapshot 0.5.8 (portal app):** Retail exec dashboard fix (B1–B4 buckets), assistant retail/weather context. **0.5.7:** **West Coast Retail Opportunity** + **Weather** dashboard embeds (Blob JSON + HTML APIs, same pattern as freight/sales plan). Retail pipeline: `build_retail_workbooks.py` → `DataDrops\SalesOpportunity\` → `extract_retail_opp.py` → Blob; Monday **Everde-Retail-WeeklyCheck** (10:00 AM). **0.5.6:** compendium assistant (OpenAI + Claude). See `scripts/freight/FREIGHT_DASHBOARD_DATA.md` and `scripts/windows/WEEKLY_DROP_AGENT.md`.

**Last session (2026-05-21):** Fixed retail exec summary (`action_buckets` + `region_crosstab` in JSON from Region Comparison); republished Blob Wk21. Assistant compendium includes retail + weather JSON. **v0.5.8** on `origin`. Production: https://everde-operations.vercel.app . **Demo:** hard-refresh retail tabs after deploy. **Weather:** snapshot on Blob today; live internet fetch is backlog (share has `JS Files\Weather Data\scripts\fetch_weather_v2.py`). **DataDrops inventory walk:** TODO script to catalog share files (`feed`/`output`/`code`) — not built yet.

**Share layout — `Shared` folder:** Treat as primary **feeds & reference** hub: `Sales Data` (large `Sales by Item` / dated 2026 snapshots), `Sales Plan` (`Sales Plan by Item`), `INV` (`Inventory Transform` dated), `Housing Data` (e.g. permits), `Allocation Files` (allocation templates), `Inventory Cross References` (xref `.xlsb`, large Key Item extracts), `Misc Look Ups` (pricing/product lookups). **Section folders** (`Freight`, `Sales Plan Review`, …) hold **dashboard deliverables** and sometimes generators (`.py`, `changes_history.json`, docs). **Retail:** `scripts/retail-opportunity/build_retail_workbooks.py` builds five workbooks from share feeds → `DataDrops\SalesOpportunity\`; `extract_retail_opp.py` → Blob JSON for the portal embed. Monday agent task: build (if sources changed) + extract/publish.

**Centralized file drop (TODO):** Add explicit inbox under share (e.g. `Shared\_incoming` or `Shared\WeeklyDrop`) so weekly drops are not scattered; separate **inbound feeds** from **published report outputs** if needed.

**Inventory script (TODO — user requested):** Walk `DataDrops` tree, emit CSV/MD with columns like `path, size, lastWrite, guessed_role` (`feed` | `reference` | `output` | `code`) using heuristics (naming, size, folder).

**Online / VPN:** Production should not rely on each user mounting UNC; use **sync/ETL** from share (agent on VPN/LAN) into **cloud storage + DB** the hosted app reads. Git for **source code** is separate from where Excel binaries live.

**Windows / build:** `next.config.ts` includes a small webpack plugin normalizing `Everde-AI-Operations` vs `everde-ai-operations` path casing; keep a single canonical project path. Custom `src/pages/_app.tsx` + `_error.tsx` + root `dynamic = 'force-dynamic'` were needed for stable `next build` on this setup.

**Home copy:** Portal home includes a **phase note** (local dev now; hosted multi-device later).
