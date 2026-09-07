# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). This project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html); while the version is below `1.0.0`, a breaking change is released as a `minor` bump rather than a `major` one.

Entries below are generated and maintained by [release-please](https://github.com/googleapis/release-please) from Conventional Commits PR titles. See [CONTRIBUTING.md](.github/CONTRIBUTING.md).

## [0.1.0](https://github.com/kubstack/appwalk/compare/appwalk-v0.1.0...appwalk-v0.1.0) (2026-09-07)


### Features

* add accessibility tree truncation to prevent oversized content and include tests ([70fd170](https://github.com/kubstack/appwalk/commit/70fd1707a6f8d9c9b1d1c5a9708eae818338a771))
* add browser engine configuration and support for multiple engines in CLI and tests ([b200222](https://github.com/kubstack/appwalk/commit/b20022296c4f73f6f0bfe3dc0b581a8ea39b7ae5))
* add coverage reporting and infrastructure URL filtering to enhance test accuracy ([a34c8ab](https://github.com/kubstack/appwalk/commit/a34c8ab50e30a3b1c2acaacddb8f39103fb894f1))
* add device preset support for personas and enhance context handling in tests ([53e18a0](https://github.com/kubstack/appwalk/commit/53e18a04a77ba92183614e3e8e77c99569450a79))
* add HTML report generation functionality ([c6536d3](https://github.com/kubstack/appwalk/commit/c6536d31d605a97622ade96dcf6c5aa888461767))
* add OpenAI SDK integration and update response handling ([2fc1cbc](https://github.com/kubstack/appwalk/commit/2fc1cbc29c5e17bd2b3cb1bfb63141ead5374494))
* add provider factory and response variant execution support ([5981351](https://github.com/kubstack/appwalk/commit/59813515de1bab4c6ef5649245e1c028a5b2e445))
* add support for AbortSignal in provider requests and enhance rate limit handling ([5155158](https://github.com/kubstack/appwalk/commit/5155158fe0ed31b5dbac6ef452103236f73192b8))
* add support for concurrent persona exploration ([8294824](https://github.com/kubstack/appwalk/commit/82948243249d7b5d3794f2a83047fff762ed7c09))
* add support for per-run authentication overrides in coverage runs ([eb60dfa](https://github.com/kubstack/appwalk/commit/eb60dfa44f95d57a8383cd47c8276e7ceeb787be))
* add tab management functionality with openTab and switchTab actions ([26ea888](https://github.com/kubstack/appwalk/commit/26ea88812fde77f2394c35cd698841cec4cff274))
* **browser:** remove hardReload action and related references from the codebase ([37dfcec](https://github.com/kubstack/appwalk/commit/37dfcec8546ac8d89ae6f1e8b56d177eae36adb1))
* **burst:** implement burst action with count validation and budget enforcement ([8650951](https://github.com/kubstack/appwalk/commit/8650951308f4a6cbadc2532c464ad63b74091047))
* **cli:** enhance CLI argument parsing to reject unknown, extra, and duplicate options ([cebd948](https://github.com/kubstack/appwalk/commit/cebd9485e2ddd79244699980be22709341f212f0))
* **credentials:** add support for local credentials sidecar and update related documentation ([ae92e7b](https://github.com/kubstack/appwalk/commit/ae92e7b39bfc2165d6784721c0e7e9ed87a53412))
* **download:** enhance download action handling and add validation for downloaded file size ([49dfe7b](https://github.com/kubstack/appwalk/commit/49dfe7bad0ec565b922ab5a26d507862a1fbab7c))
* enhance action handling and logging capabilities ([c842b7b](https://github.com/kubstack/appwalk/commit/c842b7bf6ddda2500dd4d347fd9ac0af9b52024f))
* enhance browser context handling and popup detection across multiple pages ([5b5c7c5](https://github.com/kubstack/appwalk/commit/5b5c7c5564cbac5da4d21326c9f6d3f6e06ce7a4))
* enhance locator functionality with support for label, placeholder, alt, and title prefixes ([83b92c7](https://github.com/kubstack/appwalk/commit/83b92c7d02db27d0521d0848351c7b59b40d559d))
* enhance network handling and evidence verification in agent flow ([9d0fe0b](https://github.com/kubstack/appwalk/commit/9d0fe0bce3245ae67ea96f142951780c3860736d))
* enhance page observation to flag content overflow and add related tests ([cecfb80](https://github.com/kubstack/appwalk/commit/cecfb80bdad0e091b1c517baf347f8f88dcd5750))
* enhance report generation with additional metadata and improve HTML output ([607385b](https://github.com/kubstack/appwalk/commit/607385b282082da3db9e9bf0ce00a4c8c237599b))
* enhance report structure and variant handling ([665ccfe](https://github.com/kubstack/appwalk/commit/665ccfe9005482624a9cee2c82bb879bc3429eb2))
* enhance test suite generation with shared fixtures and credential helpers ([94953c2](https://github.com/kubstack/appwalk/commit/94953c26ed8ded798c8e40facb50df0872699179))
* enhance tool definitions and actions for improved interaction handling ([38a87c9](https://github.com/kubstack/appwalk/commit/38a87c934161120828b04914194b9020e026abf1))
* **exit-codes:** introduce standardized exit codes for CLI and report handling ([bfcbce4](https://github.com/kubstack/appwalk/commit/bfcbce47fc4777885836c6e491d55859024ee922))
* implement pollUntil function for reliable condition checking and add tests for verifyExpectation ([c9dcb72](https://github.com/kubstack/appwalk/commit/c9dcb727d74a6cfdb9e7433b93a60d2319c81a20))
* implement rate limit handling with retries and add tests for rate limit logic ([70fd170](https://github.com/kubstack/appwalk/commit/70fd1707a6f8d9c9b1d1c5a9708eae818338a771))
* introduce BrowserLifecycle for improved context and page management ([95ccae9](https://github.com/kubstack/appwalk/commit/95ccae98e1bfc45dfa18b0afeb3ee4432be3c08e))
* **locator:** enhance string escaping and regex handling; add validation for expectations and tool inputs ([222e740](https://github.com/kubstack/appwalk/commit/222e7404a90279013cdff852c618ba5a0a74e73e))
* **login:** enhance login field detection and improve error messaging for login failures ([89708f7](https://github.com/kubstack/appwalk/commit/89708f7bddd47309df247db7a6f4e2aa6da76a16))
* **login:** implement shared login contract for runtime and generated helpers ([76c85c2](https://github.com/kubstack/appwalk/commit/76c85c2964a7f03f113088e00c0bb1e666900842))
* **playwright:** remove Playwright configuration file ([273c721](https://github.com/kubstack/appwalk/commit/273c721f83b49b36cafd0bc27e2099ef1d4bbcbd))
* prepare appwalk for npm publishing ([57d2ede](https://github.com/kubstack/appwalk/commit/57d2edeaa7f81f96f2d374f11d149431fe6afdff))
* **recorder:** add bodyReadTimedOut flag to NetworkEntry and update tests for timeout handling ([b89c95b](https://github.com/kubstack/appwalk/commit/b89c95b6136c190ce070577df2ad57ca57ac0b1d))
* **redaction:** implement comprehensive redaction system for sensitive data ([6d26b77](https://github.com/kubstack/appwalk/commit/6d26b77d8cb31e771c7d76c67b03eef07f44b80e))
* **report:** add flow summary rendering to HTML report ([22fce2c](https://github.com/kubstack/appwalk/commit/22fce2c782951db7d1263f12f92cadda9902cad8))
* **response:** enhance response variant parsing with detailed rejection reasons ([b868318](https://github.com/kubstack/appwalk/commit/b868318329ba9d8d7844f2660ef2852c762cc988))
* **response:** simplify fixture handling by removing method-based queues and updating tests ([821f4c4](https://github.com/kubstack/appwalk/commit/821f4c443783e20caa3c8b830e000e5967613536))
* **safety:** add evaluateSafetyRequest to test allowDestructive behavior in safety guard ([713f977](https://github.com/kubstack/appwalk/commit/713f977eb241ff9df25c688e61d2e7b4ef5bd36a))
* **safety:** implement request safety policy and integrate into apiRequest and tool execution ([2c68e95](https://github.com/kubstack/appwalk/commit/2c68e9567e4f59d52a0b85e18230345f0957cacb))
* **secrets:** update local secrets file naming and improve documentation for credential handling ([c9fc268](https://github.com/kubstack/appwalk/commit/c9fc26899a384a75eb9cde172722816bdc6fd07b))
* **tabs:** enhance tab flow handling to register popups and manage tab states ([b333b13](https://github.com/kubstack/appwalk/commit/b333b1306019961fea1037b72661cbec81be3412))
* **tests:** add OpenAI adapter test for rejecting malformed responses ([b9eb62c](https://github.com/kubstack/appwalk/commit/b9eb62c5943fbc218d8f02a9aea13f7539554eed))
* **trace:** implement browser restart hooks and enhance tracing support across commands ([ad04889](https://github.com/kubstack/appwalk/commit/ad04889c5b2eead6ed74a3f3923ab6f13303fd7b))
* **upload:** implement upload input policy and add related tests ([7c1ef14](https://github.com/kubstack/appwalk/commit/7c1ef1475d8caa1a71d098e6f643d7443628ac48))
* **url:** add URL validation functions and enforce absolute http/https URLs across the application ([0c28a02](https://github.com/kubstack/appwalk/commit/0c28a023514491a21c0078892eb359ef8c8c5427))
* **validation:** add credential pair validation and related tests ([16869a7](https://github.com/kubstack/appwalk/commit/16869a792068dca5403e0db989c99fd7439a02c6))
* **validation:** implement shared validation for discovery artifacts and add related tests ([18dc43a](https://github.com/kubstack/appwalk/commit/18dc43a9457dc9eac23cd3e7303559a416d784c6))
* **validation:** implement tool input validation and add related tests ([cf0c479](https://github.com/kubstack/appwalk/commit/cf0c479c83e8467e409a89cfcc5d2aaaebdd611f))
* **verification:** enhance expectation handling in verification context and add tests for flow verification ([7670829](https://github.com/kubstack/appwalk/commit/7670829a661a9c37977720eaa2abb09448c6b594))
* **verification:** enhance flow verification by adding runtime error handling and related tests ([7cb0255](https://github.com/kubstack/appwalk/commit/7cb02552de35bd0f1fa0d717e111849c7c8a6706))
* **verification:** enhance visual and consistency verification with new layout signals and assertions ([29cb762](https://github.com/kubstack/appwalk/commit/29cb76246ef8c634bec8cff6079c3deb5d6c7d65))
* **verify:** track safety-related request blocks during replay ([b868318](https://github.com/kubstack/appwalk/commit/b868318329ba9d8d7844f2660ef2852c762cc988))


### Bug Fixes

* **cli:** render Configuration panel with intact ANSI colors ([696b5e6](https://github.com/kubstack/appwalk/commit/696b5e68e6dd2e0b74ae3b780718e50acb9e26bc))
* match npm publish workflow trigger to release-please's actual tag format ([#11](https://github.com/kubstack/appwalk/issues/11)) ([803b7f8](https://github.com/kubstack/appwalk/commit/803b7f857b7c056b7f278c42eb1e9bef407c15b7))
* **safety:** improve logging of blocked requests ([b868318](https://github.com/kubstack/appwalk/commit/b868318329ba9d8d7844f2660ef2852c762cc988))


### Miscellaneous Chores

* release 0.1.0 ([ebee5ae](https://github.com/kubstack/appwalk/commit/ebee5aeeebab2e615f6dc567e3343bed484781b4))

## [Unreleased]
