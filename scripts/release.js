#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const FILES = ['manifest.json', '.claude-plugin/plugin.json', '.claude-plugin/marketplace.json', 'CHANGELOG.md'];
const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
function git(cwd, ...args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}
function compare(a, b) {
  const aa = a.split('.').map(Number), bb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) if (aa[i] !== bb[i]) return aa[i] - bb[i];
  return 0;
}
function bump(version, messages) {
  if (!SEMVER.test(version)) throw new Error(`Invalid version: ${version}`);
  const parts = version.split('.').map(Number);
  const major = messages.some(m => /^[a-zA-Z][\w-]*(?:\([^\r\n)]+\))?!:/.test(m) || /^BREAKING CHANGE:/m.test(m));
  const minor = messages.some(m => /^feat(?:\([^\r\n)]+\))?:/.test(m));
  if (major) return `${parts[0] + 1}.0.0`;
  if (minor) return `${parts[0]}.${parts[1] + 1}.0`;
  return `${parts[0]}.${parts[1]}.${parts[2] + 1}`;
}
function manifests(read) {
  const project = JSON.parse(read(FILES[0]));
  const plugin = JSON.parse(read(FILES[1]));
  const marketplace = JSON.parse(read(FILES[2]));
  const matches = marketplace.plugins.filter(p => p.name === plugin.name);
  if (matches.length !== 1) throw new Error('Expected exactly one matching marketplace plugin');
  if (!SEMVER.test(project.version) || plugin.version !== project.version || matches[0].version !== project.version) {
    throw new Error('Manifest versions must match and use stable semver');
  }
  return { project, plugin, marketplace, entry: matches[0], version: project.version };
}
function changelog(text, version, date, commits, repository) {
  const marker = /^## \[Unreleased\][^\n]*\n/m.exec(text);
  if (!marker) throw new Error('CHANGELOG.md must contain an Unreleased heading');
  const start = marker.index + marker[0].length;
  const next = /^## /m.exec(text.slice(start));
  const end = next ? start + next.index : text.length;
  const entries = text.slice(start, end).trim();
  const bullets = commits.map(c => `- ${c.message.split('\n')[0].replace(/[\r]/g, '')} ([${c.sha.slice(0, 7)}](https://github.com/${repository}/commit/${c.sha}))`).join('\n');
  const body = [entries, `### Commits\n\n${bullets}`].filter(Boolean).join('\n\n');
  return { body, text: `${text.slice(0, start)}\n## [${version}] - ${date}\n\n${body}\n\n${text.slice(end)}` };
}
function releaseBody(text, version) {
  const lines = text.split('\n');
  const start = lines.findIndex(l => l.startsWith(`## [${version}]`));
  if (start < 0) throw new Error(`Missing changelog section for ${version}`);
  let end = lines.findIndex((l, i) => i > start && l.startsWith('## '));
  if (end < 0) end = lines.length;
  return lines.slice(start + 1, end).join('\n').trim();
}

function createGitHubApi(repository, token, fetchImpl = fetch) {
  return async (method, endpoint, body) => {
    const response = await fetchImpl(`https://api.github.com/repos/${repository}${endpoint}`, {
      method,
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(30000),
    });
    if (method === 'GET' && response.status === 404) return null;
    if (!response.ok) throw new Error(`GitHub ${method} ${endpoint}: HTTP ${response.status}`);
    return response.json();
  };
}
async function publish(api, tag, sha, body) {
  const existing = await api('GET', `/releases/tags/${encodeURIComponent(tag)}`);
  if (existing && !existing.draft) return;
  const payload = { tag_name: tag, target_commitish: sha, name: tag, body, draft: false, prerelease: false };
  if (existing) await api('PATCH', `/releases/${existing.id}`, payload);
  else await api('POST', '/releases', payload);
}

// All edits and validation run in a disposable worktree, leaving the caller's
// checkout (including pre-existing local work) untouched. Atomic push prevents
// a tag from escaping when a concurrent main update rejects the branch push.
async function runRelease({ cwd = process.cwd(), repository = process.env.GITHUB_REPOSITORY,
  token = process.env.GITHUB_TOKEN, api, validate, beforePush = async () => {}, maxAttempts = 5,
  date = new Date().toISOString().slice(0, 10), log = console.log } = {}) {
  if (!/^[\w.-]+\/[\w.-]+$/.test(repository || '')) throw new Error('GITHUB_REPOSITORY must be owner/repo');
  if (!api && !token) throw new Error('GITHUB_TOKEN is required');
  api ||= createGitHubApi(repository, token);
  validate ||= dir => {
    execFileSync('node', ['--test', 'scripts/test-release.js'], { cwd: dir, stdio: 'inherit' });
    execFileSync('bash', ['scripts/validate-skills.sh'], { cwd: dir, stdio: 'inherit' });
  };
  const fetchMain = () => git(cwd, 'fetch', 'origin', '+refs/heads/main:refs/remotes/origin/main', '--tags');
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    fetchMain();
    const source = git(cwd, 'rev-parse', 'refs/remotes/origin/main');
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'kr-release-'));
    const dir = path.join(temp, 'worktree');
    let localTag;
    let createdTag = false;
    let pushed = false;
    try {
      git(cwd, 'worktree', 'add', '--detach', dir, source);
      const read = file => fs.readFileSync(path.join(dir, file), 'utf8');
      const state = manifests(read);
      const tags = git(dir, 'tag', '--merged', source).split('\n')
        .filter(t => t.startsWith('v') && SEMVER.test(t.slice(1)))
        .sort((a, b) => compare(b.slice(1), a.slice(1)));
      const previous = tags[0];
      const hashes = git(dir, 'rev-list', '--reverse', previous ? `${previous}..${source}` : source).split('\n').filter(Boolean);
      const commits = hashes.map(sha => ({ sha, message: git(dir, 'show', '-s', '--format=%B', sha) }));
      let body;
      if (commits.length) {
        const base = previous && compare(previous.slice(1), state.version) > 0 ? previous.slice(1) : state.version;
        const version = bump(base, commits.map(c => c.message));
        localTag = `v${version}`;
        if (git(dir, 'tag', '--list', localTag)) throw new Error(`Tag already exists outside main: ${localTag}`);
        state.project.version = state.plugin.version = state.entry.version = version;
        [state.project, state.plugin, state.marketplace].forEach((value, i) => {
          fs.writeFileSync(path.join(dir, FILES[i]), `${JSON.stringify(value, null, 2)}\n`);
        });
        const change = changelog(read('CHANGELOG.md'), version, date, commits, repository);
        body = change.body;
        fs.writeFileSync(path.join(dir, 'CHANGELOG.md'), change.text);
      }
      await validate(dir);
      // Repair only tags made by this automation; legacy tags stay untouched.
      // Read the tagged tree, so a newer main cannot alter the old release body.
      for (const tag of tags) {
        const message = git(dir, 'show', '-s', '--format=%B', `${tag}^{commit}`);
        if (!/^Release-Source: [a-f0-9]{40}$/m.test(message) || !message.startsWith(`chore(release): ${tag}\n`)) continue;
        const tagged = manifests(file => git(dir, 'show', `${tag}:${file}`));
        if (tagged.version !== tag.slice(1)) throw new Error(`Tag and manifests disagree: ${tag}`);
        await publish(api, tag, git(dir, 'rev-parse', `${tag}^{commit}`), releaseBody(git(dir, 'show', `${tag}:CHANGELOG.md`), tag.slice(1)));
      }
      if (!commits.length) {
        log('No unreleased commits.');
        return { released: false };
      }
      git(dir, 'add', '--', ...FILES);
      const staged = git(dir, 'diff', '--cached', '--name-only').split('\n');
      if (staged.some(file => !FILES.includes(file))) throw new Error('Unexpected staged release file');
      git(dir, '-c', 'user.name=github-actions[bot]', '-c', 'user.email=41898282+github-actions[bot]@users.noreply.github.com',
        'commit', '-m', `chore(release): ${localTag}\n\nRelease-Source: ${source}`);
      git(dir, 'tag', localTag);
      createdTag = true;
      await beforePush({ dir, source, tag: localTag, attempt });
      fetchMain();
      if (git(cwd, 'rev-parse', 'refs/remotes/origin/main') !== source) {
        log('main changed; recalculating and validating latest main.');
        continue;
      }
      try {
        git(dir, 'push', '--atomic', 'origin', 'HEAD:refs/heads/main', `refs/tags/${localTag}`);
        pushed = true;
      } catch (error) {
        // A lost connection may still have committed the atomic push.
        fetchMain();
        const head = git(dir, 'rev-parse', 'HEAD');
        const remoteTag = git(dir, 'ls-remote', 'origin', `refs/tags/${localTag}`).split(/\s/)[0];
        if (remoteTag === head) pushed = true;
        else if (git(cwd, 'rev-parse', 'refs/remotes/origin/main') !== source) continue;
        else throw error;
      }
      await publish(api, localTag, git(dir, 'rev-parse', 'HEAD'), body);
      log(`Published ${localTag}`);
      return { released: true, tag: localTag };
    } finally {
      // Never remove a remotely published tag, including on API failure.
      if (createdTag && !pushed) git(cwd, 'tag', '-d', localTag);
      if (fs.existsSync(dir)) git(cwd, 'worktree', 'remove', '--force', dir);
      fs.rmSync(temp, { recursive: true, force: true });
    }
  }
  throw new Error('main kept changing; rerun Release to retry');
}

module.exports = { bump, changelog, releaseBody, createGitHubApi, runRelease };
if (require.main === module) runRelease().catch(error => { console.error(error.message); process.exitCode = 1; });
