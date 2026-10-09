import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir, mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { VERSION } from '../src/version.mjs';
import { createApplication } from '../src/server.mjs';
import { fakeRpc } from './rpc-fixture.mjs';
import { AppServerSource } from '../src/adapters/app-server.mjs';
test('M-01 package, lockfile, README, bootstrap, snapshot and RPC initialize agree on one product version', async t => {
  const pkg = JSON.parse(await readFile('package.json')), lock = JSON.parse(await readFile('package-lock.json'));
  assert.equal(VERSION, pkg.version); assert.equal(lock.version, VERSION); assert.equal(lock.packages[''].version, VERSION);
  execFileSync(process.execPath, ['scripts/version.mjs']);
  const dir = await mkdtemp(path.join(tmpdir(), 'aps-version-')), app = await createApplication({ port: 0, mode: 'demo', interval: 0, dataDir: dir });
  t.after(async () => { await app.close(); await rm(dir, { recursive: true, force: true }); });
  assert.equal((await (await fetch(app.url + '/api/bootstrap')).json()).version, VERSION); assert.equal(app.service.snapshot.version, VERSION);
  const f = fakeRpc(t), source = new AppServerSource('ws://127.0.0.1:4500/'); t.after(() => source.close()); await source.connect();
  assert.equal(f.sent.find(x => x.method === 'initialize').params.clientInfo.version, VERSION);
  for (const file of ['scripts/launch.mjs', 'src/server.mjs', 'public/app.mjs']) assert.doesNotMatch(await readFile(file, 'utf8'), /(?:Studio |'|\")0\.1(?:\.1-rc\.\d)?(?:\\n|'|\")/);
});
test('architectural import guard: business readers and process/network edges remain in registered modules', async () => {
  const allowed = new Map([
    ['src/core/access-store.mjs', ['node:fs/promises']], ['src/core/version.mjs', []], ['src/version.mjs', ['node:fs']],
    ['src/core/resource-registry.mjs', ['node:fs/promises']], ['src/collectors/data-gateway.mjs', ['node:fs', 'node:fs/promises', 'node:child_process']],
    ['src/adapters/codex-log.mjs', ['node:fs/promises']], ['src/adapters/work-hooks.mjs', ['node:fs/promises']],
    ['src/service.mjs', ['node:fs/promises']], ['src/server.mjs', ['node:fs/promises', 'node:http']]
  ]);
  async function walk(dir) {
    for (const file of await readdir(dir, { withFileTypes: true })) {
      const name = dir + '/' + file.name; if (file.isDirectory()) await walk(name);
      else if (name.endsWith('.mjs')) {
        const source = await readFile(name, 'utf8');
        for (const match of source.matchAll(/['"](node:(?:fs(?:\/promises)?|child_process|https?|net|tls|dgram))['"]/g)) assert.ok(allowed.get(name)?.includes(match[1]), `${name}: new I/O boundary requires review`);
        if (name !== 'src/adapters/app-server.mjs') assert.doesNotMatch(source, /new WebSocket\(|\bfetch\(/);
      }
    }
  }
  await walk('src');
  assert.match(await readFile('src/adapters/codex-log.mjs', 'utf8'), /import \{ readdir, lstat \} from 'node:fs\/promises'/);
});

test('M-01 fixed-tree ZIP hashes describe exported bytes and ignore user autocrlf settings', async t => {
  const root = await mkdtemp(path.join(tmpdir(), 'aps-package-')), source = root + '/source';
  t.after(() => rm(root, { recursive: true, force: true })); await mkdir(source + '/scripts', { recursive: true });
  const git = (...args) => execFileSync('git', ['-C', source, ...args], { windowsHide: true });
  await writeFile(source + '/scripts/release.mjs', await readFile('scripts/release.mjs'));
  await writeFile(source + '/.gitattributes', '* text=auto\n*.cmd text eol=crlf\n');
  await writeFile(source + '/package.json', JSON.stringify({ version: '0.1.1-rc.4' }) + '\n');
  await writeFile(source + '/start.cmd', '@echo off\necho synthetic\n');
  git('init', '-q'); git('add', '.'); git('-c', 'user.name=APS Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-qm', 'fixture');
  let previous;
  for (const value of ['true', 'false']) {
    git('config', 'core.autocrlf', value);
    const release = JSON.parse(execFileSync(process.execPath, [source + '/scripts/release.mjs', '--out-dir', root + '/out-' + value], { encoding: 'utf8', windowsHide: true }));
    const manifest = JSON.parse(await readFile(release.zip.replace(/\.zip$/, '.files.json'))), row = manifest.files.find(x => x.path === 'start.cmd');
    assert.equal(row.sha256, createHash('sha256').update('@echo off\r\necho synthetic\r\n').digest('hex'));
    if (previous) assert.equal(release.sha256, previous, 'Identical committed tree produces identical archive bytes'); previous = release.sha256;
  }
});
