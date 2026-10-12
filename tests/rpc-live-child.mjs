import { SessionAccess, sessionRef } from '../src/core/session-access.mjs';
import { AppServerSource } from '../src/adapters/app-server.mjs';
const endpoint = process.argv[2], access = new SessionAccess(), ref = sessionRef('rpc:' + endpoint, 'rpc-fixture');
await access.change(ref, { origin: 'codex', content: true }, access.revision);
const source = new AppServerSource(endpoint, { access, timeoutMs: 1500 });
const timeout = setTimeout(() => { source.close(); process.exit(2); }, 6000);
await source.connect(); await source.select(ref.id); process.send?.({ ready: true });
const check = setInterval(() => {
  if (!source.state.plan.some(step => step.step === 'LEGITIMATE_AFTER_MALFORMED')) return;
  console.log(JSON.stringify({ survived: true, turnId: source.state.turnId, malformed: source.diagnostics.malformed || 0 }));
  clearTimeout(timeout); clearInterval(check); source.close(); process.exit(0);
}, 10);
