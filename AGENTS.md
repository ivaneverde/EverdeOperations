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

**In-portal AI assistant (future backlog — not in 0.4):** Top-right control that opens an expandable **side panel** for chat-style Q&A about the **current portal route and on-screen context**, using a user-supplied key to an API such as **OpenAI** (or similar), so ad-hoc analysis does not require switching to Claude. Example prompts to design for: *What is the most likely best way of controlling freight?* *What is the best suggested opportunity to sell for this store?* *Which is the highest selling Home Depot Store?* Implementation will need safe context packaging (section, report, visible tab, optional iframe snapshot or structured metrics), rate limits, and no silent exfiltration of share paths beyond what the user sees.

**Snapshot 0.4.1 (portal app):** Numbered sections with **Main** (unnumbered: Cover, Exec Summary → freight tab routes); **Retail**, **Sales Plan Review**, **Load Board & Freight Analysis** (HTML embed from share + inner sidebar hidden + single scrollport overflow injection); **Supply Inventory** and **Production & Demand Plan** as **section-only** links embedding **`nursery-inventory-dashboard.html`** via `/api/nursery/dashboard-html` (supply vs demand panes); **Communication** (Teams placeholder). Sidebar shows **`package.json` version** next to Everde. Nursery/freight HTML paths: env override or defaults (`Documents`, `public/` copy). See `scripts/freight/FREIGHT_DASHBOARD_DATA.md` and user `DASHBOARD_HANDOFF.md` for data contracts.

**Share layout — `Shared` folder:** Treat as primary **feeds & reference** hub: `Sales Data` (large `Sales by Item` / dated 2026 snapshots), `Sales Plan` (`Sales Plan by Item`), `INV` (`Inventory Transform` dated), `Housing Data` (e.g. permits), `Allocation Files` (allocation templates), `Inventory Cross References` (xref `.xlsb`, large Key Item extracts), `Misc Look Ups` (pricing/product lookups). **Section folders** (`Freight`, `West Coast Retail Opportunity`, `Sales Plan Review`, …) hold **dashboard deliverables** and sometimes generators (`.py`, `changes_history.json`, docs).

**Centralized file drop (TODO):** Add explicit inbox under share (e.g. `Shared\_incoming` or `Shared\WeeklyDrop`) so weekly drops are not scattered; separate **inbound feeds** from **published report outputs** if needed.

**Inventory script (TODO — user requested):** Walk `DataDrops` tree, emit CSV/MD with columns like `path, size, lastWrite, guessed_role` (`feed` | `reference` | `output` | `code`) using heuristics (naming, size, folder).

**Online / VPN:** Production should not rely on each user mounting UNC; use **sync/ETL** from share (agent on VPN/LAN) into **cloud storage + DB** the hosted app reads. Git for **source code** is separate from where Excel binaries live.

**Windows / build:** `next.config.ts` includes a small webpack plugin normalizing `Everde-AI-Operations` vs `everde-ai-operations` path casing; keep a single canonical project path. Custom `src/pages/_app.tsx` + `_error.tsx` + root `dynamic = 'force-dynamic'` were needed for stable `next build` on this setup.

**Home copy:** Portal home includes a **phase note** (local dev now; hosted multi-device later).
