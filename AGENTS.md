# AGENTS.md

Paseo plugins, one per folder. Each folder is a self-contained plugin with its own `package.json` and `paseo-plugin.json`.

## Hard rules (Paseo 0.8+ runtime)

- Layout: `index.client.tsx` + `client/`, `index.server.ts` + `server/`, `shared/`. No other code modules in the plugin root — they are compile errors.
- `paseo-plugin.json` must carry `requirements.paseo`. Missing means `<0.8.0` and the daemon refuses to load.
- Import boundaries: hooks/panel props from `@getpaseo/plugin/client`, server contexts from `@getpaseo/plugin/server`, `defineRpc`/`defineAttachmentSource`/`RpcInput` from the root `@getpaseo/plugin`. Client code must not import `server/` or `node:*`; server code must not import `client/`.
- **Only host-provided modules resolve at install time.** Do not import `@getpaseo/client` (or any other package) directly, even type-only — Git installs have no `node_modules` and the server bundle fails. Types flow in through `@getpaseo/plugin/server` (e.g. `PluginHandlerContext["paseo"]`); use inference instead. (Learned 2026-10-07 when the first Git install of nested-changes failed its boundary check.)
- Client UI: React Native primitives only (`View`, `Text`, `Pressable`, `ScrollView`, `TextInput`). No HTML elements, `className`, `onClick`, or DOM globals. Color everything from `theme.colors`.

## Dev loop

```bash
cd <plugin>
npm install          # first time only
npm run typecheck    # before every reload
npm test             # vitest, where present
paseo plugin install /absolute/path/to/<plugin>   # first time
paseo plugin reload <id> && paseo plugin logs <id>
```

After source edits: reload, then require `running` with no error in `paseo plugin ls`. A failed reload stays failed; read the error and the logs.

## Verifying shareability

The local install has `node_modules`, so it can hide resolution bugs that break Git installs. Before publishing, install from the pushed repo with a throwaway id and require `running`:

```bash
paseo plugin add git:jamesctucker/paseo-plugins:<plugin> --id <plugin>-gh-test
paseo plugin ls    # verify, then: paseo plugin remove <plugin>-gh-test
```

## Conventions

- Comments explain intent (why), not mechanics (what the lines do).
- Docs: `OVERVIEW.md` follows the registry content contract (plain terms, sentence case, no em dashes, no install commands); README is the GitHub-facing doc with install lines.
- Full plugin API: <https://paseo.sh/docs/plugins> and <https://paseo.sh/docs/plugins/reference>.
