import test from 'node:test';
import assert from 'node:assert/strict';
import { validateEndpoint, AppServerSource } from '../src/adapters/app-server.mjs';

test('app-server endpoint only permits literal IPv4 loopback WebSockets', () => {
  assert.equal(validateEndpoint('ws://127.0.0.1:4500'), 'ws://127.0.0.1:4500/');
  for (const endpoint of ['ws://example.com:4500', 'ws://0.0.0.0:4500', 'ws://localhost.evil.test:4500', 'https://127.0.0.1', 'ws://user:password@127.0.0.1:4500', 'ws://127.0.0.1:4500/?token=secret']) assert.throws(() => validateEndpoint(endpoint));
});
test('notification filtering prevents unrelated threads and active state leakage', () => {
  const source = new AppServerSource('ws://127.0.0.1:4500', { canRead: id => id === 'abcdef12-abcd-4abc-8abc-abcdef123456', allowedIds: () => ['abcdef12-abcd-4abc-8abc-abcdef123456'] }); source.threadId = 'abcdef12-abcd-4abc-8abc-abcdef123456';
  source.receive({ method: 'turn/plan/updated', params: { threadId: 'feedbeef-abcd-4abc-8abc-abcdef123456', plan: [{ step: 'private other', status: 'completed' }] } });
  assert.equal(source.state.plan.length, 0);
  source.receive({ method: 'turn/plan/updated', params: { threadId: 'abcdef12-abcd-4abc-8abc-abcdef123456', plan: [{ step: 'chosen plan', status: 'pending' }] } });
  assert.equal(source.state.plan[0].step, 'chosen plan');
});
test('history displays current-turn tools without mixing in earlier turns', async () => {
  const source = new AppServerSource('ws://127.0.0.1:4500', { canRead: id => id === 'abcdef12-abcd-4abc-8abc-abcdef123456', allowedIds: () => ['abcdef12-abcd-4abc-8abc-abcdef123456'] }); source.threadId = 'abcdef12-abcd-4abc-8abc-abcdef123456'; source.connected = true;
  source.request = async method => {
    assert.equal(method, 'thread/read');
    return { thread: { id: 'abcdef12-abcd-4abc-8abc-abcdef123456', status: { type: 'active' }, turns: [
      { id: 'old', status: 'completed', items: [{ id: 'old-tool', type: 'commandExecution', status: 'completed', command: 'old' }] },
      { id: 'new', status: 'inProgress', items: [{ id: 'new-tool', type: 'commandExecution', status: 'inProgress', command: 'new' }] }
    ] } };
  };
  await source.poll(); assert.deepEqual(source.state.tools.map(t => t.id), ['new-tool']);
});
