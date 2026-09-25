# Always Be Closing

A personal CRM for Obsidian. Contacts, companies, projects and interactions are plain Markdown notes with frontmatter; the plugin adds React views on top. See [plan.md](plan.md).

## Development

```bash
npm install
npm run setup:vault   # one-time: installs the Hot-Reload plugin into test-vault/
npm run dev           # watch build; copies main.js/manifest/styles into test-vault
```

Open `test-vault/` as a vault in Obsidian, turn on community plugins, and enable **Always Be Closing** and **Hot Reload**. After that, rebuilds reload the plugin automatically. Use the ribbon's contact icon or the **Always Be Closing: Open dashboard** command.

| Script | What it does |
|---|---|
| `npm run build` | Type-check and production bundle |
| `npm run lint` | ESLint with `eslint-plugin-obsidianmd` |
| `npm test` | Vitest (jsdom, `obsidian` mocked in `tests/mocks/`) |

### Layout

```
src/
  main.ts              plugin lifecycle only
  settings.ts          settings + settings tab
  obsidian/            Obsidian glue: ReactItemView base class, views, commands
  ui/                  React: context, hooks, views
tests/                 Vitest tests + obsidian mock
test-vault/            dev vault with seed CRM notes
```
