# Appwalk

[![npm version](https://img.shields.io/npm/v/%40kubstack%2Fappwalk.svg)](https://www.npmjs.com/package/@kubstack/appwalk)
[![CI](https://github.com/kubstack/appwalk/actions/workflows/ci.yml/badge.svg)](https://github.com/kubstack/appwalk/actions/workflows/ci.yml)

**Appwalk lets an AI explore your web app and turn successful user journeys into verified Playwright tests.**

Point it at an application, describe what matters, and let it use the browser like a real user. Appwalk records what happened, replays each discovered flow in a clean session, and generates an ordinary Playwright spec only for flows that replay successfully.

## Why use it?

- Start E2E coverage for an app that has little or no coverage.
- Turn a newly shipped feature into regression tests without writing the first journey by hand.
- Check a specific area with a natural-language scope and acceptance criteria.
- Probe accessibility, validation, permissions, resilience, race conditions, uploads, and other boundaries with focused personas.
- Keep the result in your existing Playwright suite. Running the generated test later does not require an AI model.

## How it works

```text
scope + persona + expectation
              ↓
      browser exploration
              ↓
   replay in a clean session
              ↓
 report + verified Playwright tests
```

The important distinction is verification: an interesting action sequence is not enough. A flow becomes a generated test only after deterministic replay confirms it. Challenge personas can also produce findings when a replay-confirmed boundary check succeeds unexpectedly.

## Quick start

Requirements: Node.js 24+, a Playwright browser, and an API key for your chosen hosted provider. The commands below use the published npm package; no local checkout or global install is needed.

```bash
# Install the browser version used by Appwalk.
npx -p @kubstack/appwalk -- playwright install chromium

export OPENAI_API_KEY="..."

npx @kubstack/appwalk run https://your-app.example \
  --provider openai \
  --model your-model \
  --persona noah \
  --max-steps 25
```

Open the generated `report.html` first. Each run gets its own directory under `./appwalk-output/`, containing the report, evidence, and—when a flow was replay-confirmed—a `discovered.spec.ts` Playwright test.

Run the generated test with:

```bash
npx playwright test ./appwalk-output/<execution-id>/discovered.spec.ts
```

Supported providers are OpenAI, Anthropic, Gemini, Grok, and Ollama. The provider and model are always explicit; see [Getting started](docs/getting-started.md) for credentials, local Ollama setup, and authenticated applications.

## Focus the exploration

Use `--scope` to point Appwalk at a feature or objective. Add one or more `--expect` values to describe what should be true after the journey.

```bash
npx @kubstack/appwalk run https://your-app.example \
  --provider openai --model your-model \
  --persona noah --max-steps 25 \
  --scope "Explore account settings and change the notification preference" \
  --expect "The saved preference is visible after returning to settings"
```

Personas are predefined testing focuses: choose one based on what you want Appwalk to explore. For example, `noah` covers the straightforward first-time-user journey, `mia` checks the app on mobile, `kai` uses only the keyboard, while `freddie`, `owen`, `iris`, and `gabe` focus on invalid input, anonymous access, authorization boundaries, and network failures. A persona changes the behavior Appwalk looks for—for instance, `iris` may try `/orders/124` after seeing `/orders/123` to check whether another user's data is protected. See [Personas and exploration](https://github.com/kubstack/appwalk/blob/main/docs/personas.md) for the complete list.

## The three commands

| Command                    | Use it for                                             |
| -------------------------- | ------------------------------------------------------ |
| `run <url>`                | Explore, verify, report, and generate tests in one go. |
| `explore <url>`            | Explore and report without generating a test spec.     |
| `generate <discovery-dir>` | Generate tests later from a previous discovery bundle. |

For a repeatable setup, put the options in YAML and pass it explicitly:

```bash
npx @kubstack/appwalk run --config ./appwalk.config.yaml
```

Appwalk does not auto-discover configuration files. See [Configuration](docs/configuration.md).

## Authentication and safety

For a public app, no credentials are needed. For a normal login flow, pass credentials through environment variables:

```bash
npx @kubstack/appwalk run https://your-app.example \
  --email "$APP_USERNAME" --password "$APP_PASSWORD" \
  --provider openai --model your-model --persona noah
```

For SSO, MFA, CAPTCHA, or another already-authenticated session, use `--storage-state` instead.

State-changing requests (`POST`, `PUT`, `PATCH`, and `DELETE`) are blocked by default. Use a staging or disposable environment, and add `--allow-destructive` only when those side effects are intentional.

## Learn more

- [Getting started](docs/getting-started.md) — complete first-run walkthrough
- [Commands and options](docs/commands.md) — CLI reference
- [Personas and exploration](docs/personas.md) — scopes, expectations, and personas
- [Reports and artifacts](docs/reports.md) — output files and result meanings
- [Configuration](docs/configuration.md) — YAML and multi-person runs
- [Troubleshooting](docs/troubleshooting.md) — common setup and runtime issues
- [Architecture](docs/architecture.md) — internals for contributors

## Development

```bash
npm install
npx playwright install chromium
npm test
```

See [CONTRIBUTING.md](.github/CONTRIBUTING.md) for the full development and pull-request checklist.
