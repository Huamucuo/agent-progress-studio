import { createServer } from 'node:http';
import { createHash } from 'node:crypto';

/** Real RFC6455 loopback peer for synthetic frames; never connects to Codex. */
export async function wireHost() {
  const sockets = new Set(); let latest;
  const fixture = {
    history: { id: 'rpc-fixture', preview: 'SYNTHETIC_HISTORY', status: { type: 'active' }, turns: [{ id: 'turn-one', status: 'inProgress', items: [] }] },
    reply: request => request.method === 'initialize' ? {} : request.method === 'thread/loaded/list' ? { data: ['rpc-fixture'], nextCursor: null } : request.method === 'thread/read' ? { thread: fixture.history } : { data: [], nextCursor: null }
  };
  function send(socket, value) {
    const body = Buffer.from(JSON.stringify(value));
    if (body.length > 65535) throw new Error('Synthetic frame limit');
    const header = body.length < 126 ? Buffer.from([0x81, body.length]) : Buffer.from([0x81, 126, body.length >> 8, body.length & 255]);
    socket.write(Buffer.concat([header, body]));
  }
  const server = createServer();
  server.on('upgrade', (request, socket) => {
    const key = request.headers['sec-websocket-key'];
    if (typeof key !== 'string') return socket.destroy();
    const accept = createHash('sha1').update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
    socket.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ' + accept + '\r\n\r\n');
    sockets.add(socket); latest = socket; let buffer = Buffer.alloc(0);
    socket.on('close', () => sockets.delete(socket));
    socket.on('error', () => {});
    socket.on('data', chunk => {
      buffer = Buffer.concat([buffer, chunk]);
      for (;;) {
        if (buffer.length < 2) return;
        const opcode = buffer[0] & 15, masked = !!(buffer[1] & 128); let length = buffer[1] & 127, offset = 2;
        if (length === 126) { if (buffer.length < 4) return; length = buffer.readUInt16BE(2); offset = 4; }
        else if (length === 127) { if (buffer.length < 10) return; const size = buffer.readBigUInt64BE(2); if (size > 1024n * 1024n) return socket.destroy(); length = Number(size); offset = 10; }
        if (length > 1024 * 1024) return socket.destroy();
        const maskBytes = masked ? 4 : 0; if (buffer.length < offset + maskBytes + length) return;
        const mask = masked ? buffer.subarray(offset, offset + 4) : null; offset += maskBytes;
        const body = Buffer.from(buffer.subarray(offset, offset + length)); buffer = buffer.subarray(offset + length);
        if (mask) for (let i = 0; i < body.length; i++) body[i] ^= mask[i % 4];
        if (opcode === 8) { socket.end(Buffer.from([0x88, 0])); return; }
        if (opcode !== 1) continue;
        let request; try { request = JSON.parse(body.toString('utf8')); } catch { continue; }
        if (request.id === undefined) continue;
        const result = fixture.reply(request);
        if (result !== undefined) send(socket, result.error ? { id: request.id, error: result.error } : { id: request.id, result });
      }
    });
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  fixture.endpoint = 'ws://127.0.0.1:' + server.address().port + '/';
  fixture.send = value => { if (!latest) throw new Error('No synthetic peer'); send(latest, value); };
  fixture.close = () => new Promise(resolve => { for (const socket of sockets) socket.destroy(); server.close(resolve); });
  return fixture;
}
