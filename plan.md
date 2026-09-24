# Obsidian CRM — Plan

A lightweight personal/small-team CRM that lives inside an Obsidian vault. The UI is built in React; the data stays as plain Markdown notes with YAML frontmatter, so everything remains readable, linkable, and usable without the plugin.

---

## 1. Goals & Non-Goals

### Goals
- **Markdown is the database.** Every contact, company, deal, and interaction is a normal note. No hidden JSON store for core data.
- **Fast React views** on top of those notes: contact list, company pages, deal pipeline (kanban), activity timeline, follow-up dashboard.
- **Native Obsidian feel**: uses Obsidian CSS variables, works in light/dark themes, keyboard-friendly, works on mobile.
- **Plays well with the vault**: wikilinks between people/companies/deals, compatible with Dataview/Bases, daily notes, templates.

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
owner: me
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

### Deal — `CRM/Deals/Acme - Pilot.md`
```yaml
---
type: crm-deal
name: Acme – Pilot
company: "[[Acme Inc]]"
contacts: ["[[Jane Doe]]"]
stage: proposal         # configurable pipeline stages
value: 12000
currency: EUR
expected_close: 2026-11-15
probability: 0.4
---
```

### Interaction — `CRM/Interactions/2026-09-20 Call with Jane Doe.md`
```yaml
---
type: crm-interaction
kind: call              # call | email | meeting | note | message
date: 2026-09-20
contacts: ["[[Jane Doe]]"]
deal: "[[Acme - Pilot]]"
summary: Discussed pilot scope
---
Meeting notes…
```

**Design decisions**
- Relationships are **wikilinks** in frontmatter → Obsidian's link graph/backlinks work for free, and renames are handled by Obsidian.
- Interactions are separate notes (not appended inside contact notes) so they can link to many contacts/deals and show up in timelines. *Option:* also support logging interactions into the daily note (setting).
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
| Drag & drop | `@dnd-kit/core` | For kanban pipeline |
| Tables | `@tanstack/react-table` (headless) | Sorting/filtering/virtualization for large contact lists |
| Dates | `date-fns` (or Obsidian's bundled `moment`) | Prefer `moment` to avoid extra bundle weight |
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
│  - in-memory maps        │        │  - createContact/Deal/...  │
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
- **Hooks** — `useContacts(filter)`, `useEntity(path)`, `useDealsByStage()`, `useFollowUps()` built on `useSyncExternalStore(index.subscribe, index.getSnapshot)`.
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
│  │  ├─ types.ts            # Contact, Company, Deal, Interaction
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
2. **Create entities**: commands + modal forms — "New contact", "New company", "New deal".
3. **Contacts view**: searchable/sortable table (name, company, status, last contacted, next follow-up, tags). Click → open note.
4. **Entity side panel**: when the active note is a CRM entity, show a React panel with its fields (editable), related entities, and interaction timeline.
5. **Log interaction**: command/modal from any contact/deal note; updates `last_contacted` automatically.

### v0.2
6. **Deal pipeline (kanban)**: columns = stages, drag to move (writes `stage`), totals per column.
7. **Follow-up dashboard**: overdue / today / this week, stale contacts (no touch in N days).
8. **Company view**: contacts, deals, interactions rolled up.

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
- **Manual**: a `test-vault/` folder in the repo with seed data; symlink the built plugin into `test-vault/.obsidian/plugins/obsidian-crm` for dev with hot reload (`pjeby/hot-reload`).
- Seed script to generate N fake contacts for perf testing.

---

## 9. Milestones

| # | Milestone | Deliverables |
|---|---|---|
| 0 ✅ | Scaffold | Sample-plugin setup, React + esbuild working, one "Hello CRM" React view, test vault, lint/test CI |
| 1 | Core data | Types, schema, `CrmIndex`, `CrmRepository`, settings tab, unit tests |
| 2 | MVP UI | Create modals, Contacts table, entity side panel, log interaction → **v0.1** |
| 3 | Pipeline & follow-ups | Kanban, dashboard, company view → **v0.2** |
| 4 | Polish | Mobile layout, quick capture, CSV import/export, custom fields |
| 5 | Release | README, screenshots, GitHub release workflow, submit to community plugins |

---

## 10. Decisions & Open Questions

### Decided
- **Personal use.** No `owner` field and no multi-user conflict handling.
- **Interactions are separate notes.** Logging them into the daily note stays an optional extra.
- **Plugin id `vault-crm`, name "Vault CRM".** Obsidian doesn't allow "Obsidian" in plugin ids or names. Check the community list for a clash before release.
- **`minAppVersion` 1.7.2.** Needed for `workspace.revealLeaf`.
- **TypeScript pinned to 6.0.** typescript-eslint doesn't support TS 7 yet.

### Open
- **Integration with Obsidian Bases / Dataview** — expose data only via frontmatter, or also provide a Bases view?
- **Zustand vs pure `useSyncExternalStore`** — decide at Milestone 1 based on how much derived state we need.
- **Future integrations**: email (IMAP/Gmail), calendar, LinkedIn import, AI summaries of interaction history.

---

## 11. Next Steps
Milestone 0 is done: sample-plugin scaffold, React view bridge, test vault with seed data and Hot-Reload, Vitest, ESLint and CI.

Milestone 1 (core data):
1. `core/types.ts` + `core/schema.ts`: parse and validate frontmatter for the four entity types.
2. `CrmIndex`: build from `metadataCache`, keep it up to date on `changed`/`rename`/`delete`, and track reverse relations. Replaces the temporary `useFolderCounts` hook.
3. `CrmRepository`: create notes from templates and edit fields with `processFrontMatter`.
4. Settings: pipeline stages and default currency. Consider the declarative settings API (`getSettingDefinitions`, Obsidian 1.13+) so settings show up in settings search.
5. Unit tests for the schema, the index and the repository.
