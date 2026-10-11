'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { bump, changelog, createGitHubApi, runRelease } = require('./release');

function git(cwd, ...args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}
function fixture(t, { legacy = true } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'release-test-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const remote = path.join(root, 'origin.git'), cwd = path.join(root, 'checkout');
  fs.mkdirSync(cwd);
  git(root, 'init', '--bare', remote);
  git(cwd, 'init', '-b', 'main');
  git(cwd, 'config', 'user.name', 'Test');
  git(cwd, 'config', 'user.email', 'test@example.com');
  fs.mkdirSync(path.join(cwd, '.claude-plugin'));
  const write = (file, value) => fs.writeFileSync(path.join(cwd, file), value);
  write('manifest.json', '{"version":"0.2.0"}\n');
  write('.claude-plugin/plugin.json', '{"name":"kit","version":"0.2.0"}\n');
  write('.claude-plugin/marketplace.json', '{"plugins":[{"name":"other","version":"9.0.0"},{"name":"kit","version":"0.2.0"}]}\n');
  write('CHANGELOG.md', '# Changelog\n\n## [Unreleased]\n\n### Added\n- Curated item\n\n## [0.2.0] - 2026-07-05\n\nHistorical entry\n');
  git(cwd, 'add', '.');
  git(cwd, 'commit', '-m', 'initial history');
  if (legacy) git(cwd, 'tag', 'v0.1.0');
  git(cwd, 'remote', 'add', 'origin', remote);
  git(cwd, 'push', 'origin', 'main', '--tags');
  const releases = new Map();
  let fail = false;
  const posts = [];
  const api = async (method, endpoint, body) => {
    if (method === 'GET') return releases.get(decodeURIComponent(endpoint.split('/').at(-1))) || null;
    if (fail) throw new Error('simulated API outage');
    posts.push({ method, endpoint, body });
    releases.set(body.tag_name, { id: 1, ...body });
    return releases.get(body.tag_name);
  };
  const validations = [];
  const validate = dir => {
    validations.push(git(dir, 'rev-parse', 'HEAD'));
    const project = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json')));
    const plugin = JSON.parse(fs.readFileSync(path.join(dir, '.claude-plugin/plugin.json')));
    const market = JSON.parse(fs.readFileSync(path.join(dir, '.claude-plugin/marketplace.json')));
    assert.equal(project.version, plugin.version);
    assert.equal(project.version, market.plugins[1].version);
    assert.equal(market.plugins[0].version, '9.0.0');
  };
  const run = options => runRelease({ cwd, repository: 'owner/repo', api, validate, date: '2026-10-11', log: () => {}, ...options });
  const commit = message => {
    write('change.txt', message);
    git(cwd, 'add', 'change.txt');
    git(cwd, 'commit', '-m', message);
    git(cwd, 'push', 'origin', 'main');
  };
  const show = file => git(remote, 'show', `main:${file}`);
  return { cwd, remote, write, releases, posts, validations, run, commit, show, fail: value => { fail = value; } };
}

test('patch, scoped feature, breaking header/footer, and largest bump across commits', () => {
  for (const message of ['docs: update', 'fix: bug', 'plain message', 'revert: feat: removed', 'feat!: incompatible', 'feat(core)!: incompatible']) {
    assert.equal(bump('0.2.0', [message]), message.includes('!') ? '1.0.0' : '0.2.1');
  }
  assert.equal(bump('0.2.0', ['feat(core): addition', 'fix: bug']), '0.3.0');
  assert.equal(bump('0.2.0', ['feat: addition', 'fix: bug\n\nBREAKING CHANGE: incompatible']), '1.0.0');
  assert.equal(bump('1.9.9', ['fix: patch']), '1.9.10');
});

test('changelog moves Unreleased while preserving preamble and historical content', () => {
  const original = '# Notes\n\n## [Unreleased]\n\n### Added\n- User entry\n\n## [0.2.0] - earlier\n\nOld text\n';
  const result = changelog(original, '0.2.1', '2026-10-11', [{ sha: 'abc1234', message: 'fix: item\n\nbody' }], 'owner/repo');
  assert.ok(result.text.startsWith('# Notes\n\n## [Unreleased]\n\n## [0.2.1] - 2026-10-11'));
  assert.ok(result.text.endsWith('## [0.2.0] - earlier\n\nOld text\n'));
  assert.ok(result.body.includes('- User entry'));
  assert.ok(result.body.includes('https://github.com/owner/repo/commit/abc1234'));
});

test('first run uses 0.2.0 floor, preserves legacy tag, limits bot commit, and rerun is idempotent', async t => {
  const f = fixture(t);
  const old = git(f.remote, 'rev-parse', 'v0.1.0');
  f.commit('docs: revised guidance');
  // Local unrelated work must survive, and never enter the release commit.
  f.write('manifest.json', 'local dirty manifest');
  f.write('private.txt', 'private');
  const result = await f.run();
  assert.equal(result.tag, 'v0.2.1');
  assert.equal(git(f.remote, 'rev-parse', 'v0.1.0'), old);
  assert.equal(JSON.parse(f.show('manifest.json')).version, '0.2.1');
  assert.equal(JSON.parse(f.show('.claude-plugin/plugin.json')).version, '0.2.1');
  assert.equal(JSON.parse(f.show('.claude-plugin/marketplace.json')).plugins[1].version, '0.2.1');
  assert.deepEqual(git(f.remote, 'diff-tree', '--no-commit-id', '--name-only', '-r', 'main').split('\n').sort(),
    ['.claude-plugin/marketplace.json', '.claude-plugin/plugin.json', 'CHANGELOG.md', 'manifest.json']);
  assert.equal(fs.readFileSync(path.join(f.cwd, 'manifest.json'), 'utf8'), 'local dirty manifest');
  assert.equal(git(f.remote, 'rev-parse', 'main'), git(f.remote, 'rev-parse', result.tag));
  assert.equal(f.releases.get(result.tag).target_commitish, git(f.remote, 'rev-parse', 'main'));
  assert.ok(f.show('CHANGELOG.md').includes(f.releases.get(result.tag).body));
  assert.equal((await f.run()).released, false);
  assert.equal(f.posts.length, 1);
});

test('repository without tags bootstraps and aggregates minor/major changes', async t => {
  const f = fixture(t, { legacy: false });
  f.commit('fix: bug');
  f.commit('feat(core): feature');
  assert.equal((await f.run()).tag, 'v0.3.0');
  git(f.cwd, 'pull', '--ff-only', 'origin', 'main');
  f.commit('docs: update\n\nBREAKING CHANGE: contract changed');
  assert.equal((await f.run()).tag, 'v1.0.0');
  assert.equal(f.posts.length, 2);
});

test('API failure after push is recovered without another version, including draft release', async t => {
  const f = fixture(t);
  f.commit('fix: repair');
  f.fail(true);
  await assert.rejects(f.run(), /API outage/);
  const publishedHead = git(f.remote, 'rev-parse', 'main');
  assert.equal(git(f.remote, 'rev-parse', 'v0.2.1'), publishedHead);
  f.fail(false);
  f.releases.set('v0.2.1', { id: 42, draft: true });
  assert.equal((await f.run()).released, false);
  assert.equal(f.posts[0].method, 'PATCH');
  assert.equal(f.posts[0].endpoint, '/releases/42');
  assert.equal(f.releases.get('v0.2.1').draft, false);
  assert.equal(git(f.remote, 'rev-parse', 'main'), publishedHead);
});

test('pending release is repaired from tagged changelog even after new commits', async t => {
  const f = fixture(t);
  f.commit('fix: old change');
  f.fail(true);
  await assert.rejects(f.run());
  f.fail(false);
  git(f.cwd, 'pull', '--ff-only', 'origin', 'main');
  f.commit('feat: later change');
  assert.equal((await f.run()).tag, 'v0.3.0');
  assert.ok(f.releases.get('v0.2.1').body.includes('fix: old change'));
  assert.ok(!f.releases.get('v0.2.1').body.includes('feat: later change'));
});

test('main advance before publish triggers recalculation and validation', async t => {
  const f = fixture(t);
  f.commit('fix: original');
  const result = await f.run({ beforePush: ({ attempt }) => {
    if (attempt === 0) f.commit('feat: concurrent feature');
  } });
  assert.equal(result.tag, 'v0.3.0');
  assert.equal(f.validations.length, 2);
  assert.notEqual(f.validations[0], f.validations[1]);
  assert.equal(git(f.remote, 'tag', '--list', 'v0.2.1'), '');
});

test('validation failure prevents push and publication', async t => {
  const f = fixture(t);
  f.commit('feat: broken');
  const before = git(f.remote, 'rev-parse', 'main');
  await assert.rejects(f.run({ validate: () => { throw new Error('invalid skills'); } }), /invalid skills/);
  assert.equal(git(f.remote, 'rev-parse', 'main'), before);
  assert.equal(f.posts.length, 0);
  assert.equal(git(f.cwd, 'tag', '--list', 'v0.3.0'), '');
});

test('atomic push rejection after final fetch retries latest main without leaving a stale tag', async t => {
  const f = fixture(t);
  f.commit('fix: original');
  // Prepare the concurrent commit on a different branch without moving main.
  git(f.cwd, 'checkout', '-b', 'concurrent');
  f.write('concurrent.txt', 'feature');
  git(f.cwd, 'add', 'concurrent.txt');
  git(f.cwd, 'commit', '-m', 'feat: arrived during push');
  const concurrent = git(f.cwd, 'rev-parse', 'HEAD');
  git(f.cwd, 'push', 'origin', 'concurrent');
  git(f.cwd, 'checkout', 'main');
  // The receive hook models main changing after the last fetch. Removing the
  // hook makes this a single race; the next attempt can publish normally.
  const hook = path.join(f.remote, 'hooks/pre-receive');
  fs.writeFileSync(hook, `#!/bin/sh\nrm -- "$0"\nunset GIT_QUARANTINE_PATH\ngit update-ref refs/heads/main ${concurrent}\nexit 1\n`, { mode: 0o755 });
  assert.equal((await f.run()).tag, 'v0.3.0');
  assert.equal(f.validations.length, 2);
  assert.equal(git(f.remote, 'tag', '--list', 'v0.2.1'), '');
  assert.ok(f.releases.get('v0.3.0').body.includes('feat: arrived during push'));
});

test('bounded retries fail cleanly without publishing when main keeps advancing', async t => {
  const f = fixture(t);
  f.commit('fix: original');
  await assert.rejects(f.run({ maxAttempts: 2, beforePush: ({ attempt }) => {
    f.commit(`docs: concurrent ${attempt}`);
  } }), /main kept changing/);
  assert.equal(f.validations.length, 2);
  assert.equal(f.posts.length, 0);
  assert.equal(git(f.remote, 'tag', '--list', 'v0.2.1'), '');
  assert.equal(git(f.cwd, 'tag', '--list', 'v0.2.1'), '');
});

test('existing conflicting tag is preserved on failure', async t => {
  const f = fixture(t);
  git(f.cwd, 'checkout', '-b', 'other');
  f.write('outside.txt', 'outside');
  git(f.cwd, 'add', 'outside.txt');
  git(f.cwd, 'commit', '-m', 'other branch');
  git(f.cwd, 'tag', 'v0.2.1');
  git(f.cwd, 'push', 'origin', 'refs/tags/v0.2.1');
  git(f.cwd, 'checkout', 'main');
  f.commit('fix: main');
  const existing = git(f.cwd, 'rev-parse', 'v0.2.1');
  await assert.rejects(f.run(), /already exists outside main/);
  assert.equal(git(f.cwd, 'rev-parse', 'v0.2.1'), existing);
});

test('GitHub API mock checks auth, JSON payload, 404, and non-404 errors', async () => {
  const calls = [];
  let status = 404;
  const api = createGitHubApi('owner/repo', 'test-token', async (url, options) => {
    calls.push({ url, options });
    return { status, ok: status < 400, json: async () => ({ id: 123 }) };
  });
  assert.equal(await api('GET', '/releases/tags/v0.2.1'), null);
  status = 201;
  assert.deepEqual(await api('POST', '/releases', { tag_name: 'v0.2.1' }), { id: 123 });
  assert.equal(calls[1].options.headers.Authorization, 'Bearer test-token');
  assert.equal(calls[1].options.body, '{"tag_name":"v0.2.1"}');
  status = 403;
  await assert.rejects(api('GET', '/releases/tags/v0.2.1'), /HTTP 403/);
});
