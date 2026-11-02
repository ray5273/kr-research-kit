# Releasing

Every push to `main`, including documentation and analysis examples, runs the
[Release workflow](../.github/workflows/release.yml). After validation, it bumps all
three manifests, moves `CHANGELOG.md`'s `Unreleased` entries into the dated release
section, and adds commit links. It pushes a bot commit and `vX.Y.Z` tag together,
then publishes a GitHub Release with the same changelog body. There is no npm publish.

The largest change across **all commits since the last version tag** determines
the bump: `feat: add coverage` or `feat(chart): add panel` → minor;
`feat!: change format`, `fix(api)!: change contract`, or a body line beginning
`BREAKING CHANGE:` → major; `fix: repair chart`, `docs: update guide`, and messages
without Conventional Commits syntax → patch. The initial version floor is the
manifest's `0.2.0`; the existing `v0.1.0` tag is preserved.

Runs are serialized. If `main` advances during validation, the script recalculates
and validates the latest `main` before an atomic push, without force-pushing.
The workflow uses `GITHUB_TOKEN` with `contents: write`; its bot pushes do not
trigger another push workflow ([GitHub documentation](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/trigger-a-workflow)).

To retry, open **Actions → Release → Run workflow**, select **main**, and run it.
Already released commits create no new version. If a tag was pushed but Release
publication failed, rerunning completes that Release from its tagged changelog,
including when newer changes have arrived. After five concurrent-main retries,
the run fails and can be rerun the same way. No PAT is needed with the current
unprotected `main`; future branch rules must allow this workflow's bot push.

Run the isolated Git/API tests locally with `node --test scripts/test-release.js`.
