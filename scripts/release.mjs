import { execFileSync } from 'node:child_process';
import { readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { inflateRawSync } from 'node:zlib';
const root = fileURLToPath(new URL('../', import.meta.url)), args = process.argv.slice(2), option = name => args[args.indexOf(name) + 1];
const git = (...params) => execFileSync('git', ['-c', 'core.autocrlf=false', '-c', 'core.eol=lf', '-C', root, ...params], { windowsHide: true, maxBuffer: 32 * 1024 * 1024 });
const hash = data => createHash('sha256').update(data).digest('hex');
// Read our own Git-produced ZIP central directory so hashes describe the actual
// exported bytes, including explicit .gitattributes conversions such as CMD CRLF.
function zipFiles(data, prefix) {
  const end = data.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06])), result = new Map();
  if (end < 0) throw new Error('Missing ZIP directory');
  const count = data.readUInt16LE(end + 10); let cursor = data.readUInt32LE(end + 16);
  if (count === 65535 || cursor === 0xffffffff) throw new Error('ZIP64 requires a separate release review');
  for (let index = 0; index < count; index++) {
    if (data.readUInt32LE(cursor) !== 0x02014b50) throw new Error('Invalid ZIP directory');
    const method = data.readUInt16LE(cursor + 10), size = data.readUInt32LE(cursor + 20), plainSize = data.readUInt32LE(cursor + 24);
    const length = data.readUInt16LE(cursor + 28), local = data.readUInt32LE(cursor + 42), name = data.subarray(cursor + 46, cursor + 46 + length).toString('utf8');
    cursor += 46 + length + data.readUInt16LE(cursor + 30) + data.readUInt16LE(cursor + 32);
    if (!name.startsWith(prefix)) throw new Error('Unexpected ZIP path');
    if (name.endsWith('/')) continue;
    if (data.readUInt32LE(local) !== 0x04034b50) throw new Error('Invalid ZIP member');
    const start = local + 30 + data.readUInt16LE(local + 26) + data.readUInt16LE(local + 28), compressed = data.subarray(start, start + size);
    const bytes = method === 0 ? compressed : method === 8 ? inflateRawSync(compressed, { maxOutputLength: 32 * 1024 * 1024 }) : null;
    const relative = name.slice(prefix.length);
    if (!bytes || bytes.length !== plainSize || result.has(relative)) throw new Error('Invalid ZIP member data');
    result.set(relative, bytes);
  }
  return result;
}
if (git('status', '--porcelain').toString().trim()) throw new Error('Commit a clean tree before packaging');
const commit = git('rev-parse', 'HEAD').toString().trim(); if (!/^[0-9a-f]{40}$/.test(commit)) throw new Error('Expected full commit SHA');
const pkg = JSON.parse(git('show', `${commit}:package.json`).toString()), version = pkg.version;
if (!/^\d+\.\d+\.\d+-rc\.\d+$/.test(version)) throw new Error('Candidate version required');
const out = path.resolve(args.includes('--out-dir') ? option('--out-dir') : path.join(root, '..'));
await mkdir(out, { recursive: true });
const name = `Agent-Progress-Studio-${version}-Windows`, zip = path.join(out, name + '.zip');
if (await stat(zip).then(() => true, e => { if (e.code === 'ENOENT') return false; throw e; })) throw new Error('Candidate already exists; never overwrite a fixed ZIP');
const files = git('ls-tree', '-r', '--name-only', commit).toString().trim().split('\n');
if (files.some(p => /(^|\/)(?:node_modules|\.aps-data|test-results|work)(\/|$)|(?:^|\/)\.env|\.(?:log|pem|key|pfx|woff2?|ttf|otf)$/i.test(p))) throw new Error('Release allowlist requires review');
git('archive', '--format=zip', `--prefix=${name}/`, '-o', zip, commit);
const archive = await readFile(zip), exported = zipFiles(archive, name + '/'), sha256 = hash(archive);
if (exported.size !== files.length || files.some(file => !exported.has(file))) throw new Error('Archive file set differs from the fixed Git tree');
const manifest = files.map(file => { const data = exported.get(file), blob = git('show', `${commit}:${file}`); return { path: file, bytes: data.length, sha256: hash(data), gitBlobBytes: blob.length, gitBlobSHA256: hash(blob) }; });
await writeFile(path.join(out, name + '.sha256'), `${sha256}  ${name}.zip\n`, { flag: 'wx' });
await writeFile(path.join(out, name + '.files.json'), JSON.stringify({ version, commit, zip: name + '.zip', sha256, files: manifest }, null, 2), { flag: 'wx' });
await writeFile(path.join(out, name + '.RELEASE-NOTES.md'), `# Agent Progress Studio ${version}\n\nPrivate release candidate; awaiting Work B audit and manual acceptance.\n\nCommit: ${commit}\n\nZIP SHA256: ${sha256}\n\nFixed-tree source distribution, ${files.length} files. Node.js 22.15+ required. See docs/RC4-REMEDIATION.md and docs/PRIVACY-SCOPE.md. No bundled dependencies, credentials, session data or fonts.\n`, { flag: 'wx' });
console.log(JSON.stringify({ version, commit, zip, sha256, files: files.length }, null, 2));
