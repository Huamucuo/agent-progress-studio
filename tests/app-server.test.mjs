import test from 'node:test';
import assert from 'node:assert/strict';
import { validateEndpoint, AppServerSource } from '../src/adapters/app-server.mjs';
import { scanEnvelope } from '../src/adapters/rpc-envelope.mjs';
import { SessionAccess, sessionRef } from '../src/core/session-access.mjs';
import { fakeRpc } from './rpc-fixture.mjs';
const endpoint = 'ws://127.0.0.1:4500/', ref = sessionRef('rpc:' + endpoint, 'rpc-a');
async function client(t, granted = true) {
  const f = fakeRpc(t), access = new SessionAccess();
  if (granted) await access.change(ref, { origin: 'codex', content: true }, access.revision);
  const source = new AppServerSource(endpoint, { access, timeoutMs: 80 }); t.after(() => source.close()); await source.connect(); await source.select(ref.id); return { f, access, source };
}
test('app-server endpoint permits only literal loopback; unknown and mutating methods never send', async t => {
  assert.equal(validateEndpoint('ws://127.0.0.1:4500'), endpoint);
  for (const url of ['ws://example.com:4500', 'ws://0.0.0.0:4500', 'ws://localhost.evil:4500', 'https://127.0.0.1', 'ws://u:p@127.0.0.1:4500', endpoint + '?token=secret']) assert.throws(() => validateEndpoint(url));
  const { f, source } = await client(t, false); const before = f.sent.length;
  for (const method of ['thread/list', 'thread/resume', 'thread/start', 'thread/fork', 'turn/start', 'unknown/method', 'thread/read']) await assert.rejects(source.request(method, { threadId: ref.id }));
  assert.equal(f.sent.length, before); assert.ok(f.sent.every(x => x.endpoint === endpoint));
});
test('F-01 RPC-only discovery is ID-only, selectable before grant, paginated, refreshed without stealing selection', async t => {
  const { f, source, access } = await client(t, false);
  assert.equal(source.threadId, ref.id); assert.equal(source.state.title, ''); assert.equal(f.sent.some(x => x.method === 'thread/read'), false);
  f.reply = req => req.method === 'initialize' ? {} : req.method === 'thread/loaded/list' ? req.params.cursor ? { data: ['rpc-c'], nextCursor: null } : { data: ['rpc-a', 'rpc-b'], nextCursor: 'page2' } : { thread: f.history };
  await source.poll(); assert.deepEqual(source.sessions.map(s => s.id), ['rpc-a', 'rpc-b', 'rpc-c']); assert.equal(source.threadId, 'rpc-a');
  await access.change(ref, { origin: 'codex', content: true }, access.revision); await source.poll(); assert.equal(source.state.title, 'AUTHORIZED_HISTORY');
  assert.equal(f.sent.some(x => x.method === 'thread/list'), false);
  f.reply = req => req.method === 'initialize' ? {} : req.method === 'thread/loaded/list' ? { error: { code: -32601, message: 'PRIVATE_HOST_ERROR' } } : { thread: f.history };
  await source.poll(); assert.match(source.diagnostics.discovery, /UNSUPPORTED/); assert.equal(source.state.title, 'AUTHORIZED_HISTORY'); assert.doesNotMatch(JSON.stringify(source.diagnostics), /PRIVATE/);
});
test('F-02 valid reordered/escaped envelopes, typed string and int64 IDs; reject duplicates, ambiguity and limits', () => {
  for (const frame of ['{"result":{},"id":"x"}', ' '.repeat(300) + '{"id":"x","result":{}}', '{"result":{"nested":{"id":9}},"i\\u0064":"x"}']) assert.equal(scanEnvelope(frame).requestKey, 's:x');
  assert.equal(scanEnvelope('{"result":{},"id":9223372036854775807}').requestKey, 'n:9223372036854775807');
  assert.notEqual(scanEnvelope('{"id":"1","result":{}}').requestKey, scanEnvelope('{"id":1,"result":{}}').requestKey);
  for (const bad of ['{"id":1,"i\\u0064":2}', '{"id":1.5}', '{"id":9223372036854775808}', '{"id":null}', '{"result":' + '['.repeat(70) + '0' + ']'.repeat(70) + '}', ' '.repeat(8 * 1024 * 1024 + 1)]) assert.throws(() => scanEnvelope(bad));
  assert.equal(scanEnvelope('{"result":{"id":9,"text":"id: 1"}}').hasId, false);
  assert.ok(scanEnvelope('{"id":"ok","result":{"data":"' + 'a'.repeat(1024 * 1024) + '"}}').at('result'));
});
test('R04 actual connect/message/wire path carries plan, token, tool and turn events; unknown frames never parse payload', async t => {
  const { f, source } = await client(t); let privateParses = 0; const parse = JSON.parse;
  t.mock.method(JSON, 'parse', raw => { if (raw.includes('PRIVATE_OTHER')) privateParses++; return parse(raw); });
  f.emit('turn/plan/updated', { threadId: 'rpc-b', turnId: 'turn-one', plan: [{ step: 'PRIVATE_OTHER', status: 'pending' }] });
  f.sockets.at(-1).frame('{"result":{"thread":{"id":"rpc-b","preview":"PRIVATE_OTHER"}},"id":"unknown"}');
  assert.equal(privateParses, 0); assert.equal(source.state.plan.length, 0);
  f.emit('turn/plan/updated', { threadId: ref.id, turnId: 'turn-one', plan: [{ step: 'chosen plan', status: 'inProgress' }] });
  f.emit('thread/tokenUsage/updated', { threadId: ref.id, turnId: 'turn-one', tokenUsage: { total: { totalTokens: 42 }, last: { totalTokens: 12 }, modelContextWindow: 1000 } });
  assert.equal(source.state.plan[0].step, 'chosen plan'); assert.equal(source.state.usage.total, 42); assert.equal(source.state.usage.last, 12);
  f.emit('item/started', { threadId: ref.id, turnId: 'turn-one', item: { id: 'tool', type: 'commandExecution', command: 'synthetic test', status: 'inProgress' } });
  assert.equal(source.state.tools[0].status, 'inProgress');
  f.emit('item/completed', { threadId: ref.id, turnId: 'turn-one', item: { id: 'tool', type: 'commandExecution', command: 'synthetic test', status: 'completed', exitCode: 0 } });
  f.emit('turn/completed', { threadId: ref.id, turn: { id: 'turn-one', status: 'completed' } }); assert.equal(source.state.phase, 'completed');
  f.emit('turn/started', { threadId: ref.id, turn: { id: 'turn-two', status: 'inProgress' } });
  f.emit('turn/plan/updated', { threadId: ref.id, turnId: 'turn-one', plan: [{ step: 'OLD', status: 'pending' }] });
  assert.equal(source.state.plan.length, 0);
});
test('T-01 revoke/regrant same ID and turn rejects queued callbacks and old connection frames, accepts new channel', async t => {
  const { f, source, access } = await client(t), old = f.callbacks.at(-1), oldChannel = source.channel;
  const raw = JSON.stringify({ method: 'turn/plan/updated', params: { threadId: ref.id, turnId: 'turn-one', plan: [{ step: 'OLD_GENERATION', status: 'pending' }] } });
  await access.change(ref, { content: false }, access.revision); await access.change(ref, { content: true }, access.revision); await source.poll();
  old.callback(new MessageEvent('message', { data: raw })); old.socket.frame(raw); source.receiveWire(raw, oldChannel);
  assert.equal(source.state.plan.length, 0);
  f.emit('turn/plan/updated', { threadId: ref.id, turnId: 'turn-one', plan: [{ step: 'NEW_GENERATION', status: 'completed' }] });
  assert.equal(source.state.plan[0].step, 'NEW_GENERATION');
});
test('R05 history changes twice, retains only current turn tools, rejects wrong identity before body parse', async t => {
  const { f, source } = await client(t);
  f.history.turns.push({ id: 'new', status: 'inProgress', items: [{ id: 'new-tool', type: 'commandExecution', command: 'new', status: 'inProgress' }] });
  await source.poll(); assert.deepEqual(source.state.tools.map(x => x.id), ['new-tool']);
  f.history.turns.at(-1).status = 'completed'; await source.poll(); assert.equal(source.state.phase, 'completed'); assert.equal(source.state.usage.total, null);
  f.history.id = 'other'; f.history.preview = 'PRIVATE_WRONG_ID'; let parsed = 0; const parse = JSON.parse;
  t.mock.method(JSON, 'parse', raw => { if (raw.includes('PRIVATE_WRONG_ID')) parsed++; return parse(raw); });
  await assert.rejects(source.poll(), /identity/); assert.equal(parsed, 0);
});
test('R02 timeout, ambiguous response and server request cannot resolve pending; reconnect recovers', async t => {
  const { f, source } = await client(t); f.reply = () => undefined;
  const pending = source.request('thread/read', { threadId: ref.id, includeTurns: true }), req = f.sent.at(-1);
  f.sockets.at(-1).frame(JSON.stringify({ id: req.id, method: 'approval/request', result: {} }));
  f.sockets.at(-1).frame(JSON.stringify({ id: req.id, result: {}, error: {} }));
  await assert.rejects(pending, /timed out/); assert.equal(source.pending.size, 0);
  source.disconnect(); f.reply = request => request.method === 'initialize' ? {} : request.method === 'thread/loaded/list' ? { data: [ref.id] } : { thread: f.history };
  await source.poll(); assert.equal(source.state.title, 'AUTHORIZED_HISTORY');
});
test('T-03 notification arriving during a history request wins without losing next history poll', async t => {
  const { f, source } = await client(t); const original = f.reply; let request;
  f.reply = req => req.method === 'thread/read' ? (request = req, undefined) : original(req);
  const poll = source.poll(); while (!request) await new Promise(r => setImmediate(r));
  f.emit('turn/plan/updated', { threadId: ref.id, turnId: 'turn-one', plan: [{ step: 'FRESH', status: 'pending' }] });
  f.sockets.at(-1).frame(JSON.stringify({ result: { thread: f.history }, id: request.id })); await poll; assert.equal(source.state.plan[0].step, 'FRESH');
  f.reply = original; await source.poll(); assert.equal(source.state.plan[0].step, 'FRESH');
});

test('R05 official turn/item page shapes preserve turn identity and legacy fallback', async t => {
  const { f, source } = await client(t); f.history.turns = [{ id: 'turn-one', status: 'inProgress', itemsView: 'summary', items: [] }];
  const original = f.reply;
  f.reply = request => request.method === 'thread/turns/list' ? { data: [{ id: 'turn-one', status: 'inProgress', itemsView: 'notLoaded', items: [] }] }
    : request.method === 'thread/items/list' ? { data: [{ turnId: 'turn-one', item: { id: request.params.cursor ? 'second' : 'first', type: 'commandExecution', command: 'fixture', status: 'completed', exitCode: 0 } }], nextCursor: request.params.cursor ? null : 'items-page2' }
      : original(request);
  await source.poll(); assert.deepEqual(source.state.tools.map(t => t.id), ['first', 'second']); assert.equal(source.diagnostics.itemPaging, 'SUPPORTED');
  f.reply = request => request.method === 'thread/turns/list' || request.method === 'thread/items/list' ? { error: { code: -32601, message: 'unsupported' } } : original(request);
  await source.poll(); assert.match(source.diagnostics.historyPaging, /UNSUPPORTED/); assert.equal(source.state.title, 'AUTHORIZED_HISTORY');
});

test('T-03 history that lags a delivered new turn cannot restore the retired turn', async t => {
  const { f, source } = await client(t);
  f.emit('turn/started', { threadId: ref.id, turn: { id: 'turn-two', status: 'inProgress' } });
  f.emit('turn/plan/updated', { threadId: ref.id, turnId: 'turn-two', plan: [{ step: 'CURRENT_TURN_PLAN', status: 'inProgress' }] });
  await source.poll(); assert.equal(source.state.turnId, 'turn-two'); assert.equal(source.state.plan[0].step, 'CURRENT_TURN_PLAN');
  f.history.turns = [{ id: 'turn-two', status: 'completed', items: [] }];
  await source.poll(); assert.equal(source.state.phase, 'completed'); assert.equal(source.state.plan[0].step, 'CURRENT_TURN_PLAN');
});
