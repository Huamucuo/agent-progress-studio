import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { deflateSync } from 'node:zlib';
import { syncBuiltinESMExports } from 'node:module';

const states = ['idle', 'working', 'waiting', 'happy', 'failed', 'sleeping'];
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
function crc(bytes) { let c = 0xffffffff; for (const byte of bytes) { c ^= byte; for (let n = 0; n < 8; n++) c = (c >>> 1) ^ ((c & 1) ? 0xedb88320 : 0); } return (c ^ 0xffffffff) >>> 0; }
function chunk(type, data) { const name = Buffer.from(type), length = Buffer.alloc(4), check = Buffer.alloc(4); length.writeUInt32BE(data.length); check.writeUInt32BE(crc(Buffer.concat([name, data]))); return Buffer.concat([length, name, data, check]); }
function png({ width = 1, height = 1, raw = Buffer.from([0, 220, 150, 80, 255]), extra = null } = {}) { const header = Buffer.alloc(13); header.writeUInt32BE(width); header.writeUInt32BE(height, 4); header[8] = 8; header[9] = 6; return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]), chunk('IHDR', header), ...(extra ? [extra] : []), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]); }
async function fixture(t, options = {}) {
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'aps-pet-pack-')));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const source = path.join(root, 'source'), store = path.join(root, 'owned'); await fs.mkdir(source);
  const bytes = options.bytes ?? png();
  const manifest = { schema: 1, id: 'user-test-pet', name: 'Synthetic test only', version: '1.0.0', author: 'Automated fixture', source: 'Locally generated pixels, no pet artwork', license: 'CC0 synthetic test fixture', canvas: { width: 1, height: 1, anchor: { x: 0, y: 0 }, slots: {} }, files: [{ file: 'frame.png', sha256: sha(bytes) }], states: Object.fromEntries(states.map(state => [state, [{ file: 'frame.png', duration: 250 }]])) };
  options.modify?.(manifest);
  await fs.writeFile(path.join(source, 'frame.png'), bytes); await fs.writeFile(path.join(source, 'manifest.json'), JSON.stringify(manifest));
  const { PetPackManager } = await import('../src/pet/pack.mjs').catch(() => ({})); assert.ok(PetPackManager, 'resource pack implementation is missing');
  const manager = new PetPackManager(store); await manager.init();
  return { root, source, store, bytes, manifest, manager };
}

test('validated import installs atomically, survives restart and returns bytes through registered ids', async t => {
  const f = await fixture(t); const result = await f.manager.importDirectory(f.source);
  assert.equal(result.id, 'user-test-pet'); assert.equal(f.manager.list().length, 1);
  const asset = await f.manager.asset(result.id, 'frame.png'); assert.deepEqual(asset.bytes, f.bytes); assert.equal(asset.mimeType, 'image/png'); assert.equal(asset.sha256, sha(f.bytes));
  const list = f.manager.list(); list[0].name = 'changed'; assert.equal(f.manager.list()[0].name, 'Synthetic test only');
  const next = new f.manager.constructor(f.store); await next.init(); assert.equal(next.list().length, 1);
  await assert.rejects(next.asset(result.id, '../source/frame.png')); await assert.rejects(next.asset('aps-dog', 'frame.png'));
  await assert.rejects(next.importDirectory(f.source), /exist|conflict/i);
  await next.remove(result.id); assert.equal(next.list().length, 0); await assert.rejects(next.asset(result.id, 'frame.png'));
  assert.deepEqual(await fs.readFile(path.join(f.source, 'frame.png')), f.bytes);
  await assert.rejects(next.remove('aps-dog'));
});

test('inspection previews validated license without installing and import revalidates changed source', async t => {
  const f = await fixture(t);
  assert.equal(typeof f.manager.inspectDirectory, 'function', 'safe pre-confirmation inspection is missing');
  const info = await f.manager.inspectDirectory(f.source);
  assert.equal(info.author, 'Automated fixture'); assert.equal(info.license, 'CC0 synthetic test fixture');
  assert.equal(f.manager.list().length, 0); assert.deepEqual(await fs.readdir(f.store), []);
  info.license = 'changed'; assert.equal((await f.manager.inspectDirectory(f.source)).license, 'CC0 synthetic test fixture');
  await fs.writeFile(path.join(f.source, 'frame.png'), Buffer.from('changed after preview'));
  await assert.rejects(f.manager.importDirectory(f.source)); assert.equal(f.manager.list().length, 0);
});

for (const [label, add] of [
  ['rollout JSONL', f => fs.writeFile(path.join(f.source, '019cf030-1234-7123-8123-123456789abc.jsonl'), 'SYNTHETIC_PRIVATE_LOG')],
  ['log', f => fs.writeFile(path.join(f.source, 'events.log'), 'SYNTHETIC_PRIVATE_LOG')],
  ['unknown extension', f => fs.writeFile(path.join(f.source, 'notes.txt'), 'SYNTHETIC_PRIVATE_NOTE')],
  ['uppercase PNG', f => fs.writeFile(path.join(f.source, 'other.PNG'), f.bytes)],
  ['nested directory', f => fs.mkdir(path.join(f.source, 'nested'))],
  ['linked directory', f => fs.symlink(f.root, path.join(f.source, 'linked.png'), process.platform === 'win32' ? 'junction' : 'dir')],
  ['hard-linked frame', f => fs.link(path.join(f.source, 'frame.png'), path.join(f.root, 'hardlink.png'))],
]) test(`metadata preflight denies ${label} before any manifest or PNG body open`, async t => {
  const f = await fixture(t); await fs.writeFile(path.join(f.source, 'manifest.json'), JSON.stringify({ ...f.manifest, source: 'SYNTHETIC_PRIVATE_MANIFEST' })); await add(f);
  const originalOpen = fs.open; let bodyOpens = 0;
  fs.open = async (file, ...args) => { if (path.resolve(file).startsWith(f.source+path.sep)) bodyOpens++; return originalOpen(file, ...args); }; syncBuiltinESMExports();
  try {
    await assert.rejects(f.manager.inspectDirectory(f.source)); assert.equal(bodyOpens, 0, 'inspection must reject directory names/types before reading its manifest');
    await assert.rejects(f.manager.importDirectory(f.source)); assert.equal(bodyOpens, 0, 'import must repeat metadata preflight before reading any selected-directory body');
  } finally { fs.open = originalOpen; syncBuiltinESMExports(); }
  assert.equal(f.manager.list().length, 0);
});

test('32 active packs plus disabled uninstall residue do not exceed active quota at restart', async t => {
  const f = await fixture(t);
  for (let n = 0; n < 32; n++) {
    const target = path.join(f.store, `user-pack-${n}`); await fs.mkdir(target);
    await fs.writeFile(path.join(target, 'frame.png'), f.bytes);
    await fs.writeFile(path.join(target, 'manifest.json'), JSON.stringify({ ...f.manifest, id: `user-pack-${n}` }));
  }
  const tombstone = path.join(f.store, '.remove-'+randomUUID()); await fs.mkdir(tombstone); await fs.writeFile(path.join(tombstone, 'manifest.json'), 'disabled interrupted cleanup');
  const next = new f.manager.constructor(f.store); await next.init(); assert.equal(next.list().length, 32);
  await assert.rejects(next.importDirectory(f.source), /pack count limit/);
});

test('disabled residue quota pauses new imports while existing validated pets remain usable', async t => {
  const f = await fixture(t); await f.manager.importDirectory(f.source);
  for (let n = 0; n < 64; n++) await fs.mkdir(path.join(f.store, '.remove-'+randomUUID()));
  const next = new f.manager.constructor(f.store); await next.init(); assert.equal(next.list().length, 1);
  await assert.rejects(next.importDirectory(f.source), /residue quota/);
  assert.deepEqual((await next.asset(f.manifest.id, 'frame.png')).bytes, f.bytes);
});

for (const field of ['license', 'id', 'framehash', 'identity']) test(`confirmed inspection is bound to unchanged ${field}`, async t => {
  const f = await fixture(t); const expectedManifest = await f.manager.inspectDirectory(f.source);
  if (field === 'license') f.manifest.license = 'Different terms after confirmation';
  if (field === 'id') f.manifest.id = 'user-different-pet';
  if (field === 'framehash') { const bytes = png({ raw: Buffer.from([0, 3, 4, 5, 6]) }); await fs.writeFile(path.join(f.source, 'frame.png'), bytes); f.manifest.files[0].sha256 = sha(bytes); }
  if (field === 'identity') { await fs.rename(path.join(f.source, 'frame.png'), path.join(f.root, 'old-frame.png')); await fs.writeFile(path.join(f.source, 'frame.png'), f.bytes); }
  else await fs.writeFile(path.join(f.source, 'manifest.json'), JSON.stringify(f.manifest));
  await assert.rejects(f.manager.importDirectory(f.source, { expectedManifest }), /preview|inspect|confirm|changed/i);
  assert.equal(f.manager.list().length, 0);
});
test('confirmed unchanged preview installs and forged confirmation without inspection is refused', async t => {
  const f = await fixture(t); await assert.rejects(f.manager.importDirectory(f.source, { expectedManifest: f.manifest }));
  const expectedManifest = await f.manager.inspectDirectory(f.source); const installed = await f.manager.importDirectory(f.source, { expectedManifest }); assert.equal(installed.id, f.manifest.id);
});

test('twenty MiB aggregate quota refuses independently valid PNG frames', async t => {
  const bytes = png({ width: 512, height: 512, raw: (() => { const b = randomBytes((512*4+1)*512); for (let y = 0; y < 512; y++) b[y*(512*4+1)] = 0; return b; })() });
  const f = await fixture(t, { bytes, modify(m) { m.canvas.width = 512; m.canvas.height = 512; m.files = Array.from({ length: 21 }, (_, n) => ({ file: `frame-${n}.png`, sha256: sha(bytes) })); m.states.idle = m.files.map(item => ({ file: item.file, duration: 250 })); for (const state of states.slice(1)) m.states[state] = [{ file: 'frame-0.png', duration: 250 }]; } });
  await fs.unlink(path.join(f.source, 'frame.png'));
  for (const file of f.manifest.files) await fs.writeFile(path.join(f.source, file.file), bytes);
  await assert.rejects(f.manager.importDirectory(f.source), /total size/i); assert.equal(f.manager.list().length, 0);
});

test('per-file size and manifest limits reject bounded reads before decoding', async t => {
  const f = await fixture(t);
  await fs.writeFile(path.join(f.source, 'frame.png'), Buffer.alloc(2 * 1024 * 1024 + 1));
  await assert.rejects(f.manager.importDirectory(f.source), /size/i);
  await fs.writeFile(path.join(f.source, 'manifest.json'), Buffer.alloc(64 * 1024 + 1, 32));
  await assert.rejects(f.manager.importDirectory(f.source), /size/i);
});

test('UNC, device and remote URI roots cannot become resource stores', async t => {
  const f = await fixture(t);
  for (const source of ['\\\\server\\share\\pets', '\\\\?\\C:\\pets', 'https://invalid/pets', '//server/share/pets']) assert.throws(() => new f.manager.constructor(source), /local|path|remote/i);
});

test('installed frame links and modified manifests remain unavailable after restart', async t => {
  const f = await fixture(t); await f.manager.importDirectory(f.source);
  const installed = path.join(f.store, f.manifest.id);
  await fs.link(path.join(installed, 'frame.png'), path.join(f.root, 'extra-link.png'));
  await assert.rejects(f.manager.asset(f.manifest.id, 'frame.png'), /link|identity/i);
  const next = new f.manager.constructor(f.store); await assert.rejects(next.init());
  await fs.unlink(path.join(f.root, 'extra-link.png'));
  await fs.writeFile(path.join(installed, 'manifest.json'), JSON.stringify({ ...f.manifest, author: 'tampered' }));
  await assert.rejects(f.manager.asset(f.manifest.id, 'frame.png'), /manifest/i);
});

test('interrupted uninstall tombstone stays disabled without blocking valid packs at restart', async t => {
  const f = await fixture(t); await f.manager.importDirectory(f.source);
  const tombstone = path.join(f.store, '.remove-'+randomUUID()); await fs.rename(path.join(f.store, f.manifest.id), tombstone);
  await fs.unlink(path.join(tombstone, 'frame.png'));
  f.manifest.id = 'user-second-pet'; await fs.writeFile(path.join(f.source, 'manifest.json'), JSON.stringify(f.manifest));
  const next = new f.manager.constructor(f.store); await next.init(); assert.deepEqual(next.list(), []);
  await next.importDirectory(f.source); assert.equal(next.list()[0].id, 'user-second-pet');
});

test('read-only uninstall residue cannot strand an active partial pack', async t => {
  const f = await fixture(t); await f.manager.importDirectory(f.source);
  const installed = path.join(f.store, f.manifest.id); await fs.chmod(path.join(installed, 'manifest.json'), 0o444);
  const result = await f.manager.remove(f.manifest.id); assert.equal(result, true); assert.equal(f.manager.list().length, 0);
  const next = new f.manager.constructor(f.store); await next.init(); assert.equal(next.list().length, 0);
  for (const name of await fs.readdir(f.store)) {
    assert.match(name, /^\.remove-/);
    await fs.chmod(path.join(f.store, name, 'manifest.json'), 0o600).catch(() => {});
  }
});

test('unlink failure after first frame deletion leaves only disabled tombstone and restart remains usable', async t => {
  const f = await fixture(t); await f.manager.importDirectory(f.source);
  const originalUnlink = fs.unlink;
  fs.unlink = async file => { if (path.basename(file) === 'manifest.json' && path.resolve(file).startsWith(f.store+path.sep)) throw Object.assign(new Error('Synthetic denied unlink'), { code: 'EPERM' }); return originalUnlink(file); };
  syncBuiltinESMExports();
  try { assert.equal(await f.manager.remove(f.manifest.id), true); } finally { fs.unlink = originalUnlink; syncBuiltinESMExports(); }
  assert.equal(f.manager.list().length, 0); const leftovers = await fs.readdir(f.store); assert.equal(leftovers.length, 1); assert.match(leftovers[0], /^\.remove-/);
  const next = new f.manager.constructor(f.store); await next.init(); assert.equal(next.list().length, 0);
  f.manifest.id = 'user-after-failure'; await fs.writeFile(path.join(f.source, 'manifest.json'), JSON.stringify(f.manifest)); await next.importDirectory(f.source); assert.equal(next.list()[0].id, 'user-after-failure');
});

for (const [label, modify] of [
  ['license absent', m => { delete m.license; }],
  ['builtin overwrite', m => { m.id = 'aps-dog'; }],
  ['path traversal', m => { m.files[0].file = '../frame.png'; }],
  ['Windows ADS', m => { m.files[0].file = 'frame.png:payload'; }],
  ['remote asset', m => { m.files[0].file = 'https://invalid/frame.png'; }],
  ['absolute asset', m => { m.files[0].file = 'C:\\frame.png'; }],
  ['case duplicate', m => { m.files.push({ ...m.files[0], file: 'FRAME.PNG' }); }],
  ['unsupported schema', m => { m.schema = 2; }],
  ['unknown field', m => { m.script = 'execute me'; }],
  ['wrong hash', m => { m.files[0].sha256 = '0'.repeat(64); }],
  ['excess frames', m => { m.states.idle = Array.from({ length: 97 }, () => ({ file: 'frame.png', duration: 10 })); }],
  ['bad duration', m => { m.states.idle[0].duration = 0; }],
  ['missing state', m => { delete m.states.sleeping; }],
  ['dimension mismatch', m => { m.canvas.width = 2; }],
]) test(`unsafe manifest refused: ${label}`, async t => { const f = await fixture(t, { modify }); await assert.rejects(f.manager.importDirectory(f.source)); assert.equal(f.manager.list().length, 0); assert.deepEqual(await fs.readdir(f.store), []); });

for (const [label, bytes] of [
  ['bad signature', Buffer.from('not a png')],
  ['bad CRC', (() => { const b = png(); b[29] ^= 1; return b; })()],
  ['high-bit chunk type with correct CRC', (() => { const b = png(); b[12] |= 128; b.writeUInt32BE(crc(b.subarray(12, 29)), 29); return b; })()],
  ['invalid deflate', png({ extra: chunk('IDAT', Buffer.from('invalid compressed bytes')) })],
  ['trailing data', Buffer.concat([png(), Buffer.from('payload')])],
  ['oversized canvas', png({ width: 513 })],
  ['bad scanline filter', png({ raw: Buffer.from([5, 1, 2, 3, 4]) })],
  ['invalid scanline size', png({ raw: Buffer.from([0]) })],
  ['inflate bomb', png({ raw: Buffer.alloc(2 * 1024 * 1024) })],
  ['untrusted metadata', png({ extra: chunk('tEXt', Buffer.from('url\0https://invalid')) })],
]) test(`corrupt PNG refused: ${label}`, async t => { const f = await fixture(t, { bytes }); await assert.rejects(f.manager.importDirectory(f.source)); assert.equal(f.manager.list().length, 0); });

test('unexpected code and nested directories are rejected before installing', async t => { const f = await fixture(t); await fs.writeFile(path.join(f.source, 'plugin.js'), 'throw Error("never run")'); await assert.rejects(f.manager.importDirectory(f.source)); await fs.unlink(path.join(f.source, 'plugin.js')); await fs.mkdir(path.join(f.source, 'nested')); await assert.rejects(f.manager.importDirectory(f.source)); });
test('hard-linked frame refused and later tampering fails closed', async t => { const f = await fixture(t); await fs.link(path.join(f.source, 'frame.png'), path.join(f.root, 'link.png')); await assert.rejects(f.manager.importDirectory(f.source)); await fs.unlink(path.join(f.root, 'link.png')); await f.manager.importDirectory(f.source); await fs.writeFile(path.join(f.store, f.manifest.id, 'frame.png'), png({ raw: Buffer.from([0, 0, 0, 0, 0]) })); await assert.rejects(f.manager.asset(f.manifest.id, 'frame.png')); });
test('junction import and replacement of the owned root fail closed', async t => { const f = await fixture(t); const alias = path.join(f.root, 'alias'); await fs.symlink(f.source, alias, process.platform === 'win32' ? 'junction' : 'dir'); await assert.rejects(f.manager.importDirectory(alias)); await f.manager.importDirectory(f.source); await fs.rename(f.store, f.store + '-old'); await fs.mkdir(f.store); await assert.rejects(f.manager.asset(f.manifest.id, 'frame.png')); await assert.rejects(f.manager.importDirectory(f.source)); });
