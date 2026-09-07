# Personas and exploration

Appwalk separates _what the agent is looking for_ from _where it is looking_:

```text
persona  = behavior and risk lens
scope    = area or objective to explore
expect   = conditions that should hold inside that scope
```

## Persona intent

Every built-in persona has one of two intents:

| Intent      | Purpose                                                                        | How the result is treated                                                                                     |
| ----------- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------- |
| `journey`   | Exercise a normal user journey and verify that it completes or remains usable. | A flow must pass discovery and replay verification before it becomes regression coverage.                     |
| `challenge` | Deliberately exercise a boundary, failure, security, or resilience condition.  | A replayed unmet condition can become a confirmed finding; a failed replay is inconclusive rather than a bug. |

## Built-in personas

Each persona is a full, specific brief, not just a label; the descriptions below are a faithful summary of what it actually does and when it considers itself done. They're grouped by what they're checking, not alphabetically.

### Everyday users, different contexts

Journey personas that use the application the way a real person would, but each through a different lens of situation, ability, or device.

| Persona | Intent  | Focus                                                                                                                                                                       |
| ------- | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `noah`  | journey | **The Newcomer.** A first-time visitor taking the most direct, obvious path a normal user would; a confusing control is a usability finding, not something to push through. |
| `wade`  | journey | **The Wanderer.** An inefficient real user who clicks around, backtracks, and changes approach mid-way, but still completes a real flow by the end.                         |
| `rosa`  | journey | **The Regular.** A returning, authenticated user checking that existing history, drafts, and saved state are visible, correct, and usable.                                  |
| `mia`   | journey | **The Mobile Baseline.** Runs on a real phone profile (viewport, touch, device identity) and sweeps across several flows checking layout and reachability.                  |
| `kai`   | journey | **The Keyboard-only.** Completes a real flow using only the keyboard, never `click`, to catch controls that look clickable but ignore Enter/Space.                          |
| `hana`  | journey | **The Hoverless.** Finds hover-dependent content (menus, tooltips) and checks whether it's reachable without hovering, for touch/keyboard users.                            |
| `priya` | journey | **The Polyglot.** Enters legitimate international text (non-Latin scripts, right-to-left, diacritics) and locale formats (dates, decimals, currency).                       |

### Non-linear and stateful flows

Journey personas that test whether state survives being revisited, reconsidered, or interrupted, not just followed start to finish.

| Persona | Intent  | Focus                                                                                                                                                                                            |
| ------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `blake` | journey | **The Backtracker.** Disrupts itself mid-flow with back/forward/reload/reopen-browser or a direct deep-link, then checks what survived, was lost, or got duplicated.                             |
| `tara`  | journey | **The Tweaker.** Commits to an earlier choice, lets its effect propagate (a total, a summary), then changes that choice and checks whether everything downstream updates instead of going stale. |
| `eli`   | journey | **The Expirer.** Clears cookies mid-flow to simulate an expired session, then checks whether the app notices and recovers cleanly instead of silently acting on stale state.                     |
| `casey` | journey | **The Canceller.** Deliberately seeks out cancel, delete, remove, or unsubscribe actions and carries them through, then verifies the removal actually took effect.                               |

### Scale and performance

Journey personas that push legitimate usage to its edges, not invalid input.

| Persona | Intent  | Focus                                                                                                                                                                       |
| ------- | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `max`   | journey | **The Maximalist.** Pushes legitimate values and data-heavy states to their limit (long text, large numbers, big lists) looking for overflow, truncation, or broken layout. |
| `lena`  | journey | **The Laggard.** Injects realistic network latency before a real request and checks loading states, duplicate submissions, and whether the result lands exactly once.       |
| `ezra`  | journey | **The Exporter.** Triggers a real file download or export and confirms a real, non-empty file was actually produced, not just a button that looked like it worked.          |

### Input and data integrity

Challenge personas that feed the application data it shouldn't accept, or shouldn't accept twice.

| Persona   | Intent    | Focus                                                                                                                                                                                              |
| --------- | --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `freddie` | challenge | **The Form Breaker.** Submits invalid, malformed, or hostile values (empty fields, bad formats, script/SQL-injection-shaped strings) and records whether the app rejects or silently accepts them. |
| `dana`    | challenge | **The Duplicator.** Creates the same thing twice with identical values and checks whether the app detects the duplicate or silently creates a second, indistinguishable copy.                      |
| `uma`     | challenge | **The Uploader.** Uploads deliberately problematic files (wrong type, empty, oversized, a repeat) using prepared fixtures and checks whether validation actually holds.                            |

### Access control and entitlements

Challenge personas that test who can reach what, not whether they can log in.

| Persona | Intent    | Focus                                                                                                                                                                                                           |
| ------- | --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `owen`  | challenge | **The Outsider.** Never logs in and tries to reach protected pages or API endpoints directly by URL, checking that anonymous access is actually blocked, not just hidden from navigation.                       |
| `iris`  | challenge | **The ID Swapper.** As an ordinary logged-in user, tries a neighboring resource ID (horizontal/IDOR) or an admin-looking URL it was never linked to (vertical/privilege escalation).                            |
| `gail`  | challenge | **The Gatecrasher.** As an ordinary logged-in user, tries to reach a plan-gated, trial-expired, or quota-limited feature directly, checking whether the limit is enforced server-side or only hidden in the UI. |

### Concurrency and timing

Challenge personas that exploit timing: two things happening at once, or backing out at the last second.

| Persona | Intent    | Focus                                                                                                                                                                                     |
| ------- | --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `riley` | challenge | **The Rusher.** Fires the same action rapidly back-to-back via the `burst` tool, checking for a duplicate submission or a control that stayed active when it should have disabled itself. |
| `talia` | challenge | **The Two-Tabber.** Edits and saves the same record from two open tabs of the same session, checking whether the second save detects the conflict or silently overwrites the first.       |
| `della` | challenge | **The Decliner.** Gets to a real confirmation step for something consequential (delete, checkout, cancel) and backs out at the last moment, checking that nothing was committed anyway.   |

### Infrastructure resilience

| Persona | Intent    | Focus                                                                                                                                                                                                                |
| ------- | --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `gabe`  | challenge | **The Glitch.** Injects a targeted network failure (500, timeout, offline, malformed) or a full connectivity drop before a real request and checks whether the app recovers cleanly or ends up broken or duplicated. |

The persona list is intentionally finite and explicit. A target application does not need to support every persona; a persona should adapt to the application and report when its defining surface does not exist instead of inventing one.

## Scope

Scope is a guide, not a hard URL allowlist. It can point the agent at a feature, section, screen, or business objective without requiring the caller to know the exact route:

```bash
--scope "Explore product browsing, cart, checkout, and order history"
```

This is useful when the route structure is unknown or when several pages make up one feature. Use a URL directly when a known starting point is more useful than a broad objective.

## Expectations

Expectations are attached to a scope and can be repeated:

```bash
--scope "Explore account settings"
--expect "The saved preference is visible after returning to settings"
--expect "The user can leave settings without losing the selected value"
```

An expectation is not a standalone login or journey command. It is a condition Appwalk checks after the current flow has actually performed the behavior described by the expectation. A read-only page or a matching heading from an existing record does not prove that a create, submit, update, complete, or confirm operation happened. The report records whether each expectation was `met`, `violated`, or `unknown`, and where it was observed.
