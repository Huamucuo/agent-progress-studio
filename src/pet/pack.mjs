import { lstat, realpath, mkdir, readdir, open, rename, unlink, rmdir } from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { inflateSync } from 'node:zlib';

const STATES = ['idle', 'working', 'waiting', 'happy', 'failed', 'sleeping'];
const MAX_FILE = 2 * 1024 * 1024, MAX_TOTAL = 20 * 1024 * 1024, MAX_MANIFEST = 64 * 1024;
const MAX_FRAMES = 96, MAX_DIMENSION = 512, MAX_PACKS = 32, MAX_RESIDUES = 64;
const residueName = name => /^\.(?:import|remove)-[a-f0-9-]{36}$/.test(name);
const fold = p => process.platform === 'win32' ? p.toLowerCase() : p;
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const clone = value => structuredClone(value);
const identity = (a, b) => a.dev === b.dev && a.ino === b.ino;
const unchanged = (a, b) => identity(a, b) && a.size === b.size && a.mtimeMs === b.mtimeMs && a.ctimeMs === b.ctimeMs;
const regular = s => s.isFile() && !s.isSymbolicLink() && s.nlink === 1;
const directory = s => s.isDirectory() && !s.isSymbolicLink();
const bad = message => { throw new Error(`Pet pack rejected: ${message}`); };
const validId = id => typeof id === 'string' && /^[a-z][a-z0-9-]{2,63}$/.test(id) && !id.startsWith('aps-') && !/^(?:con|prn|aux|nul|com[0-9]|lpt[0-9])(?:-|$)/.test(id);
function localPath(value) {
  if (typeof value !== 'string' || !value || /[\u0000-\u001f]/.test(value) || /^(?:\\\\|\/\/|[a-z][a-z0-9+.-]*:\/\/)/i.test(value)) bad('local resource path required; remote or device path forbidden');
  const absolute = path.resolve(value);
  if (process.platform === 'win32' && !/^[a-z]:\\/i.test(absolute)) bad('local drive path required');
  return absolute;
}
function fileName(name) {
  if (typeof name !== 'string' || name.length > 64 || !/^[a-z0-9][a-z0-9_.-]*\.png$/.test(name) || name.includes('..') || /^(?:con|prn|aux|nul|com[0-9]|lpt[0-9])\./.test(name)) bad('invalid PNG resource filename');
  return name;
}
function object(value, allowed, required = allowed) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(k => !allowed.includes(k)) || required.some(k => !Object.hasOwn(value, k))) bad('unknown or missing manifest field');
}
function text(value, max, field) {
  if (typeof value !== 'string' || value.length < 1 || value.length > max || !value.trim() || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)) bad(`invalid ${field}`);
  return value;
}
function point(value, width, height) {
  object(value, ['x', 'y']);
  if (![value.x, value.y].every(Number.isFinite) || value.x < 0 || value.y < 0 || value.x > width || value.y > height) bad('invalid canvas anchor or slot');
  return { x: value.x, y: value.y };
}

function validateManifest(m) {
  object(m, ['schema', 'id', 'name', 'version', 'author', 'source', 'license', 'canvas', 'files', 'states']);
  if (m.schema !== 1 || !validId(m.id)) bad('schema or builtin/conflicting id');
  text(m.name, 120, 'name'); text(m.version, 32, 'version'); text(m.author, 240, 'author'); text(m.source, 1024, 'source'); text(m.license, 8192, 'license');
  if (!/^\d{1,5}\.\d{1,5}\.\d{1,5}(?:-[a-z0-9.-]{1,12})?$/.test(m.version)) bad('invalid version');
  object(m.canvas, ['width', 'height', 'anchor', 'slots']);
  const { width, height } = m.canvas;
  if (![width, height].every(n => Number.isInteger(n) && n >= 1 && n <= MAX_DIMENSION)) bad('canvas dimensions exceed limit');
  point(m.canvas.anchor, width, height);
  object(m.canvas.slots, ['hat', 'scarf', 'action', 'background'], []);
  for (const slot of Object.values(m.canvas.slots)) point(slot, width, height);
  if (!Array.isArray(m.files) || m.files.length < 1 || m.files.length > MAX_FRAMES) bad('file count limit');
  const files = new Set();
  for (const item of m.files) {
    object(item, ['file', 'sha256']); fileName(item.file);
    if (files.has(item.file.toLowerCase())) bad('duplicate case-insensitive filename');
    files.add(item.file.toLowerCase());
    if (typeof item.sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(item.sha256)) bad('invalid SHA256');
  }
  object(m.states, STATES);
  let frames = 0; const used = new Set();
  for (const state of STATES) {
    const rows = m.states[state]; if (!Array.isArray(rows) || rows.length < 1 || rows.length > MAX_FRAMES) bad('invalid state frames');
    for (const row of rows) {
      object(row, ['file', 'duration']); fileName(row.file);
      if (!files.has(row.file) || !Number.isInteger(row.duration) || row.duration < 16 || row.duration > 10000) bad('unregistered frame or duration limit');
      used.add(row.file); if (++frames > MAX_FRAMES) bad('total frame limit');
    }
  }
  if (used.size !== files.size) bad('unreferenced file');
  return m;
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => { let c = n; for (let bit = 0; bit < 8; bit++) c = (c >>> 1) ^ ((c & 1) ? 0xedb88320 : 0); return c >>> 0; });
function crc(bytes) { let c = 0xffffffff; for (const b of bytes) c = CRC_TABLE[(c ^ b) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }

/** Deliberately small PNG subset: baseline 8-bit, noninterlaced, no metadata or animation. */
function validatePNG(bytes, canvas) {
  if (bytes.length > MAX_FILE || bytes.length < 57 || !bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) bad('PNG signature or file size');
  let offset = 8, channels = 0, width = 0, height = 0, ended = false; const parts = [];
  while (offset < bytes.length) {
    if (offset + 12 > bytes.length) bad('truncated PNG chunk');
    const length = bytes.readUInt32BE(offset), type = bytes.toString('latin1', offset+4, offset+8), end = offset + 12 + length;
    if (length > MAX_FILE || end > bytes.length || !['IHDR', 'IDAT', 'IEND'].includes(type)) bad('unsupported or oversized PNG chunk');
    if (crc(bytes.subarray(offset+4, end-4)) !== bytes.readUInt32BE(end-4)) bad('PNG CRC mismatch');
    const data = bytes.subarray(offset+8, end-4);
    if (type === 'IHDR') {
      if (offset !== 8 || length !== 13) bad('PNG header order');
      width = data.readUInt32BE(0); height = data.readUInt32BE(4); channels = ({ 0: 1, 2: 3, 4: 2, 6: 4 })[data[9]] ?? 0;
      if (width < 1 || height < 1 || width > MAX_DIMENSION || height > MAX_DIMENSION || width !== canvas.width || height !== canvas.height || data[8] !== 8 || !channels || data[10] !== 0 || data[11] !== 0 || data[12] !== 0) bad('PNG dimension or format mismatch');
    } else if (type === 'IDAT') {
      if (!channels || ended || !length) bad('PNG data order'); parts.push(data);
    } else {
      if (!parts.length || length !== 0 || end !== bytes.length) bad('PNG end or trailing data'); ended = true;
    }
    offset = end;
  }
  if (!ended) bad('PNG incomplete');
  const compressed = Buffer.concat(parts), stride = width * channels, expected = (stride+1) * height;
  let decoded;
  try { decoded = inflateSync(compressed, { maxOutputLength: expected+1, info: true }); } catch { bad('PNG compressed data or decode limit'); }
  if (decoded.buffer.length !== expected || decoded.engine.bytesWritten !== compressed.length) bad('PNG scanline size or extra compressed data');
  // Validate and reconstruct every filter row, so malformed pixel data never reaches a renderer.
  const pixels = Buffer.alloc(width * height * channels), raw = decoded.buffer;
  const paeth = (a, b, c) => { const p = a+b-c, pa = Math.abs(p-a), pb = Math.abs(p-b), pc = Math.abs(p-c); return pa <= pb && pa <= pc ? a : pb <= pc ? b : c; };
  for (let y = 0; y < height; y++) {
    const filter = raw[y*(stride+1)]; if (filter > 4) bad('PNG invalid scanline filter');
    for (let x = 0; x < stride; x++) {
      const i = y*stride+x, a = x >= channels ? pixels[i-channels] : 0, b = y ? pixels[i-stride] : 0, c = y && x >= channels ? pixels[i-stride-channels] : 0;
      const extra = filter === 0 ? 0 : filter === 1 ? a : filter === 2 ? b : filter === 3 ? Math.floor((a+b)/2) : paeth(a,b,c);
      pixels[i] = (raw[y*(stride+1)+1+x]+extra) & 255;
    }
  }
  return { width, height };
}

/** Check all ancestors too: canonical containment alone would accept an in-scope junction. */
async function safeDirectory(input) {
  const absolute = path.resolve(input); let cursor = absolute;
  for (;;) {
    const named = await lstat(cursor);
    if (!directory(named) || fold(await realpath(cursor)) !== fold(cursor)) bad('directory alias or reparse identity');
    const parent = path.dirname(cursor); if (parent === cursor) break; cursor = parent;
  }
  return { absolute, stat: await lstat(absolute) };
}
async function ensureDirectory(input) {
  const absolute = path.resolve(input); let parent = absolute;
  for (;;) {
    try { await safeDirectory(parent); break; } catch (e) { if (e.code !== 'ENOENT') throw e; const next = path.dirname(parent); if (next === parent) throw e; parent = next; }
  }
  await mkdir(absolute, { recursive: true, mode: 0o700 }); return safeDirectory(absolute);
}
async function checkDirectory(root, expected) {
  const current = await safeDirectory(root);
  if (!identity(expected, current.stat)) bad('directory identity changed');
}
async function readRegular(root, rootIdentity, name, max, details = false) {
  await checkDirectory(root, rootIdentity);
  const file = path.join(root, name), named = await lstat(file);
  if (!regular(named) || named.size < 1 || named.size > max || fold(await realpath(file)) !== fold(file)) bad('file alias, hardlink, size or identity');
  const handle = await open(file, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  try {
    const before = await handle.stat();
    if (!regular(before) || !unchanged(named, before)) bad('file identity changed before read');
    const bytes = Buffer.alloc(before.size+1); let count = 0;
    while (count < bytes.length) { const result = await handle.read(bytes, count, bytes.length-count, count); if (!result.bytesRead) break; count += result.bytesRead; }
    const after = await handle.stat(), renamed = await lstat(file);
    if (count !== before.size || !regular(after) || !regular(renamed) || !unchanged(before, after) || !unchanged(before, renamed)) bad('file changed during read');
    await checkDirectory(root, rootIdentity);
    return details ? { bytes: bytes.subarray(0, count), identity: before } : bytes.subarray(0, count);
  } finally { await handle.close(); }
}
/** Names and types only. Never open a manifest, image, log or session body during this pass. */
async function metadataPreflight(root, expected) {
  await checkDirectory(root, expected);
  const entries = await readdir(root, { withFileTypes: true });
  if (entries.length > MAX_FRAMES+1 || !entries.some(entry => entry.name === 'manifest.json')) bad('unexpected directory metadata or missing manifest');
  for (const entry of entries) {
    if (!entry.isFile() || entry.isSymbolicLink()) bad('metadata-only preflight rejects directory or link');
    if (entry.name !== 'manifest.json') fileName(entry.name);
  }
  let total = 0;
  for (const entry of entries) {
    const named = await lstat(path.join(root, entry.name)), max = entry.name === 'manifest.json' ? MAX_MANIFEST : MAX_FILE;
    if (!regular(named) || named.size < 1 || named.size > max) bad('metadata-only file type, link or size rejected');
    if ((total += named.size) > MAX_TOTAL) bad('total size exceeds metadata quota');
  }
  await checkDirectory(root, expected);
  return entries;
}
async function inspectPack(input, expectedId, keepBytes = false) {
  const { absolute, stat } = await safeDirectory(input);
  // Resource-folder consent does not grant session reading: reject unknown names/types first.
  const entries = await metadataPreflight(absolute, stat);
  const namedManifest = await readRegular(absolute, stat, 'manifest.json', MAX_MANIFEST, true), rawManifest = namedManifest.bytes;
  let parsed; try { parsed = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(rawManifest)); } catch { bad('manifest JSON or encoding'); }
  const manifest = validateManifest(parsed);
  if (expectedId && manifest.id !== expectedId) bad('manifest id differs from installed directory');
  const names = new Set(['manifest.json', ...manifest.files.map(f => f.file)]);
  if (entries.length !== names.size || entries.length > MAX_FRAMES+1) bad('unexpected file or nested directory');
  for (const entry of entries) if (!entry.isFile() || entry.isSymbolicLink() || !names.has(entry.name)) bad('unlisted file, code, or linked directory');
  let total = rawManifest.length; const buffers = new Map(), filesIdentity = new Map([['manifest.json', namedManifest.identity]]);
  for (const item of manifest.files) {
    const read = await readRegular(absolute, stat, item.file, MAX_FILE, true), bytes = read.bytes; total += bytes.length;
    if (total > MAX_TOTAL || hash(bytes) !== item.sha256) bad('total size or SHA256 mismatch');
    validatePNG(bytes, manifest.canvas); filesIdentity.set(item.file, read.identity); if (keepBytes) buffers.set(item.file, bytes);
  }
  const after = await readRegular(absolute, stat, 'manifest.json', MAX_MANIFEST);
  if (!rawManifest.equals(after)) bad('manifest changed while importing');
  await checkDirectory(absolute, stat);
  return { manifest, identity: stat, manifestHash: hash(rawManifest), buffers, filesIdentity };
}

/** Resource-id-only registry. No filesystem path is returned to a renderer. */
export class PetPackManager {
  #root; #identity; #registry = new Map(); #inspections = new Map(); #queue = Promise.resolve();
  constructor(directoryPath) {
    this.#root = localPath(directoryPath);
  }
  #serial(operation) { const result = this.#queue.then(operation); this.#queue = result.catch(() => {}); return result; }
  async #checkRoot() { if (!this.#identity) bad('manager not initialized'); await checkDirectory(this.#root, this.#identity); }
  async init() {
    return this.#serial(async () => {
      if (this.#identity) { await this.#checkRoot(); return this.list(); }
      const root = await ensureDirectory(this.#root), registry = new Map();
      const entries = await readdir(this.#root, { withFileTypes: true });
      let active = 0;
      for (const entry of entries) {
        // Crash-left staging is never enabled. Explicit operator cleanup is preferable to unsafe recursive deletion.
        if (residueName(entry.name) && entry.isDirectory() && !entry.isSymbolicLink()) continue;
        if (!validId(entry.name) || !entry.isDirectory() || entry.isSymbolicLink()) bad('invalid owned registry entry');
        if (++active > MAX_PACKS) bad('installed pack count exceeds limit');
        registry.set(entry.name, await inspectPack(path.join(this.#root, entry.name), entry.name));
      }
      await checkDirectory(this.#root, root.stat); this.#identity = root.stat; this.#registry = registry; return this.list();
    });
  }
  list() { return Array.from(this.#registry.values(), pack => clone(pack.manifest)); }
  async inspectDirectory(source) {
    await this.#checkRoot();
    const selected = localPath(source), candidate = await inspectPack(selected);
    await this.#checkRoot();
    if (this.#inspections.size >= 8) this.#inspections.delete(this.#inspections.keys().next().value);
    this.#inspections.set(fold(selected), candidate);
    return clone(candidate.manifest);
  }
  async importDirectory(source, options = {}) {
    return this.#serial(async () => {
      await this.#checkRoot(); if (this.#registry.size >= MAX_PACKS) bad('installed pack count limit');
      // Existing disabled residues never prevent valid packs from starting. Bound creation instead.
      const residueCount = (await readdir(this.#root)).filter(residueName).length;
      if (residueCount >= MAX_RESIDUES) bad('disabled residue quota: cleanup required before importing another pack');
      const sourceAbsolute = localPath(source), relative = path.relative(fold(this.#root), fold(sourceAbsolute));
      if (!relative || (!relative.startsWith('..'+path.sep) && relative !== '..' && !path.isAbsolute(relative))) bad('source overlaps owned packs');
      const candidate = await inspectPack(sourceAbsolute, undefined, true), id = candidate.manifest.id, target = path.join(this.#root, id);
      object(options, ['expectedManifest'], []);
      if (options.expectedManifest !== undefined) {
        const expected = validateManifest(clone(options.expectedManifest)), preview = this.#inspections.get(fold(sourceAbsolute));
        if (!preview || hash(JSON.stringify(expected)) !== hash(JSON.stringify(preview.manifest)) || hash(JSON.stringify(expected)) !== hash(JSON.stringify(candidate.manifest)) || preview.manifestHash !== candidate.manifestHash || !identity(preview.identity, candidate.identity)) bad('confirmed inspection or manifest changed');
        for (const [name, before] of preview.filesIdentity) if (!candidate.filesIdentity.has(name) || !unchanged(before, candidate.filesIdentity.get(name))) bad('confirmed preview file identity changed');
      }
      if (this.#registry.has(id)) bad('pack already exists');
      try { await lstat(target); bad('pack directory conflict'); } catch (e) { if (e.code !== 'ENOENT') throw e; }
      const staging = path.join(this.#root, '.import-'+randomUUID());
      await this.#checkRoot(); await mkdir(staging, { mode: 0o700 });
      const staged = await safeDirectory(staging); let installed = false;
      try {
        const files = new Map(candidate.buffers); files.set('manifest.json', Buffer.from(JSON.stringify(candidate.manifest)));
        for (const [name, bytes] of files) {
          await this.#checkRoot(); await checkDirectory(staging, staged.stat);
          const handle = await open(path.join(staging, name), 'wx', 0o600);
          try { await handle.writeFile(bytes); await handle.sync(); if (!regular(await handle.stat())) bad('staging file identity'); } finally { await handle.close(); }
        }
        const checked = await inspectPack(staging, id);
        await this.#checkRoot(); await checkDirectory(staging, staged.stat);
        try { await lstat(target); bad('pack directory conflict'); } catch (e) { if (e.code !== 'ENOENT') throw e; }
        await rename(staging, target); installed = true;
        await this.#checkRoot(); await checkDirectory(target, checked.identity);
        this.#registry.set(id, checked); this.#inspections.delete(fold(sourceAbsolute)); return clone(checked.manifest);
      } finally {
        if (!installed) await this.#cleanupStaging(staging, staged.stat).catch(() => {});
      }
    });
  }
  async #cleanupStaging(staging, expected) {
    await this.#checkRoot(); await checkDirectory(staging, expected);
    const entries = await readdir(staging, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name !== 'manifest.json') fileName(entry.name);
      const file = path.join(staging, entry.name), named = await lstat(file);
      if (!regular(named)) bad('staging cleanup identity');
      await this.#checkRoot(); await checkDirectory(staging, expected); await unlink(file);
    }
    await checkDirectory(staging, expected); await rmdir(staging);
  }
  async remove(id) {
    return this.#serial(async () => {
      await this.#checkRoot(); if (!validId(id) || !this.#registry.has(id)) bad('unknown or builtin pack');
      const pack = this.#registry.get(id), target = path.join(this.#root, id);
      await checkDirectory(target, pack.identity);
      // Validate before unlink; never recursively follow a replaced directory or remove arbitrary entries.
      const checked = await inspectPack(target, id);
      if (!identity(pack.identity, checked.identity) || pack.manifestHash !== checked.manifestHash) bad('installed manifest identity changed');
      await this.#checkRoot(); await checkDirectory(target, pack.identity);
      const tombstone = path.join(this.#root, '.remove-'+randomUUID());
      // Linearization: atomically leave the enabled namespace before deleting any file.
      // A cleanup error or crash can only leave a disabled tombstone; unrelated packs still initialize.
      await rename(target, tombstone);
      await this.#checkRoot(); await checkDirectory(tombstone, pack.identity);
      this.#registry.delete(id);
      await this.#cleanupStaging(tombstone, pack.identity).catch(() => {});
      return true;
    });
  }
  async asset(id, file) {
    await this.#checkRoot(); if (!validId(id) || !this.#registry.has(id)) bad('unregistered resource id'); fileName(file);
    const pack = this.#registry.get(id), item = pack.manifest.files.find(entry => entry.file === file);
    if (!item) bad('unregistered PNG resource');
    const target = path.join(this.#root, id); await checkDirectory(target, pack.identity);
    const manifest = await readRegular(target, pack.identity, 'manifest.json', MAX_MANIFEST);
    if (hash(manifest) !== pack.manifestHash) bad('installed manifest changed');
    const bytes = await readRegular(target, pack.identity, file, MAX_FILE);
    if (hash(bytes) !== item.sha256) bad('installed PNG SHA256 changed');
    const dimensions = validatePNG(bytes, pack.manifest.canvas);
    await this.#checkRoot(); await checkDirectory(target, pack.identity);
    if (this.#registry.get(id) !== pack) bad('resource removed during read');
    return { bytes, mimeType: 'image/png', sha256: item.sha256, ...dimensions };
  }
}
