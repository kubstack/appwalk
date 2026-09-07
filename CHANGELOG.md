# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). This project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html); while the version is below `1.0.0`, a breaking change is released as a `minor` bump rather than a `major` one.

Entries below are generated and maintained by [release-please](https://github.com/googleapis/release-please) from Conventional Commits PR titles. See [CONTRIBUTING.md](.github/CONTRIBUTING.md).

## [0.2.0](https://github.com/kubstack/appwalk/compare/v0.1.0...v0.2.0) (2026-09-07)


### Features

* switch npm publish to trusted publishing (OIDC) ([#14](https://github.com/kubstack/appwalk/issues/14)) ([34411fa](https://github.com/kubstack/appwalk/commit/34411fa09ffde6b8d24ba8ff916c404e4ebc943b))

## [0.1.0](https://github.com/kubstack/appwalk/releases/tag/appwalk-v0.1.0) (2026-09-07)

Initial public release.

Appwalk is a BYOK CLI that drives a real browser through your app with an AI agent, verifies what it finds, and generates Playwright regression tests from the confirmed flows.

### Highlights

* AI-driven exploration of a running app via Playwright, with configurable personas for different user behaviors and device presets
* Concurrent, multi-persona coverage runs, including per-run authentication overrides and shared or per-persona credentials
* Verified flow generation: expectations, network evidence, and visual/consistency checks are confirmed before a flow becomes a test
* Generated Playwright test suites with shared fixtures and credential helpers
* HTML reporting with flow summaries, report metadata, and a coverage view
* Support for Anthropic, OpenAI, and Google Gemini as providers
* Safety guardrails for destructive actions, request redaction, and upload/URL validation
* Rate limit handling with retries and `AbortSignal` support for provider requests

## [Unreleased]
