# Always Be Closing

A personal CRM for [Obsidian](https://obsidian.md). Contacts, companies, projects, meetings, quotes, invoices and requirements are plain Markdown notes with frontmatter, so they stay readable, linkable and searchable even without the plugin. Always Be Closing adds a dashboard, pipeline board, calendar, reports and invoicing on top.

![Dashboard](docs/screenshots/dashboard.png)

- [Features](#features)
- [Getting started](#getting-started)
- [How your data is stored](#how-your-data-is-stored)
- [Commands](#commands)
- [Settings](#settings)
- [Development](#development)

## Features

### Dashboard

The home view (ribbon icon or **Open dashboard**) shows what needs attention today:

- **Headline numbers**: active contacts, companies, open projects and the open pipeline value.
- **Invoices**: issued and paid amounts for the chosen period (compared with the period before), pending and overdue amounts right now, and one stacked chart of every invoice by issue date, colored by its status (pending, overdue, paid, draft, void). Switch between daily, weekly, monthly and quarterly.
- **Upcoming meetings** in the next 7 days.
- **Overdue invoices**, each with a **Mark paid** button.
- **Follow-ups** that are overdue, due today or due this week, with **Log**, **Snooze 1 week** and **Done**.
- **Stale contacts**: active contacts you haven't been in touch with for 30+ days and who have no follow-up planned.
- **Closing soon**: open projects expected to close in the next 30 days.

### Contacts and companies

![Contacts](docs/screenshots/contacts.png)

- **Contacts table**: search by name, email, company, role or tag; filter by status (active, cold, archived); sort any column. Overdue follow-ups are highlighted. On narrow panes and phones, rows become cards.
- **Companies table**: each company's contacts, open projects, open pipeline value and last interaction, rolled up.
- **CSV import** of contacts from LinkedIn (`Connections.csv`), Google Contacts or any CSV with a header row. Columns are matched automatically and can be changed. Existing contacts are skipped, and missing companies can be created.
- **CSV export** of any note type.

### Projects and the pipeline

![Project pipeline](docs/screenshots/pipeline.png)

Projects (formerly *deals*) move through **sales stages** on a board: lead → qualified → proposal → negotiation → won / lost (configurable).

- **Drag cards** between columns on desktop, or use the card's **⋯** menu ("Move to …"), which also works on phones and with the keyboard.
- Column headers show the number of projects and their total value; cards show company, value, probability, expected close, the **current phase**, **requirements done** and the **next deadline**.
- Every stage change is recorded in the project's `stage_history`, including edits you make by hand, which feeds the lead and win/loss reports.

Each project can also have:

- **Phases**: an ordered list (e.g. Discovery, Design, Build, Launch), each with a deadline and a done checkbox. The first unfinished phase is the current one.
- **Requirements**: separate notes linked to the project, with status (open, in progress, done, dropped), priority, deadline and a description. The project shows them as a checklist with a progress bar.
- **Assets**: links to any file in your vault (designs, contracts, PDFs, other notes). Images get a thumbnail.
- **A deadline** for the whole project.

### Details panel

![Details panel](docs/screenshots/project-panel.png)

The right sidebar shows the CRM note you have open, with every field editable in place. What else it shows depends on the note:

- **Contacts, companies and projects**: related contacts, projects, quotes and invoices, and a timeline of interactions (a company's timeline includes those of its contacts and projects).
- **Projects**: current phase, requirement progress, "Next: …" deadline, the requirements checklist, phases and assets.
- **Quotes and invoices**: status, total and the next steps (mark as sent, mark as paid, accepted/declined, create invoice from quote, create PDF).
- **Meetings**: an **Add to calendar** button.
- Buttons to log an interaction, schedule a meeting, or create a contact, project, requirement, quote or invoice pre-filled from the note.
- Problems in a note (a value in the wrong format, a link that doesn't point to a CRM note) are listed, not silently ignored.

### Calendar and meetings

![Calendar](docs/screenshots/calendar-week.png)

- **Month, Week and Agenda** layouts. The week view is a time grid with overlapping meetings side by side; Agenda (the default on phones) lists the next 30 days.
- Shows **meetings**, **follow-ups**, **invoice due dates**, **project close dates**, **deadlines** (projects, phases, requirements) and **past interactions**, each with its own toggle, color and icon. Overdue items are flagged.
- **Schedule meeting** from the toolbar, a day's **+**, a contact or project, or the command palette: kind, date, time, duration, people, project, location and agenda.
- **Add to calendar** writes an `.ics` file next to the meeting note. On desktop it opens in your calendar app (Apple Calendar, Outlook, …) so you can add it; contacts with an email address are included as invitees. **Export upcoming meetings (.ics)** puts every future meeting in one file.

### Quotes, invoices and PDFs

![Invoices](docs/screenshots/invoices.png)

- Quotes and invoices with **line items** (description, quantity, unit price, tax %). Net, tax per rate and total are always calculated.
- **Numbering** like `INV-2026-0007`, restarting every year; the next number is filled in for you.
- **Mark as sent** fills in the issue and due dates (from your payment terms), **Mark as paid** records the payment date, and a quote can be turned into a linked draft invoice with one click.
- **Invoices and quotes** list with status filters (including overdue), search across line items, and totals outstanding and overdue.
- **PDF**: a clean A4 invoice or quote with your business details, optional logo, the customer's address and tax ID, line items that continue across pages, tax per rate, totals and payment details. Saved next to the note and opened in Obsidian. Names with accented characters (č, ć, đ, ő, ł, …) print correctly.

![Invoice PDF](docs/screenshots/invoice-pdf.png)

### Reports

![Reports](docs/screenshots/reports.png)

Daily, weekly, monthly or quarterly, each compared with the period before:

- Leads (projects entering the first stage), quotes sent, invoices sent, revenue paid, projects won, quote acceptance rate, average time to payment and new contacts.
- Outstanding, overdue and open pipeline right now.
- Charts: leads, quotes and invoices over time; invoiced vs paid; projects won and lost; interactions by kind; open pipeline by stage.
- Every chart has a legend, hover and keyboard tooltips, and a **Table** view with all values. Colors are chosen to stay distinguishable with color blindness, in light and dark themes.

### Everything else

- **Quick log interaction…**: pick a contact or project, then log a call, email, meeting or note in a few keystrokes.
- **Custom fields** for any note type (text, number, date, URL, email, phone, dropdown, checkbox, tags). They show up in forms, the details panel and CSV import/export, and optionally as table columns.
- **Mobile**: works on phones and tablets, with card layouts, one pipeline column per screen and larger touch targets.
- Uses Obsidian's own theme, fonts, icons and menus, in light and dark mode.

## Getting started

1. Install the plugin (until it's in the community list: copy `main.js`, `manifest.json` and `styles.css` from a release into `<vault>/.obsidian/plugins/always-be-closing/`) and enable **Always Be Closing** under Settings → Community plugins.
2. Click the contact icon in the ribbon to open the dashboard.
3. Create your first contact, company or project from the command palette (`Always Be Closing: New contact`, …), or import contacts from a CSV.
4. For invoices, fill in **Settings → Always Be Closing → Your business** first, so your details appear on PDFs.

Want to look around first? `npm run demo:vault` builds a `demo-vault/` full of fictional data (see [Development](#development)).

## How your data is stored

Every record is a note with a `type` in its frontmatter. Relationships are ordinary wikilinks, so backlinks, graph view, search, Dataview and Bases all work, and renaming a note keeps its links intact.

| Note type | `type` | Default folder |
|---|---|---|
| Contact | `crm-contact` | `CRM/Contacts` |
| Company | `crm-company` | `CRM/Companies` |
| Project | `crm-project` | `CRM/Projects` |
| Requirement | `crm-requirement` | `CRM/Requirements` |
| Interaction / meeting | `crm-interaction` | `CRM/Interactions` |
| Quote | `crm-quote` | `CRM/Quotes` |
| Invoice | `crm-invoice` | `CRM/Invoices` |

A note counts as a CRM note because of its `type`, wherever it lives. Notes without a `type` inside one of these folders are treated as that folder's type. Example project:

```yaml
---
type: crm-project
name: Acme – Pilot
company: "[[Acme Inc]]"
contacts: ["[[Jane Doe]]"]
stage: proposal
value: 12000
currency: EUR
expected_close: 2026-11-15
deadline: 2027-01-20
phases:
  - { name: Discovery, deadline: 2026-10-01, done: true }
  - { name: Build, deadline: 2026-11-15 }
assets: ["[[wireframes.png|Wireframes]]"]
---
```

The full data model is in [plan.md](plan.md#2-data-model-frontmatter-based).

**Upgrading from "deals"**: notes with `type: crm-deal` and `deal:` links still work. Run **Migrate deals to projects** once to convert them. It moves notes into the projects folder with Obsidian's own rename, so links stay intact.

## Commands

All commands start with **Always Be Closing:** in the command palette.

| Area | Commands |
|---|---|
| Views | Open dashboard · Open contacts · Open companies · Open project pipeline · Open calendar · Open invoices and quotes · Open reports · Show details panel |
| Create | New contact · New company · New project · New requirement · New quote · New invoice · Schedule meeting |
| Log | Log interaction · Quick log interaction… |
| Invoices | Create PDF of this invoice or quote |
| Calendar | Add this meeting to my calendar (.ics) · Export upcoming meetings (.ics) |
| Data | Import contacts from CSV… · Export to CSV… · Migrate deals to projects |

Commands that create notes are pre-filled from the note you have open: "New project" on a company links the company, "Log interaction" on a project links the project and its contacts, and so on.

## Settings

- **Folders** for each note type.
- **Pipeline stages** (comma-separated, in order) and **default currency**.
- **Stale after (days)** for the dashboard's stale-contacts list.
- **Invoices and quotes**: number prefixes, payment terms, quote validity, default tax rate.
- **Your business**: name, address, email, phone, tax ID, bank details, payment note and logo, printed on PDFs.
- **Custom fields** per note type.

## Development

```bash
npm install
npm run setup:vault   # one-time: installs the Hot-Reload plugin into test-vault/
npm run dev           # watch build; copies main.js/manifest/styles into test-vault
npm run demo:vault    # builds demo-vault/ with fictional data (dates relative to today)
```

Open `test-vault/` as a vault in Obsidian, turn on community plugins, and enable **Always Be Closing** and **Hot Reload**. After that, rebuilds reload the plugin automatically. `test-vault/` deliberately still uses the old deal format, so the migration can be tried there. `demo-vault/` is generated and not committed; open it for a fully populated CRM.

| Script | What it does |
|---|---|
| `npm run build` | Type-check and production bundle |
| `npm run lint` | ESLint with `eslint-plugin-obsidianmd` |
| `npm test` | Vitest (jsdom, `obsidian` mocked in `tests/mocks/`) |
| `npm run demo:vault` | Build, then generate `demo-vault/` |
| `scripts/subset-fonts.sh` | Rebuild the PDF fonts in `assets/fonts/` |

### Layout

```
src/
  main.ts              plugin lifecycle only
  settings.ts          settings + settings tab
  core/                data: types, parsing, index, repository, stats, calendar, billing, ICS
  pdf/                 invoice/quote PDF rendering (jsPDF)
  obsidian/            Obsidian glue: views, modals, commands, PDF/ICS export, migration
  ui/                  React: views, components, charts, hooks
assets/fonts/          Noto Sans subset for PDFs (SIL Open Font License)
docs/screenshots/      README images
tests/                 Vitest tests + obsidian mock
test-vault/            dev vault (old deal format, for the migration)
scripts/               test/demo vault setup, font subsetting
```

Design notes and decisions are in [plan.md](plan.md).

## License

[0-BSD](LICENSE). The bundled Noto Sans font is under the [SIL Open Font License](assets/fonts/OFL.txt).
