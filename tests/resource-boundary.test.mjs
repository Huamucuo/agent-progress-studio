import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { syncBuiltinESMExports } from 'node:module';
import { execFileSync } from 'node:child_process';
import { SessionAccess, sessionRef } from '../src/core/session-access.mjs';
import { ResourceRegistry, canonicalPath } from '../src/core/resource-registry.mjs';
import { DataGateway } from '../src/collectors/data-gateway.mjs';
import { LogSource } from '../src/adapters/codex-log.mjs';
import { createApplication } from '../src/server.mjs';
import { collectEvidence, sourceFingerprint, readEvidence } from '../src/collectors/evidence.mjs';
import { evidenceOptions, logOptions, scope } from './access-fixture.mjs';
const A = 'abcdef12-abcd-4abc-8abc-abcdef123456', B = 'feedbeef-abcd-4abc-8abc-abcdef123456';
const row = (type, payload) => JSON.stringify({ type, payload, timestamp: new Date().toISOString() }) + '\n';
const audits = []; after(async () => { if (process.env.APS_RC4_TRACE) await fs.writeFile(process.env.APS_RC4_TRACE, JSON.stringify(audits, null, 2)); });
async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'aps-boundary-'));
  const home = path.join(root, 'codex'), project = path.join(root, 'project'), data = path.join(root, 'data');
  for (const p of [home + '/sessions', home + '/archived_sessions', project + '/.agent-progress']) await fs.mkdir(p, { recursive: true });
  const a = path.join(home, 'sessions', A + '.jsonl'), b = path.join(home, 'archived_sessions', B.toUpperCase() + '.jsonl');
  await fs.writeFile(a, row('session_meta', { id: A, cwd: project }) + row('event_msg', { type: 'user_message', message: 'AUTHORIZED_A' }));
  await fs.writeFile(b, row('session_meta', { id: B, cwd: project }) + row('event_msg', { type: 'user_message', message: 'PRIVATE_ARCHIVE_B' }));
  await fs.writeFile(project + '/app.txt', 'VISIBLE_PROJECT');
  await fs.writeFile(project + '/.agent-progress/acceptance.json', JSON.stringify({ version: 1, taskId: 'fixture', criteria: [{ id: 'c', title: 'Fixture', files: ['app.txt'], requiresHuman: true }] }));
  t.after(() => fs.rm(root, { recursive: true, force: true })); return { root, home, project, data, a, b };
}
function auditIO(t, root) {
  const calls = [], descriptors = new Map(), original = { open: fs.open, readFile: fs.readFile, readSync: fsSync.readSync, createReadStream: fsSync.createReadStream }; let phase = 'before';
  const key = input => { try { const file = path.resolve(String(input)); return file.toLowerCase().startsWith(root.toLowerCase() + path.sep) ? path.relative(root, file).toLowerCase() : null; } catch { return null; } };
  const record = (file, method, extra = {}) => { if (file) calls.push({ file, method, phase, ...extra }); };
  t.mock.method(fs, 'open', async (...args) => {
    const file = key(args[0]); record(file, 'open', { flags: args[1] }); const h = await original.open(...args);
    if (file) {
      descriptors.set(h.fd, file); const close = h.close.bind(h); t.mock.method(h, 'close', async () => { descriptors.delete(h.fd); return close(); });
      const read = h.read.bind(h), readFile = h.readFile.bind(h);
      t.mock.method(h, 'read', (...params) => { record(file, 'handle.read', { start: params[3], length: params[2] }); return read(...params); });
      t.mock.method(h, 'readFile', (...params) => { record(file, 'handle.readFile'); return readFile(...params); });
    }
    return h;
  });
  t.mock.method(fs, 'readFile', (...args) => { record(key(args[0]), 'readFile'); return original.readFile(...args); });
  t.mock.method(fsSync, 'readSync', (...args) => { record(descriptors.get(args[0]), 'readSync', { start: args[4], length: args[3] }); return original.readSync(...args); });
  t.mock.method(fsSync, 'createReadStream', (...args) => { record(key(args[0]), 'stream'); return original.createReadStream(...args); });
  syncBuiltinESMExports(); t.after(() => { t.mock.restoreAll(); syncBuiltinESMExports(); });
  audits.push({ case: t.name, calls }); return { calls, phase: value => { phase = value; }, forFile: file => calls.filter(c => c.file === path.relative(root, file).toLowerCase()) };
}
test('A02 all service/API/evidence entrances: authorized A never grants archived B; explicit ordinary project remains usable', async t => {
  const f = await fixture(t), audit = auditIO(t, f.root), app = await createApplication({ port: 0, dataDir: f.data, codexHome: f.home, interval: 0 }); t.after(() => app.close());
  await app.service.select({ mode: 'local', id: A }); await app.service.sessionAccess({ sessionId: A, decision: 'allow-codex' });
  assert.equal(app.service.snapshot.task.title, 'AUTHORIZED_A'); assert.equal(app.service.snapshot.evidence.manifest, null);
  for (const root of [f.home, path.dirname(f.b), f.root]) await assert.rejects(app.service.sessionAccess({ sessionId: A, decision: 'allow-evidence', root }));
  await app.service.sessionAccess({ sessionId: A, decision: 'allow-evidence', root: f.project });
  assert.equal(app.service.snapshot.evidence.files.includes('app.txt'), true);
  assert.match((await app.service.detail('file', 'app.txt')).text, /VISIBLE_PROJECT/);
  for (const route of ['/api/snapshot', '/api/export', '/api/evidence?kind=report', '/api/evidence?kind=diff', '/api/evidence?kind=file&id=..%2Fcodex%2Farchived_sessions%2F' + path.basename(f.b)]) {
    const response = await fetch(app.url + route); assert.doesNotMatch(await response.text(), /PRIVATE_ARCHIVE_B/);
  }
  const control = new AbortController(), res = await fetch(app.url + '/api/stream', { headers: { 'Last-Event-ID': 'old-grant' }, signal: control.signal });
  assert.doesNotMatch(new TextDecoder().decode((await res.body.getReader().read()).value), /PRIVATE_ARCHIVE_B/); control.abort();
  assert.equal(audit.forFile(f.b).length, 0, 'B has zero open/read/readFile/stream calls');
  assert.ok(audit.forFile(f.a).some(c => c.method === 'handle.read'), 'A positive control actually reads body');
});
test('A03 default, environment and custom roots reserve active/archive paths, aliases and missing roots; ordinary worktree allowed', async t => {
  const f = await fixture(t), syntheticHome = path.join(f.root, 'user'); await fs.mkdir(syntheticHome);
  t.mock.method(os, 'homedir', () => syntheticHome); syncBuiltinESMExports(); t.after(() => { t.mock.restoreAll(); syncBuiltinESMExports(); });
  const old = process.env.CODEX_HOME; process.env.CODEX_HOME = path.join(f.root, 'environment');
  t.after(() => { if (old === undefined) delete process.env.CODEX_HOME; else process.env.CODEX_HOME = old; });
  const registry = new ResourceRegistry({ codexHomes: [f.home] });
  await assert.rejects(registry.workspace(f.root));
  for (const home of [path.join(syntheticHome, '.codex'), process.env.CODEX_HOME, f.home]) for (const store of ['sessions', 'archived_sessions']) {
    const dir = path.join(home, store); await fs.mkdir(dir, { recursive: true }); await assert.rejects(registry.workspace(dir));
    await fs.mkdir(path.join(dir, 'child')); await assert.rejects(registry.workspace(path.join(dir, 'child')));
  }
  const alias = path.join(f.root, 'alias'); await fs.symlink(f.home, alias, 'junction'); await assert.rejects(registry.workspace(alias + '/archived_sessions'));
  const worktree = path.join(syntheticHome, '.codex/worktrees/normal'); await fs.mkdir(worktree, { recursive: true }); assert.equal(await registry.workspace(worktree), await canonicalPath(worktree));
});
test('A04 forced manifest, unknown log filenames, links and hardlinks cannot turn workspace permission into session reads', async t => {
  const f = await fixture(t); await fs.symlink(path.dirname(f.b), f.project + '/linked', 'junction'); await fs.link(f.b, f.project + '/hardlink.txt');
  const linked = 'linked/' + path.basename(f.b);
  const copied = f.project + '/' + path.basename(f.b); await fs.copyFile(f.b, copied);
  await fs.writeFile(f.project + '/.agent-progress/acceptance.json', JSON.stringify({ version: 1, taskId: 'b', criteria: [{ id: 'b', title: 'B', files: [linked, 'hardlink.txt', path.basename(f.b)] }] }));
  const audit = auditIO(t, f.root), options = await evidenceOptions(f.project, { codexHomes: [f.home] });
  const evidence = await collectEvidence(f.project, options); assert.equal(evidence.fingerprint, null); assert.deepEqual(evidence.files, []);
  for (const file of [linked, 'hardlink.txt', path.basename(f.b)]) await assert.rejects(readEvidence(f.project, 'file', file, { files: [file], git: { files: [] } }, options));
  for (const file of [f.b, copied, f.project + '/' + linked, f.project + '/hardlink.txt']) assert.equal(audit.forFile(file).length, 0);
});
test('A05 revoke during open validation prevents body; revoke while body is in flight prevents parse/cache', async t => {
  const f = await fixture(t), options = await logOptions(f.a, A), gateway = options.gateway;
  const source = new LogSource(f.a, A, undefined, options), originalOpen = gateway.openLog.bind(gateway);
  gateway.openLog = async (...args) => { const lease = await originalOpen(...args); await options.access.change(options.ref, { content: false }, options.access.revision); return lease; };
  const audit = auditIO(t, f.root); await source.poll(); assert.equal(audit.forFile(f.a).filter(c => c.method === 'handle.read').length, 0);
  await options.access.change(options.ref, { content: true }, options.access.revision); gateway.openLog = originalOpen;
  const open = fs.open; t.mock.method(fs, 'open', async (...args) => {
    const handle = await open(...args); if (String(args[0]).toLowerCase() === f.a.toLowerCase()) {
      const read = handle.read.bind(handle); handle.read = async (...p) => { const result = await read(...p); await options.access.change(options.ref, { content: false }, options.access.revision); return result; };
    } return handle;
  }); syncBuiltinESMExports();
  let parses = 0; const parse = JSON.parse; t.mock.method(JSON, 'parse', raw => { if (raw.includes('AUTHORIZED_A')) parses++; return parse(raw); });
  await source.poll(); assert.equal(parses, 0); assert.equal(source.state.title, ''); assert.equal(source.state.events.length, 0);
});
test('T-05 content/evidence revocations invalidate composites and reviews without disabling independent Hook metadata', async t => {
  const f = await fixture(t), app = await createApplication({ port: 0, dataDir: f.data, codexHome: f.home, interval: 0 }); t.after(() => app.close());
  await app.service.select({ mode: 'local', id: A }); await app.service.sessionAccess({ sessionId: A, decision: 'allow-codex' }); await app.service.sessionAccess({ sessionId: A, decision: 'allow-evidence', root: f.project });
  let old = app.service.snapshot; await app.service.review({ criterionId: 'c', decision: 'accept', note: 'OLD_PRIVATE_NOTE', fingerprint: old.evidence.fingerprint, manifestHash: old.evidence.manifestHash }); old = app.service.snapshot;
  assert.match(JSON.stringify(old), /OLD_PRIVATE_NOTE/);
  await app.service.sessionAccess({ sessionId: A, decision: 'revoke-evidence' }); assert.equal(app.service.snapshot.task.title, 'AUTHORIZED_A'); assert.equal(app.service.snapshot.evidence.manifest, null); assert.equal(app.service.publication.valid(old), false);
  await app.service.sessionAccess({ sessionId: A, decision: 'allow-evidence', root: f.project }); assert.doesNotMatch(JSON.stringify(app.service.snapshot), /OLD_PRIVATE_NOTE/);
  await app.service.sessionAccess({ sessionId: A, decision: 'revoke' }); assert.equal(app.service.snapshot.task.title, ''); assert.equal(app.service.snapshot.evidence.manifest, null);
  const events = app.service.workHooksDir; await fs.mkdir(events, { recursive: true });
  await fs.writeFile(path.join(events, '1791494400000-00000000-0000-4000-8000-000000000001.json'), JSON.stringify({ event_type: 'Stop', session_id: B, turn_id: 'turn', timestamp: '2026-10-09T00:00:00.000Z' }));
  await app.service.select({ mode: 'work-hooks' }); assert.equal(app.service.snapshot.task.events.length, 1);
  await app.service.sessionAccess({ decision: 'revoke-observation' }); assert.equal(app.service.snapshot.task.events.length, 0);
});
test('A08 legacy mixed review body is not read at startup and cannot appear in export', async t => {
  const f = await fixture(t); await fs.mkdir(f.data); const old = f.data + '/reviews.json'; await fs.writeFile(old, '{"unknown":{"note":"PRIVATE_OLD_REVIEW"}}');
  const audit = auditIO(t, f.root), app = await createApplication({ port: 0, dataDir: f.data, codexHome: f.home, interval: 0 }); t.after(() => app.close());
  assert.equal(audit.forFile(old).length, 0); assert.doesNotMatch(await (await fetch(app.url + '/api/export')).text(), /PRIVATE_OLD_REVIEW/);
});

test('A04 explicit verification context cannot force-hash private APS data through a manifest', async t => {
  const f = await fixture(t); await fs.mkdir(f.project + '/.aps-data'); const file = f.project + '/.aps-data/private.json'; await fs.writeFile(file, 'PRIVATE_APS_BODY');
  await fs.writeFile(f.project + '/.agent-progress/acceptance.json', JSON.stringify({ version: 1, taskId: 'a', criteria: [{ id: 'x', title: 'x', files: ['.aps-data/private.json'] }] }));
  const audit = auditIO(t, f.root), options = await evidenceOptions(f.project);
  assert.equal((await sourceFingerprint(f.project, options)).complete, false); assert.equal(audit.forFile(file).length, 0);
});
test('T-06 Git cannot execute extdiff/textconv/fsmonitor or inherited command config; normal diff and worktree remain available', async t => {
  const f = await fixture(t), git = (...args) => execFileSync('git', ['-c', 'core.fsmonitor=false', '-C', f.project, ...args], { windowsHide: true, env: Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('GIT_'))) });
  git('init', '-q'); git('add', '.'); git('-c', 'user.name=APS Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-qm', 'fixture');
  const marker = f.project + '/UNEXPECTED_EXECUTION', command = `echo BAD > "${marker.replaceAll('\\', '/')}"`;
  for (const setting of ['core.fsmonitor', 'diff.external', 'diff.bad.textconv']) git('config', setting, command);
  await fs.writeFile(f.project + '/.gitattributes', '*.txt diff=bad\n'); await fs.writeFile(f.project + '/app.txt', 'changed');
  const before = process.env.GIT_CONFIG_COUNT, key = process.env.GIT_CONFIG_KEY_0, value = process.env.GIT_CONFIG_VALUE_0;
  process.env.GIT_CONFIG_COUNT = '1'; process.env.GIT_CONFIG_KEY_0 = 'core.fsmonitor'; process.env.GIT_CONFIG_VALUE_0 = command;
  t.after(() => { for (const [name, v] of [['GIT_CONFIG_COUNT', before], ['GIT_CONFIG_KEY_0', key], ['GIT_CONFIG_VALUE_0', value]]) { if (v === undefined) delete process.env[name]; else process.env[name] = v; } });
  const result = await collectEvidence(f.project, await evidenceOptions(f.project, { codexHomes: [f.home] }));
  assert.equal(result.git.available, true); assert.match(result.git.diff, /changed/); await assert.rejects(fs.stat(marker), { code: 'ENOENT' });
  const worktree = f.root + '/worktree'; git('worktree', 'add', '--detach', worktree, 'HEAD');
  const allowed = await collectEvidence(worktree, await evidenceOptions(worktree)); assert.equal(allowed.git.available, true);
  git('config', 'include.path', f.b); const audit = auditIO(t, f.root);
  assert.equal((await collectEvidence(f.project, await evidenceOptions(f.project))).git.available, false); assert.equal(audit.forFile(f.b).length, 0);
});
