---
name: release
description: "Prepare and publish a release of @geminixiang/jev. Use when releasing this package: bump the version, update the changelog, validate the repository, commit and push, and create the GitHub release that triggers npm trusted publishing."
---

# jev release

## Repository conventions

- Branch: `main`
- Remote: `origin`
- GitHub repository: `geminixiang/jev`
- Git tag and GitHub release title: `v<version>`, for example `v0.4.0`.
- Publishing is performed by `.github/workflows/release.yml` after the GitHub release is
  published. Do not run `npm publish` locally except for a package's first-ever version
  (npm trusted publishing must be linked to a package that already exists on the
  registry; every version after the first goes through the workflow).
- A version containing a prerelease suffix such as `-alpha.`, `-beta.`, or `-rc.` is a
  GitHub prerelease and is published with npm tag `beta`.

## Version rules

- `patch`: bug fixes or maintenance
- `minor`: backward-compatible features
- `major`: breaking changes
- Never reuse a version already present on npm:

```bash
npm view @geminixiang/jev versions --json
```

## Flow

### 1. Check repository state

```bash
git status --short --branch
git branch --show-current
git fetch origin main --tags
git rev-list --left-right --count origin/main...HEAD
```

Stop and ask before proceeding when the branch is not `main`, local `main` is behind or
diverged from `origin/main`, or unrelated changes are present.

### 2. Review changes since the previous release

```bash
git tag --list 'v*' --sort=-version:refname | head -5
git log --pretty=format:'%h %s' <previous-tag>..HEAD
git diff --stat <previous-tag>..HEAD
```

### 3. Draft a changeset (recommended) or write the changelog entry directly

```bash
npx changeset
```

Or add a Markdown file under `.changeset/` by hand with frontmatter
`"@geminixiang/jev": <patch|minor|major>` and a concise, user-visible description.

### 4. Bump the version and changelog

```bash
npm run version   # changeset version && node scripts/sync-version.mjs
```

This updates `package.json`, `CHANGELOG.md`, and `src/version.ts` together. Verify all
three agree:

```bash
node -p "require('./package.json').version"
node -p "require('./src/version.ts')" 2>/dev/null || cat src/version.ts
head -20 CHANGELOG.md
```

### 5. Validate

```bash
npm ci
npm run check   # lint + typecheck + test + build + publint + attw
```

Do not continue if validation fails.

### 6. Commit and push

Read and follow the commit skill before committing.

```bash
git add package.json package-lock.json CHANGELOG.md src/version.ts .changeset
git commit -m "chore: release <version>"
git push origin main
```

Confirm the pushed commit is on `origin/main` before creating the release.

### 7. Draft release notes

Use the changelog entry as the source; adapt the style from the previous GitHub release
if useful:

```bash
gh release view v<previous-version> --repo geminixiang/jev --json body -q .body
```

Write notes to `/tmp/jev-release-<version>.md` with concise sections such as
`## What's changed`, `### Highlights`, `### Verification`.

### 8. Publish the GitHub release

Stable release:

```bash
gh release create "v<version>" \
  --repo geminixiang/jev \
  --target main \
  --title "v<version>" \
  --notes-file /tmp/jev-release-<version>.md
```

Prerelease: add `--prerelease`.

### 9. Verify publication

```bash
gh run list --repo geminixiang/jev --workflow release.yml --limit 5
gh run watch <run-id> --repo geminixiang/jev --exit-status

npm view @geminixiang/jev@<version> version
npm view @geminixiang/jev dist-tags --json
```

A successful GitHub release is not enough: report the release as complete only after the
workflow succeeds and npm returns the new version.

## Guardrails

- Never publish a version that already exists on npm.
- Never run `npm publish` locally for a version after the package's first release; the
  GitHub Actions trusted-publishing workflow is the source of truth.
- Never create a release before its version bump is on `origin/main`.
- Never report success until npm registry verification passes.
