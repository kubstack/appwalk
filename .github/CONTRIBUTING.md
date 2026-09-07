# Contributing to Appwalk

## Development setup

```bash
git clone https://github.com/kubstack/appwalk.git
cd appwalk
npm install
npx playwright install chromium  # add firefox/webkit too if you touch --browser code paths
```

## Before opening a pull request

```bash
npm run typecheck
npm run lint
npm run format:check
npm test
```

All four must pass; CI runs the same checks. `npm test` runs the unit and end-to-end suites locally; it does not call an LLM or an external application, so it needs no API key.

## PR titles: Conventional Commits

This repo only allows squash merging (enforced in repo settings, not a manual choice), so **the PR title becomes the single commit message on `main`**. [release-please](https://github.com/googleapis/release-please) reads that title to decide the next version and changelog entry. Commit however you like inside your branch; only the PR title has to follow [Conventional Commits](https://www.conventionalcommits.org/):

| Prefix                                                     | Meaning               | Version effect                                        |
| ---------------------------------------------------------- | --------------------- | ----------------------------------------------------- |
| `feat: ...`                                                | A new feature         | Minor                                                 |
| `fix: ...`                                                 | A bug fix             | Patch                                                 |
| `feat!: ...` / `fix!: ...`, or a `BREAKING CHANGE:` footer | A breaking change     | Minor while Appwalk is below `1.0.0`, major afterward |
| `chore:`, `docs:`, `refactor:`, `test:`, `ci:`             | No user-facing change | None                                                  |

## What changes need tests

Changes should preserve the CLI/config contract, keep sensitive values out of logs and committed files, and add focused tests for behavioral changes. See [Architecture](../docs/architecture.md) for module boundaries and [Reports and artifacts](../docs/reports.md) for the output contract.

## Code style

Formatting is enforced by Prettier (`npm run format` to fix, `npm run format:check` to verify) and code quality by ESLint (`npm run lint`). Both run in CI; fix locally before pushing rather than relying on CI to catch it.

## Reporting a security issue

Do not open a public issue for a security vulnerability. See [SECURITY.md](SECURITY.md).
