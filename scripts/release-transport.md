# Release transport and recovery

`build.yml` no longer uses Actions upload/download-artifact. The artifact quota
cannot block installer transfer. PRs and workflow_dispatch still run checks,
tests and Windows/Linux packaging, but never stage or publish releases.

## Trust and publication boundary

- Only pushes to the exact private source repository on main, claude/**, or v*
  tags can use the helper. The workflow and helper independently enforce this.
- Builds stage assets with the source repository's GITHUB_TOKEN, supplied as
  GH_TOKEN only to the staging step. Checkout does not persist credentials.
- Both matrix jobs use the same source draft, identified by exact tag, commit
  SHA, run ID, version and prerelease flag in its notes. Creation tolerates a
  peer winning the create race, then re-reads and verifies that peer's draft.
- Existing source tags are resolved via the Git refs API, peeling annotated
  tags, and must point to the exact source commit. Missing refs return 404;
  the commits/{ref} API is intentionally not used because absent refs give 422.
- Each OS owns disjoint installer/update/manifest asset names. Retries can
  replace only those names on a verified, unpublished draft. Published assets
  are never overwritten. There is no artifact deletion or quota workaround.
- A release job requires both build jobs to succeed. It downloads only the
  exact expected asset set into an empty directory, validates both platform
  manifests (SHA256) and update metadata (version, installer names, size and
  SHA512), and verifies remote bytes by downloading them again.
- Normal releases are copied to a public **draft** using RELEASES_TOKEN, which
  must remain restricted to Nos-and-Stealzers/pimpin-launcher-releases Contents:
  write. Its target is NOT set to a commit from the private repository.
- Only after both complete copies are verified is the private source release
  published, followed by the public draft. Any upload/validation failure leaves
  drafts unpublished. If public publication itself fails, source may already
  be published; a release-job retry verifies it read-only and completes the
  still-draft public copy. A published public target is never mutated.
- claude/** keeps the existing v0.1.<run>-test private prerelease behavior; it
  never accesses the public repository. Main keeps v0.1.<run>; version-tag
  pushes use the supplied tag's version. latest.yml and latest-linux.yml retain
  the existing public update-feed names and electron-builder contents.

## Test without network or publishing

```sh
node --test scripts/release-assets.test.js
node --check scripts/release-assets.js
npm run check
```

Tests use unmistakably labeled disposable fixture files and an in-memory gh
stub. They exercise the actual CLI's validate command in child processes too.
They cover event gates, races, tag/SHA/run identity, annotated tags, missing and
corrupt assets/metadata, partial transfer failure, published-target rejection,
public credential isolation, recovery, and the workflow YAML. No GitHub writes
are made by the tests. js-yaml is the existing locked electron-builder
transitive dependency, available after npm ci on both matrix runners.

## Release and recovery

There is no new manual publish bypass. Merge the tested PR to main using the
normal exact-head review/CI process; the resulting **push** run automatically
builds, stages and publishes. A workflow_dispatch run is build-only.

For an interrupted push run, after inspecting its failure, retry only failed
jobs using the existing run ID (which preserves the release identity):

```sh
gh run rerun <push-run-id> --failed -R Nos-and-Stealzers/Pimpinminecraftlauncher
```

Do not rerun an already successful public publication or edit/delete another
run's draft to bypass an identity mismatch. Old failed-run drafts are harmless
and intentionally not automatically deleted. If GH_TOKEN or RELEASES_TOKEN is
missing/expired/incorrectly scoped, fix the credential through the approved
secret flow; never fall back to the developer's broad gh login.

After the real push run succeeds, verify the exact source/public tag and read
the public latest.yml/latest-linux.yml and installer assets unauthenticated.
An actual older installed launcher's download/install/relaunch remains a
separate acceptance test; offline transport tests do not prove self-update.
