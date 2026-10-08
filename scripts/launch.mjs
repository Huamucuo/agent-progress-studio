import { createApplication } from '../src/server.mjs';
import { spawn } from 'node:child_process';
const args = process.argv.slice(2), option = name => { const index = args.indexOf(name); return index >= 0 ? args[index + 1] : undefined; };
const port = Number(option('--port') || process.env.APS_PORT || 4317);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid port');
try {
  const app = await createApplication({ port, mode: args.includes('--demo') ? 'demo' : 'local', workspace: option('--workspace'), codexHome: option('--codex-home'), dataDir: option('--data-dir') });
  console.log(`Agent Progress Studio 0.1.0\n${app.url}\nKeep this window open. Press Ctrl+C to stop.\nNo hooks or plugins installed.`);
  if (!args.includes('--no-open')) {
    const program = process.platform === 'win32' ? 'explorer.exe' : process.platform === 'darwin' ? 'open' : 'xdg-open';
    const child = spawn(program, [app.url], { stdio: 'ignore', windowsHide: true }); child.on('error', () => console.log('Open the URL above in your browser.')); child.unref();
  }
  const stop = async () => { await app.close(); process.exit(0); };
  process.on('SIGINT', stop); process.on('SIGTERM', stop);
} catch (error) { console.error(error.code === 'EADDRINUSE' ? `Port ${port} is in use. Run start.cmd --port ${port + 1}` : error.message); process.exitCode = 1; }
