/** Bounded JSON structure scanner. Payload strings are skipped, not materialized.
 * Only routing scalars are decoded before a scope-bound pending/channel is validated.
 */
export function scanEnvelope(text) {
  if (typeof text !== 'string' || text.length > 8 * 1024 * 1024) throw new Error('RPC frame limit');
  let i = 0, nodes = 0;
  const ws = () => { while (/[\t\n\r ]/.test(text[i] || '\0')) i++; };
  function string(decode = false) {
    if (text[i++] !== '"') throw new Error('Invalid JSON string'); let value = '';
    while (i < text.length) {
      const ch = text[i++]; if (ch === '"') return value;
      if (ch.charCodeAt(0) < 32) throw new Error('Invalid JSON control');
      if (ch !== '\\') { if (decode) value += ch; continue; }
      const escaped = text[i++], simple = { '"': '"', '\\': '\\', '/': '/', b: '\b', f: '\f', n: '\n', r: '\r', t: '\t' };
      if (escaped === 'u') { const hex = text.slice(i, i + 4); if (!/^[a-f0-9]{4}$/i.test(hex)) throw new Error('Invalid JSON escape'); i += 4; if (decode) value += String.fromCharCode(parseInt(hex, 16)); }
      else { if (!Object.hasOwn(simple, escaped)) throw new Error('Invalid JSON escape'); if (decode) value += simple[escaped]; }
      if (decode && value.length > 4096) throw new Error('RPC routing scalar limit');
    }
    throw new Error('Incomplete JSON');
  }
  function value(depth) {
    if (depth > 64 || ++nodes > 400000) throw new Error('RPC structure limit');
    ws(); const start = i, ch = text[i]; let fields, values, type;
    if (ch === '{') {
      type = 'object'; fields = new Map(); i++; ws();
      if (text[i] !== '}') for (;;) {
        ws(); const key = string(true); if (fields.has(key)) throw new Error('Ambiguous duplicate JSON key');
        ws(); if (text[i++] !== ':') throw new Error('Invalid object'); fields.set(key, value(depth + 1)); ws();
        if (text[i] !== ',') break; i++;
      }
      if (text[i++] !== '}') throw new Error('Invalid object');
    } else if (ch === '[') {
      type = 'array'; values = []; i++; ws();
      if (text[i] !== ']') for (;;) { values.push(value(depth + 1)); ws(); if (text[i] !== ',') break; i++; }
      if (text[i++] !== ']') throw new Error('Invalid array');
    } else if (ch === '"') { type = 'string'; string(); }
    else { const token = /^(?:-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?|true|false|null)/.exec(text.slice(i)); if (!token) throw new Error('Invalid JSON value'); i += token[0].length; type = /^-?\d/.test(token[0]) ? 'number' : token[0]; }
    return { start, end: i, type, fields, values };
  }
  const root = value(0); ws(); if (i !== text.length || root.type !== 'object') throw new Error('Invalid RPC envelope');
  const at = (...keys) => keys.reduce((node, key) => node?.fields?.get(key), root);
  const scalar = node => { if (node?.type === 'string') { if (node.end - node.start > 8192) throw new Error('RPC scalar limit'); const saved = i; i = node.start; const result = string(true); i = saved; return result; } return node?.type === 'number' ? text.slice(node.start, node.end) : undefined; };
  const id = at('id'); let requestKey;
  if (id?.type === 'string') requestKey = 's:' + scalar(id);
  else if (id?.type === 'number') { const n = scalar(id); if (!/^-?(?:0|[1-9]\d*)$/.test(n) || BigInt(n) < -9223372036854775808n || BigInt(n) > 9223372036854775807n) throw new Error('Invalid request ID'); requestKey = 'n:' + BigInt(n).toString(); }
  else if (id) throw new Error('Invalid request ID');
  return { at, scalar, requestKey, hasId: !!id, method: scalar(at('method')), parse: node => JSON.parse(text.slice(node.start, node.end)), root };
}
