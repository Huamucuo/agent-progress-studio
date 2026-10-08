'use strict';
const { readFile, mkdir, readdir, writeFile, rename } = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const allowed = new Set(['SessionStart', 'UserPromptSubmit', 'PreToolUse', 'PostToolUse', 'Stop']);
const identifier = value => typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(value);

function projectEvent(input) {
  if (!input || !allowed.has(input.hook_event_name) || !identifier(input.session_id)) return null;
  if (input.turn_id != null && !identifier(input.turn_id)) return null;
  const event = { event_type: input.hook_event_name, session_id: input.session_id,
    turn_id: input.turn_id ?? null, timestamp: new Date().toISOString() };
  if (['PreToolUse', 'PostToolUse'].includes(input.hook_event_name)) {
    event.tool_name = typeof input.tool_name === 'string' && /^[A-Za-z][A-Za-z0-9_.:/-]{0,159}$/.test(input.tool_name) ? input.tool_name : null;
    event.tool_status = input.hook_event_name === 'PreToolUse' ? 'started' : 'unknown';
    if (input.hook_event_name === 'PostToolUse' && input.tool_response && typeof input.tool_response === 'object') {
      const response = input.tool_response, exitCode = response.exit_code ?? response.exitCode;
      if (Number.isInteger(exitCode)) event.tool_status = exitCode === 0 ? 'succeeded' : 'failed';
      else if (typeof response.isError === 'boolean') event.tool_status = response.isError ? 'failed' : 'succeeded';
    }
  }
  return event;
}

async function run() {
  // No output is ever taken from input. The empty object cannot steer a turn.
  const deadline = setTimeout(() => { process.stdout.write('{}'); process.exit(0); }, 2000);
  try {
    const chunks = []; let size = 0;
    for await (const chunk of process.stdin) {
      size += chunk.length;
      if (size > 256 * 1024) return;
      chunks.push(chunk);
    }
    const event = projectEvent(JSON.parse(Buffer.concat(chunks).toString('utf8')));
    if (!event) return;
    const settings = JSON.parse(await readFile(path.join(__dirname, '../settings.json'), 'utf8'));
    if (typeof settings.eventsDir !== 'string' || !path.isAbsolute(settings.eventsDir)) return;
    const dir = path.resolve(settings.eventsDir);
    await mkdir(dir, { recursive: true });
    // This is a bounded experiment, not an unbounded audit archive.
    if ((await readdir(dir)).length >= 10000) return;
    const name = `${Date.now()}-${randomUUID()}`;
    const pending = path.join(dir, `${name}.pending`);
    await writeFile(pending, JSON.stringify(event), { flag: 'wx', mode: 0o600 });
    await rename(pending, path.join(dir, `${name}.json`));
  } catch {
    // Never print raw Hook input, exception text, transcripts or tool responses.
  } finally { clearTimeout(deadline); process.stdout.write('{}'); }
}
module.exports = { projectEvent, run };
if (require.main === module) run();
