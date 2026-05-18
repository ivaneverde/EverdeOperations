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

**In-portal AI assistant:** Header prompt + side drawer; **OpenAI / Claude toggle** (`POST /api/assistant/chat`, `GET /api/assistant/config`). Keys: `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`; models: `OPENAI_ASSISTANT_MODEL` (default `gpt-4o`), `ANTHROPIC_ASSISTANT_MODEL` (default `claude-sonnet-4-20250514`). Context: **freight** + **sales plan** Blob JSON (truncated). **Backlog:** nursery demand + retail JSON to Blob; “all portal” mode; rate limits.

**Snapshot 0.5.2 (portal app):** **0.5.1** plus **portal analyst assistant** (OpenAI, Entra-gated API). **Production & Demand Plan** still from `npm run nursery:refresh-demand` → `public/nursery-inventory-dashboard.html`. **Freight** / **Sales Plan** → Blob via weekly scripts; daily Task Scheduler agent unchanged. See `scripts/freight/FREIGHT_DASHBOARD_DATA.md` and `WEEKLY_DROP_AGENT.md`.

**Share layout — `Shared` folder:** Treat as primary **feeds & reference** hub: `Sales Data` (large `Sales by Item` / dated 2026 snapshots), `Sales Plan` (`Sales Plan by Item`), `INV` (`Inventory Transform` dated), `Housing Data` (e.g. permits), `Allocation Files` (allocation templates), `Inventory Cross References` (xref `.xlsb`, large Key Item extracts), `Misc Look Ups` (pricing/product lookups). **Section folders** (`Freight`, `West Coast Retail Opportunity`, `Sales Plan Review`, …) hold **dashboard deliverables** and sometimes generators (`.py`, `changes_history.json`, docs).

**Centralized file drop (TODO):** Add explicit inbox under share (e.g. `Shared\_incoming` or `Shared\WeeklyDrop`) so weekly drops are not scattered; separate **inbound feeds** from **published report outputs** if needed.

**Inventory script (TODO — user requested):** Walk `DataDrops` tree, emit CSV/MD with columns like `path, size, lastWrite, guessed_role` (`feed` | `reference` | `output` | `code`) using heuristics (naming, size, folder).

**Online / VPN:** Production should not rely on each user mounting UNC; use **sync/ETL** from share (agent on VPN/LAN) into **cloud storage + DB** the hosted app reads. Git for **source code** is separate from where Excel binaries live.

**Windows / build:** `next.config.ts` includes a small webpack plugin normalizing `Everde-AI-Operations` vs `everde-ai-operations` path casing; keep a single canonical project path. Custom `src/pages/_app.tsx` + `_error.tsx` + root `dynamic = 'force-dynamic'` were needed for stable `next build` on this setup.

**Home copy:** Portal home includes a **phase note** (local dev now; hosted multi-device later).
