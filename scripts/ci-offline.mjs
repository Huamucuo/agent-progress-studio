// Isolated fixture runner for the reviewed source and boundary regression suites.
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const repository = fileURLToPath(new URL('../', import.meta.url));
const sandbox = await fs.mkdtemp(path.join(os.tmpdir(), 'aps-offline-tests-'));
const home = path.join(sandbox, 'home'), codexHome = path.join(home, '.codex');
await fs.mkdir(codexHome, { recursive: true });
await fs.writeFile(path.join(sandbox, 'empty.gitconfig'), '');
// Do not pass account credentials, real session IDs, observer paths, trace settings,
// or developer Git configuration to test processes.
const allowed = /^(?:PATH|PATHEXT|SystemRoot|WINDIR|SystemDrive|COMSPEC|ComSpec|ProgramFiles|ProgramFiles\(x86\)|ProgramW6432|LANG|LC_ALL|TZ)$/i;
const environment = Object.fromEntries(Object.entries(process.env).filter(([key]) => allowed.test(key)));
Object.assign(environment, {
  HOME: home, USERPROFILE: home, CODEX_HOME: codexHome,
  APPDATA: path.join(home, 'AppData', 'Roaming'), LOCALAPPDATA: path.join(home, 'AppData', 'Local'),
  TMP: sandbox, TEMP: sandbox, TMPDIR: sandbox,
  GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: path.join(sandbox, 'empty.gitconfig'),
  GIT_TERMINAL_PROMPT: '0', CI: 'true'
});
const sanitize = text => [repository, repository.replaceAll('\\', '/'), sandbox, sandbox.replaceAll('\\', '/')]
  .reduce((value, item, index) => value.replaceAll(item, index < 2 ? '<repository>/' : '<synthetic-test-root>'), text);
async function run(args) {
  let output = '';
  const code = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, { cwd: repository, env: environment, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    const collect = data => { output += data.toString(); };
    child.stdout.on('data', collect); child.stderr.on('data', collect);
    child.on('error', reject); child.on('close', resolve);
  });
  process.stdout.write(sanitize(output));
  if (code !== 0) throw new Error(`Offline check failed (exit ${code}): ${args[0]}`);
}
try {
  console.log(`Synthetic fixtures only; Node ${process.version}; ${process.platform}/${process.arch}.`);
  await run(['scripts/version.mjs']);
  if (!process.argv.includes('--browser-only')) {
    const tests = (await fs.readdir(path.join(repository, 'tests'))).filter(name => name.endsWith('.test.mjs')).sort().map(name => 'tests/' + name);
    await run(['--test', '--test-reporter=tap', ...tests]);
  }
  if (process.argv.includes('--browser') || process.argv.includes('--browser-only')) {
    // Uses the already installed optional Playwright dependency and browser.
    // This runner never downloads a browser or reads a real Codex session.
    await run(['tests/browser.mjs']);
    await run(['tests/browser-privacy.mjs']);
  }
} finally {
  try {
    await fs.rm(sandbox, { recursive: true, force: true });
  } catch (error) {
    // Windows browsers can create protected LocalLow folders in the isolated
    // profile. Do not elevate, change ACLs, or hide a test failure to remove one.
    console.warn(`Synthetic temporary-folder cleanup incomplete (${error.code || 'unknown'}); no permissions changed.`);
  }
}
