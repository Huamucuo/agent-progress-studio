export function fakeRpc(t, { ids = ['rpc-a'], resultFirst = true } = {}) {
  const sockets = [], sent = [], callbacks = [], fixture = { sockets, sent, callbacks, ids, history: { id: ids[0], preview: 'AUTHORIZED_HISTORY', status: { type: 'active' }, turns: [{ id: 'turn-one', status: 'inProgress', items: [] }] } };
  fixture.reply = request => request.method === 'initialize' ? {} : request.method === 'thread/loaded/list' ? { data: fixture.ids, nextCursor: null } : request.method === 'thread/read' ? { thread: fixture.history } : { data: [] };
  class Socket extends EventTarget {
    constructor(url) { super(); this.url = url; sockets.push(this); queueMicrotask(() => this.dispatchEvent(new Event('open'))); }
    addEventListener(name, callback, options) { if (name === 'message') callbacks.push({ socket: this, callback }); super.addEventListener(name, callback, options); }
    send(raw) {
      const request = JSON.parse(raw); sent.push({ ...request, endpoint: this.url }); if (!request.id) return;
      const reply = fixture.reply(request); if (reply === undefined) return;
      const frame = reply.error ? { error: reply.error, id: request.id } : resultFirst ? { result: reply, id: request.id } : { id: request.id, result: reply };
      queueMicrotask(() => this.frame(JSON.stringify(frame)));
    }
    frame(data) { this.dispatchEvent(new MessageEvent('message', { data })); }
    close() { this.dispatchEvent(new Event('close')); }
  }
  t.mock.method(globalThis, 'WebSocket', function (url) { return new Socket(url); });
  fixture.emit = (method, params, socket = sockets.at(-1)) => socket.frame(JSON.stringify({ params, method }));
  return fixture;
}
