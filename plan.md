# Always Be Closing — Plan

A lightweight personal/small-team CRM that lives inside an Obsidian vault. The UI is built in React; the data stays as plain Markdown notes with YAML frontmatter, so everything remains readable, linkable, and usable without the plugin.

---

## 1. Goals & Non-Goals

### Goals
- **Markdown is the database.** Every contact, company, project, and interaction is a normal note. No hidden JSON store for core data.
- **Fast React views** on top of those notes: contact list, company pages, project pipeline (kanban), activity timeline, follow-up dashboard.
- **Native Obsidian feel**: uses Obsidian CSS variables, works in light/dark themes, keyboard-friendly, works on mobile.
- **Plays well with the vault**: wikilinks between people/companies/projects, compatible with Dataview/Bases, daily notes, templates.

### Non-Goals (for v1)
- Email/calendar sync (maybe later, see §10).
- Multi-user real-time collaboration (the vault's sync solution handles sharing).
- Replacing a full sales CRM (quotas, forecasting, permissions).

---

## 2. Data Model (frontmatter-based)

Each entity type lives in a configurable folder (defaults below) and is identified by a `type` frontmatter field.

### Contact — `CRM/Contacts/Jane Doe.md`
```yaml
---
type: crm-contact
name: Jane Doe
email: jane@acme.com
phone: "+1 555 0100"
company: "[[Acme Inc]]"
role: Head of Ops
tags: [lead, conference-2026]
status: active          # active | cold | archived
last_contacted: 2026-09-20
next_follow_up: 2026-10-01
---
Free-form notes about Jane…
```

### Company — `CRM/Companies/Acme Inc.md`
```yaml
---
type: crm-company
name: Acme Inc
domain: acme.com
industry: Logistics
size: 50-200
tags: [customer]
---
```

### Project — `CRM/Projects/Acme - Pilot.md`
```yaml
---
type: crm-project
name: Acme – Pilot
company: "[[Acme Inc]]"
contacts: ["[[Jane Doe]]"]
stage: proposal         # configurable pipeline stages
value: 12000
currency: EUR
expected_close: 2026-11-15
probability: 0.4
deadline: 2026-12-15    # overall delivery deadline
phases:                 # delivery phases, in order
  - { name: Discovery, deadline: 2026-10-01, done: true }
  - { name: Build, deadline: 2026-11-15 }
  - Launch
assets: ["[[wireframes.png|Wireframes]]", "[[Contract.pdf]]"]   # any vault files
---
```

### Requirement — `CRM/Requirements/SSO login.md`
```yaml
---
type: crm-requirement
name: SSO login
project: "[[Acme - Pilot]]"
status: in-progress     # open | in-progress | done | dropped
priority: high          # high | medium | low (optional)
deadline: 2026-10-20
---
Description of the requirement…
```

### Interaction — `CRM/Interactions/2026-09-20 Call with Jane Doe.md`
```yaml
---
type: crm-interaction
kind: call              # call | email | meeting | note | message
date: 2026-09-20
contacts: ["[[Jane Doe]]"]
project: "[[Acme - Pilot]]"
summary: Discussed pilot scope
---
Meeting notes…
```

### Quote — `CRM/Quotes/Q-2026-0003 Acme Inc.md`
```yaml
---
type: crm-quote
number: Q-2026-0003
status: sent            # draft | sent | accepted | declined | expired
company: "[[Acme Inc]]"
contact: "[[Jane Doe]]"
project: "[[Acme - Pilot]]"
issued: 2026-09-20      # the date it was sent
valid_until: 2026-10-20
currency: EUR
items:
  - { description: Pilot setup, qty: 1, price: 8000, tax: 19 }
  - { description: Training (days), qty: 2, price: 2000, tax: 19 }
created: 2026-09-18
---
```

### Invoice — `CRM/Invoices/INV-2026-0007 Acme Inc.md`
```yaml
---
type: crm-invoice
number: INV-2026-0007
status: sent            # draft | sent | paid | void  (overdue = sent and past due)
company: "[[Acme Inc]]"
contact: "[[Jane Doe]]"
project: "[[Acme - Pilot]]"
quote: "[[Q-2026-0003 Acme Inc]]"
issued: 2026-09-25
due: 2026-10-25
paid_on:                # set by "Mark as paid"
currency: EUR
items: [...]            # same shape as quotes
created: 2026-09-25
---
```
Totals (net, tax, gross) are always calculated from `items`, never stored. A note with no items can give a `total` instead.

### Project stage history (for lead and win/loss stats)
Projects get `created` and `stage_history: ["2026-09-20 lead", "2026-09-28 proposal"]`. The plugin appends an entry whenever the stage changes, whether from the board, the panel or a manual frontmatter edit while Obsidian is open. A project with no history is treated as having entered its current stage on its `created` date (or the file's creation date).

**Design decisions**
- Relationships are **wikilinks** in frontmatter → Obsidian's link graph/backlinks work for free, and renames are handled by Obsidian.
- Interactions are separate notes (not appended inside contact notes) so they can link to many contacts/projects and show up in timelines. *Option:* also support logging interactions into the daily note (setting).
- A `schemaVersion` in plugin settings enables future frontmatter migrations.

---

## 3. Tech Stack

| Concern | Choice | Notes |
|---|---|---|
| Language | TypeScript (strict) | |
| UI | React 18/19 + `react-dom/client` | Mounted via `createRoot` inside Obsidian `ItemView`s / modals |
| Bundler | esbuild | Same as the official `obsidian-sample-plugin`; outputs a single `main.js` |
| State | Zustand (or `useSyncExternalStore` over our own index) | Small, no provider boilerplate |
| Styling | Plain CSS / CSS modules using Obsidian CSS vars (`--background-primary`, `--text-normal`, …) | No Tailwind — avoids fighting theme CSS and keeps bundle small |
| Drag & drop | Native HTML5 drag and drop plus an Obsidian `Menu` ("Move to …") on each card | No dependency. `@dnd-kit/core` hasn't been updated since 2024 and its successor is still 0.x. Touch devices can't use HTML5 drag and drop, so the card menu covers mobile and keyboard |
| Tables | Own `DataTable` component | Sorting in ~60 lines; filtering is done by each view. TanStack Table was dropped at M2: v9 replaced the v8 API. Add windowing (e.g. `@tanstack/react-virtual`) when lists get large |
| Dates | `date-fns` (or Obsidian's bundled `moment`) | Prefer `moment` to avoid extra bundle weight |
| PDF | `jspdf` + bundled Noto Sans subset (`assets/fonts`, SIL OFL) | Works on desktop and mobile. The font covers Latin alphabets (č ć đ ő ł…), which PDF's built-in fonts can't. `scripts/subset-fonts.sh` rebuilds it. jsPDF's HTML/SVG extras (html2canvas, dompurify, canvg) are kept out of the bundle |
| Testing | Vitest + React Testing Library; mocked `obsidian` module | |
| Lint/format | ESLint (`eslint-plugin-obsidianmd`) + Prettier | Obsidian's review bot checks for common issues |

---

## 4. Architecture

```
┌──────────────────────────── Obsidian ────────────────────────────┐
│  Vault / MetadataCache / Workspace                               │
└──────────────┬───────────────────────────────────▲──────────────┘
               │ events (create/modify/rename/      │ writes via
               │ delete, metadataCache 'changed')    │ fileManager.processFrontMatter
               ▼                                    │ vault.create
┌──────────────────────────┐        ┌───────────────┴────────────┐
│  CrmIndex (core, no UI)  │◄──────►│  CrmRepository (writes)    │
│  - in-memory maps        │        │  - createContact/Project/...  │
│  - parsed + validated    │        │  - updateField, moveStage  │
│  - relationship graph    │        │  - logInteraction          │
└──────────┬───────────────┘        └────────────────────────────┘
           │ subscribe()
           ▼
┌──────────────────────────────────────────────────────────────────┐
│  React layer                                                     │
│  <AppContext value={{ app, plugin, index, repo }}>               │
│    Views: ContactsView, CompanyView, PipelineView,               │
│           DashboardView, TimelineView                            │
└──────────────────────────────────────────────────────────────────┘
```

### Key pieces
- **`main.ts` (Plugin)** — registers views, commands, ribbon icon, settings tab; builds `CrmIndex` on `workspace.onLayoutReady`.
- **`CrmIndex`** — reads `metadataCache` for files in CRM folders, parses frontmatter through a schema (Zod or hand-written validators), keeps `Map<path, Entity>` plus reverse relations (company → contacts, contact → interactions). Emits change events; debounced.
- **`CrmRepository`** — the *only* place that writes to the vault. Uses `app.fileManager.processFrontMatter` for safe frontmatter edits and templates for new notes.
- **React bridge** — a small `ReactItemView` base class:
  ```ts
  abstract class ReactItemView extends ItemView {
    root: Root | null = null;
    async onOpen() { this.root = createRoot(this.contentEl); this.root.render(<AppProvider ...>{this.renderView()}</AppProvider>); }
    async onClose() { this.root?.unmount(); }
  }
  ```
- **Hooks** — `useContacts(filter)`, `useEntity(path)`, `useProjectsByStage()`, `useFollowUps()` built on `useSyncExternalStore(index.subscribe, index.getSnapshot)`.
- **Obsidian integration helpers** — open note (`workspace.openLinkText`), hover preview, render markdown (`MarkdownRenderer.render`) inside React components.

### Proposed folder structure
```
obsidian-crm/
├─ manifest.json
├─ package.json
├─ esbuild.config.mjs
├─ tsconfig.json
├─ styles.css
├─ src/
│  ├─ main.ts
│  ├─ settings.ts
│  ├─ core/
│  │  ├─ types.ts            # Contact, Company, Project, Interaction
│  │  ├─ schema.ts           # parse/validate frontmatter
│  │  ├─ CrmIndex.ts
│  │  ├─ CrmRepository.ts
│  │  └─ templates.ts
│  ├─ obsidian/
│  │  ├─ ReactItemView.tsx
│  │  ├─ ReactModal.tsx
│  │  └─ commands.ts
│  ├─ ui/
│  │  ├─ context.tsx
│  │  ├─ hooks/
│  │  ├─ components/         # Table, Kanban, Avatar, TagPill, DatePicker…
│  │  └─ views/
│  │     ├─ ContactsView.tsx
│  │     ├─ PipelineView.tsx
│  │     ├─ DashboardView.tsx
│  │     ├─ EntityPanel.tsx  # sidebar panel for the active note
│  │     └─ TimelineView.tsx
│  └─ utils/
└─ tests/
```

---

## 5. Features

### MVP (v0.1)
1. **Settings**: folder paths per entity type, pipeline stages, default currency, date format.
2. **Create entities**: commands + modal forms — "New contact", "New company", "New project".
3. **Contacts view**: searchable/sortable table (name, company, status, last contacted, next follow-up, tags). Click → open note.
4. **Entity side panel**: when the active note is a CRM entity, show a React panel with its fields (editable), related entities, and interaction timeline.
5. **Log interaction**: command/modal from any contact/project note; updates `last_contacted` automatically.

### v0.2
6. **Project pipeline (kanban)**: columns = stages, drag to move (writes `stage`), totals per column.
7. **Follow-up dashboard**: overdue / today / this week, stale contacts (no touch in N days).
8. **Company view**: contacts, projects, interactions rolled up.

### v0.3+
9. Quick-capture (`Cmd+P → CRM: quick log`) with fuzzy contact picker (`FuzzySuggestModal`).
10. Import/export CSV (e.g. from LinkedIn, Google Contacts).
11. Custom fields per entity type (defined in settings, rendered in forms/tables).
12. Status bar item: "3 follow-ups due".
13. Daily-note integration: log interactions into today's daily note.
14. Birthday / anniversary reminders.

---

## 6. UX Notes
- All views open in the main workspace as tabs; the entity panel lives in the right sidebar.
- Use Obsidian primitives where possible (`Notice`, `Menu` for context menus, `setIcon` for Lucide icons) so it feels native.
- Everything must remain usable if the plugin is disabled — notes are just notes.
- Mobile: tables collapse into cards under a width breakpoint; kanban scrolls horizontally.

---

## 7. Performance
- Build the index from `metadataCache` (already parsed), never read file contents for listing.
- Only index files inside configured CRM folders (or with `type: crm-*`).
- Debounce index updates (~200ms) and batch React notifications.
- Virtualize tables beyond ~200 rows.
- Target: vault with 5k contacts opens contact view < 300ms.

---

## 8. Testing Strategy
- **Unit**: schema parsing, index relationship building, repository write logic (with a mocked `App`/`Vault`).
- **Component**: views with a fake index (React Testing Library).
- **Manual**: a `test-vault/` folder in the repo with seed data; symlink the built plugin into `test-vault/.obsidian/plugins/always-be-closing` for dev with hot reload (`pjeby/hot-reload`).
- Seed script to generate N fake contacts for perf testing.

---

## 9. Milestones

| # | Milestone | Deliverables |
|---|---|---|
| 0 ✅ | Scaffold | Sample-plugin setup, React + esbuild working, one "Hello CRM" React view, test vault, lint/test CI |
| 1 ✅ | Core data | Types, schema, `CrmIndex`, `CrmRepository`, settings tab, unit tests |
| 2 🧪 | MVP UI | Create modals, Contacts table, entity side panel, log interaction → **v0.1** |
| 3 🧪 | Pipeline & follow-ups | Kanban, dashboard, company view → **v0.2** |
| 4 🧪 | Polish | Mobile layout, quick capture, CSV import/export, custom fields |
| 5 🧪 | Invoices, quotes & reports | Quote and invoice notes with line items, numbering, mark sent/paid, convert quote → invoice; project stage history; Reports view with KPIs and charts (daily / weekly / monthly / quarterly) |
| 6 | Release | README, screenshots, GitHub release workflow, submit to community plugins |

---

## 10. Decisions & Open Questions

### Decided
- **Personal use.** No `owner` field and no multi-user conflict handling.
- **Interactions are separate notes.** Logging them into the daily note stays an optional extra.
- **Plugin id `always-be-closing`, name "Always Be Closing"** (renamed from `vault-crm` / "Vault CRM"). No clash in the community list as of 2026-09-25; check again before release. CSS classes use the `abc-` prefix. Obsidian doesn't allow "Obsidian" in plugin ids or names.
- **`minAppVersion` 1.7.2.** Needed for `workspace.revealLeaf`.
- **TypeScript pinned to 6.0.** typescript-eslint doesn't support TS 7 yet.
- **No Zustand.** `CrmIndex` publishes an immutable `CrmSnapshot` (entities plus resolved relations) and React reads it with `useSyncExternalStore`.
- **Hand-written validators instead of Zod.** Parsing never throws. Bad fields are dropped and listed in `entity.issues`, so a note with bad data still shows up.
- **Indexing rule.** The `type: crm-*` field decides the entity type. A note without `type` inside a configured CRM folder gets that folder's type.
- **Relations only resolve to CRM notes of the expected type.** The raw link stays on the entity, so the UI can show links to missing notes.
- **`logInteraction` moves `last_contacted` forward only**, and not for `kind: note`.
- **One field list drives everything.** `core/fields.ts` defines each entity's editable fields (frontmatter key, label, kind, link target). Forms, the details panel and `CrmRepository.createEntity`/`setField` all read from it. UI values use vault paths for relations; the repository turns them into wikilinks.
- **Closed projects.** A stage named `won` or `lost`, or starting with `closed`, counts as closed. Closed projects are left out of open-pipeline totals, "closing soon" and company rollups.
- **Dashboard replaces the home view** and keeps its view type (`always-be-closing-home`), so saved workspaces still open it. It shows follow-ups (overdue, today, next 7 days) with Log, Snooze 1 week and Done. It also lists stale contacts (active, no follow-up set, not contacted within `staleAfterDays`, 30 by default) and open projects closing within 30 days.
- **Company view is a table**: contacts, open projects, open pipeline and last interaction per company. The details panel covers a single company.
- **Custom fields** are defined per entity type in settings: label, frontmatter key (from the label by default), kind (text, number, date, url, email, tel, select, checkbox or tags), select options, and "show in table" for contacts and companies. They appear in forms, the details panel, CSV import/export and (optionally) table columns. Invalid or clashing keys are ignored and flagged in settings. Entities keep their raw `frontmatter` so custom values can be read.
- **React reads settings through `useSettings()`.** The plugin keeps an immutable copy of the settings that is replaced on save. The settings tab still edits `plugin.settings` in place.
- **CSV import is contacts only** (LinkedIn Connections.csv, Google Contacts or any CSV with a header row). The header row is detected after LinkedIn's preamble, and columns are auto-mapped but can be changed. Existing contacts (same email or name) and in-file duplicates are skipped. Missing companies can be created; otherwise the contact gets a `[[Company]]` link to a note that doesn't exist yet.
- **CSV export covers all four types** and writes `<CRM root>/Exports/<type> <date>.csv`. Columns are frontmatter keys; links are exported as note names and lists joined with `; `.
- **Quick log** is a fuzzy picker over non-archived contacts and open projects, followed by a short form (kind, summary, notes; links and today's date are filled in).
- **Editing a multi-link field keeps links that aren't CRM notes** (fixes the M2 data-loss gap).
- **Mobile:** HTML5 drag is turned off on mobile (cards move through the menu). Phones get stacked form labels, one pipeline column per screen and larger touch targets.
- **Invoices & quotes (M5).**
  - Numbering is `<prefix><year>-<4 digits>`, one sequence per year (prefixes `INV-` and `Q-` in settings). The next number is pre-filled and can be edited.
  - The payment term (30 days) and quote validity (30 days) are settings. The default tax rate is a setting too.
  - Money stats count only the default currency; the Reports view says how many documents in other currencies were left out.
- **Reports (M5).** Granularity is daily (last 30 days), weekly (12 weeks, Monday start), monthly (12 months) or quarterly (8 quarters).
  - KPIs compare the selected range with the range just before it.
  - Definitions:
    - **Lead:** a project entering the first pipeline stage.
    - **Quote or invoice sent:** a non-draft document, counted by `issued`.
    - **Revenue paid:** gross of paid invoices, counted by `paid_on`.
    - **Won / lost:** a project entering `won` / `lost`.
    - **Acceptance rate:** accepted ÷ (accepted + declined).
  - Charts are hand-written SVG using the dataviz reference palette (validated on Obsidian's default surfaces). Every chart has a legend, hover/focus tooltips and a table view.
- **Invoice and quote PDFs.**
  - Created with "Create PDF" in the details panel, or the command "Create PDF of this invoice or quote".
  - Saved next to the note (`INV-2026-0007 Acme Inc.pdf`), replacing an older copy, and opened in a new tab.
  - The sender block comes from Settings → Your business: name, address, email, phone, tax ID, bank details, payment note and an optional PNG/JPEG logo from the vault. Companies gained `address` (multi-line) and `tax_id` for the recipient block.
  - Tax is printed per rate. Totals round tax per rate, so the printed lines always add up.
  - Labels are English for now.
- **Calendar (meetings).**
  - Scheduled meetings are interaction notes with `date`, `time` (`HH:MM`), `duration` (minutes) and `location`, created with "Schedule meeting". An interaction counts as scheduled if it's a meeting or dated in the future. Future-dated interactions don't change `last_contacted`.
  - The Calendar view has Month, Week (time grid, overlapping meetings side by side, current-time line) and Agenda (next 30 days; the default on phones).
  - Toggles for five categories: meetings, follow-ups, invoice due dates, project closes and past interactions. Each has a fixed chart color slot plus an icon and a label; overdue items get a warning icon and "(overdue)".
  - Calendar sync is out of scope. Instead, "Add to calendar" writes an `.ics` next to the meeting note (and "Export upcoming meetings" writes one file for all of them). On desktop the file opens in the system calendar app.
  - The dashboard lists meetings in the next 7 days.
- **Deals became projects (schema 2).**
  - Notes are `type: crm-project` in `CRM/Projects`, and interactions, quotes and invoices link with `project:`.
  - Notes in the old format (`type: crm-deal`, `deal:` links) are still read. On startup a notice points to the command "Migrate deals to projects", which converts them and moves notes out of the old deals folder with Obsidian's rename, so links stay intact.
  - A custom deals folder becomes the projects folder.
- **Projects keep one sales stage (board, stats) and add delivery phases.** Phases are a list in the project note (name, deadline, done); the first one not done is the current phase.
- **Requirements are separate notes** linked to one project. They show as a checklist in the project's panel (ticking marks done) and as progress on pipeline cards; dropped ones don't count.
- **Assets are links to any vault file** in the project's `assets` list, picked with a file search. Images get thumbnails; missing files are flagged and kept.
- **Deadlines** (project, open phases, open requirements) appear on the calendar as a sixth category ("Deadlines", slot 6, validated with the others), in the panel as "Next: …" and on pipeline cards.
- **Dashboard invoice stats.** Shown once invoices exist, with its own Daily/Weekly/Monthly/Quarterly switch; amounts only.
  - Tiles: issued and paid over the range (compared with the range before), plus pending and overdue now.
  - One stacked chart, "Invoices by status". Every invoice sits in the period of its issue date (drafts without one use `created`), split by its status today: pending (sent, not yet due), overdue, paid, draft, void.
  - Colors are categorical slots 1–5 in that order, stacked in slot order so only palette-validated neighbours touch; overdue is orange and paid the greenish aqua. The legend, tooltip (with a total) and table name every status.
- **Mixed currencies are never converted.** Totals are shown per currency (e.g. `€62,000 · $5,000`).
- **The details panel docks itself** in the right sidebar on startup, without taking focus.
- **Classic settings tab for now.** The declarative settings API needs Obsidian 1.13 and `minAppVersion` is 1.7.2. Revisit when we raise it (lint warns about this).

### Open
- **Integration with Obsidian Bases / Dataview** — expose data only via frontmatter, or also provide a Bases view?
- **Zustand vs pure `useSyncExternalStore`** — decide at Milestone 1 based on how much derived state we need.
- **Future integrations**: email (IMAP/Gmail), calendar, LinkedIn import, AI summaries of interaction history.

---

## 11. Next Steps
Milestones 2–5 are implemented and unit-tested (128 tests). The Reports charts were checked visually in a light and dark browser preview with sample data. Everything still needs a manual check in `test-vault/` (M4 also on a phone):
- **M2–M4:** contacts, companies, pipeline, dashboard, details panel, forms, quick log, CSV import/export, custom fields.
- **M5:**
  - "New quote" / "New invoice" from a company, contact or project note (pre-filled, next number)
  - Editing line items in the form and the details panel
  - Mark as sent / paid, Accepted / Declined, Create invoice from a quote
  - Projects: run "Migrate deals to projects" on `test-vault` (still in the old format on purpose); add phases, requirements ("Requirement" button / "New requirement") and assets; check the pipeline card and calendar deadlines
  - Calendar: schedule from the toolbar, a day's "+" or a contact/project panel; switch Month/Week/Agenda; toggles; "Add to calendar" opens the .ics in your calendar app (desktop)
  - Create PDF: fill in Settings → Your business (try a logo), then check it opens in Obsidian's PDF viewer
  - "Open invoices and quotes"
  - "Open reports" (all four periods, table toggles, hover and keyboard tooltips)
  - Overdue invoices on the dashboard
  - Move a project on the board and edit a project's `stage` by hand, then check `stage_history`

Known gaps:
- PDF labels are English only, and there's one fixed layout.
- Money stats count the default currency only.
- Only projects moved from now on get a real stage history; older projects count from their `created` date.
- The entity picker can't create notes inline.
- There's no windowing for very large lists.
- Import covers contacts only.
- The settings tab uses the classic API (not searchable in Obsidian 1.13+).

Then Milestone 6 (release): README with screenshots, GitHub release workflow check, community plugin submission (re-check the name and id clash first).
