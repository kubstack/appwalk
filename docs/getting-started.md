# Getting started

This guide takes a new user with nothing installed to a generated Playwright test.

## 1. Install

```bash
npx -p @kubstack/appwalk -- playwright install chromium
```

The command above installs Chromium, the default engine. `--browser firefox` or `--browser webkit` (see [Commands and options](commands.md)) needs its own `npx -p @kubstack/appwalk -- playwright install firefox`/`webkit` first.

Use `-p @kubstack/appwalk --` rather than a bare `npx playwright install`: it resolves the Playwright CLI to the exact version Appwalk depends on, so the downloaded browser build matches what Appwalk actually launches at runtime. A bare `npx playwright install` can resolve a different (often newer) Playwright version and download a browser build Appwalk doesn't recognize, failing with "Executable doesn't exist".

Appwalk itself needs no separate install step; `npx @kubstack/appwalk` fetches and runs it on demand:

```bash
npx @kubstack/appwalk <command> ...
```

## 2. Choose a provider

Set only the credential required by the provider you use. Hosted providers use different variable names; Ollama does not need a key:

| Provider    | Environment variable | Local endpoint           |
| ----------- | -------------------- | ------------------------ |
| `openai`    | `OPENAI_API_KEY`     | Hosted API               |
| `anthropic` | `ANTHROPIC_API_KEY`  | Hosted API               |
| `gemini`    | `GEMINI_API_KEY`     | Hosted API               |
| `grok`      | `XAI_API_KEY`        | Hosted API               |
| `ollama`    | None                 | `http://localhost:11434` |

The selected hosted provider key must be present before the browser run starts. Ollama does not require a key, but the local service and selected model must be available.

Then provide both provider and model on the command line or in an explicitly passed config file. There is no implicit provider or model selection.

## 3. Run a first exploration

```bash
PROVIDER="your-provider"  # openai, anthropic, gemini, grok, or ollama
MODEL="your-model"
npx @kubstack/appwalk run https://your-app.example \
  --provider "$PROVIDER" \
  --model "$MODEL" \
  --persona mia \
  --max-steps 25
```

The action budget is per persona run. A run can discover several flows, but a flow is only generated after it passes replay verification. The default safety policy blocks state-changing HTTP methods.

If the application is public, omit `--email` and `--password`. If it has authentication, choose one of these approaches:

```bash
# Credential login, when the application has a normal username/password flow.
npx @kubstack/appwalk run https://your-app.example \
  --email "$APP_USERNAME" \
  --password "$APP_PASSWORD" \
  --provider "$PROVIDER" --model "$MODEL" --persona mia

# Reuse a browser storage state captured separately.
npx @kubstack/appwalk run https://your-app.example \
  --storage-state ./auth/storage-state.json \
  --provider "$PROVIDER" --model "$MODEL" --persona mia
```

Use `--storage-state` for SSO, MFA, CAPTCHA, or login flows that cannot be completed by a simple credential form.

## 4. Read the result

The CLI prints the execution directory, for example:

```text
appwalk-output/
  2026-08-27T09-42-18-291Z-8e2c4d91/
```

Open `report.html` first. It is the human-facing result. The same directory contains machine-readable JSON, raw evidence, the discovery manifest, and, when applicable, `discovered.spec.ts`.

## 5. Run generated tests

Generated tests use `playwright/test`, the test runner bundled with the `playwright` package, and are independent tests, one per confirmed flow. Running a generated spec needs a local `playwright` install reachable from that directory (a global `npm install -g`/`npx` install does not satisfy `import` resolution). If the target directory has no Node project yet:

```bash
npm init -y
npm install -D playwright
```

Then run one generated spec with:

```bash
npx playwright test ./appwalk-output/<execution-id>/discovered.spec.ts
```

The generated suite always includes a sibling `consent.ts` helper that dismisses a known consent-management-platform banner (Didomi, OneTrust, Cookiebot, and a few others) right after navigating, the same way Appwalk itself does during exploration and replay — it carries no secrets, so unlike the files below it is ordinary generated source, not something to git-ignore. It may also include a sibling `auth.ts` helper and a local `.secrets.json` file for credential login, a local `.storage-state.json` copy for `--storage-state`, and captured response fixtures. These files make the suite runnable immediately, are ignored by Git, and must not be committed. In CI, use fresh credentials or an explicit storage state instead. Treat the generated files as source code: review them and place them in the appropriate test project.

## 6. Use a focused exploration

When you know the area you want to inspect, add a scope:

```bash
npx @kubstack/appwalk run https://your-app.example \
  --provider "$PROVIDER" --model "$MODEL" \
  --persona mia --max-steps 25 \
  --scope "Explore account settings and changing the notification preference" \
  --expect "The saved notification preference is visible after returning to the settings page"
```

An expectation describes a user-visible condition inside the scope. `--expect` requires `--scope`, and the flag can be repeated.

## First-run checklist

| Check                                       | Why it matters                                                                                              |
| ------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Use a disposable or staging target          | Exploration can navigate widely, and `--allow-destructive` can permit mutations.                            |
| Set the provider and model explicitly       | They are required configuration, not hidden defaults.                                                       |
| Start with 15-25 steps                      | This keeps the first run understandable and controls provider usage.                                        |
| Leave destructive actions blocked initially | The default policy prevents common state changes.                                                           |
| Read `report.html` before generated code    | A generated test is an output of confirmed evidence, not a guarantee that every discovered flow was stable. |
