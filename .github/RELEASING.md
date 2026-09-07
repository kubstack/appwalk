# Releasing

Appwalk uses [release-please](https://github.com/googleapis/release-please) for versioning and [npm trusted publishing](https://docs.npmjs.com/trusted-publishers/) (OIDC) for publishing. There is no manual `npm version` or `npm publish` step.

## How a release happens

1. Every PR merged into `main` must have a title in [Conventional Commits](https://www.conventionalcommits.org/) form (`feat: ...`, `fix: ...`, `feat!: ...` for a breaking change). Only the squash-merge commit message (= the PR title) matters — commits inside the branch can be messy.
2. On every push to `main`, the `release-please` workflow opens or updates a single standing **Release PR** (`chore(main): release X.Y.Z`) that bumps `package.json`, `.release-please-manifest.json`, and `CHANGELOG.md` based on the commits since the last release.
3. When you're ready to ship what's in the Release PR:
   - Optionally curate `CHANGELOG.md` on that PR's branch for a cleaner entry (release-please's raw commit list is functional but verbose). Any manual edit is only safe if nothing else gets merged to `main` before you merge the Release PR — another push re-runs release-please and force-pushes the branch, wiping manual edits.
   - Merge the Release PR (squash). Repo rulesets require a review that, as sole maintainer, you can't give yourself — use the admin bypass option in the merge UI.
4. Merging creates tag `vX.Y.Z` and a GitHub Release. The tag push triggers `.github/workflows/release.yml`, which builds, tests, and runs `npm publish --provenance --access public`.
5. Publishing authenticates via OIDC trusted publishing configured on npmjs.com (package settings → Trusted Publisher → GitHub Actions, repo `kubstack/appwalk`, workflow `release.yml`, "Allow npm publish" enabled) — no token involved.

## Notes and gotchas

- The package publishes as **`@kubstack/appwalk`**, not unscoped `appwalk` — npm's typosquat-similarity check blocks the unscoped name as too close to the unrelated existing package `app-walk`, with no override. The `appwalk` CLI command name is unaffected (`bin` field), only the install/publish name is scoped.
- Tags are a plain `vX.Y.Z` (`include-component-in-tag: false` in `release-please-config.json`), independent of whatever the npm package name is — keeps `release.yml`'s `v*` tag trigger stable even if the package is ever renamed again.
- If you ever need to force a specific version (e.g. overriding an auto-computed bump), push a commit to `main` with an empty body and a `Release-As: X.Y.Z` footer. Editing files directly on the Release PR branch does **not** stick — it gets overwritten on the next release-please run.
- After a real publish, `npm view @kubstack/appwalk version` can lag a few minutes behind what the GitHub Actions log reports — registry propagation delay, not a failed publish. Check the workflow log for the `+ @kubstack/appwalk@X.Y.Z` confirmation line if in doubt.
- README badges (shields.io) can show stale data briefly after a release due to caching (shields.io's own cache plus GitHub's camo proxy for external README images). Usually resolves within a few minutes.
