/** Small host-independent UI library. Content is always inserted as text, never HTML. */
export function h(tag, attributes = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attributes)) {
    if (value === null || value === undefined || value === false) continue;
    if (key.startsWith('on') && typeof value === 'function') node.addEventListener(key.slice(2).toLowerCase(), value);
    else if (key === 'className') node.className = value;
    else if (key === 'value') node.value = value;
    else if (key === 'checked' || key === 'disabled') node[key] = value;
    else node.setAttribute(key === 'testId' ? 'data-testid' : key, String(value));
  }
  for (const child of children.flat(Infinity)) if (child !== undefined && child !== null && child !== false) node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  return node;
}
const paths = {
  overview: 'M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z',
  acceptance: 'm5 12 4 4L20 5 M20 12v8H4V4h10', evidence: 'M4 4h6l2 3h8v13H4z M8 12h8 M8 16h5',
  events: 'm3 12 4-1 3-7 4 16 3-8h4', connection: 'M8 3v5 M16 3v5 M6 8h12v5a6 6 0 0 1-12 0z M12 19v3',
  arrow: 'M5 12h14 m-5-5 5 5-5 5', download: 'M12 3v12 m-5-5 5 5 5-5 M4 16v5h16v-5',
  sun: 'M12 2v2 M12 20v2 M2 12h2 M20 12h2 M5 5l2 2 M17 17l2 2 M5 19l2-2 M17 7l2-2 M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0',
  moon: 'M20 15A9 9 0 0 1 9 4a9 9 0 1 0 11 11', check: 'm5 12 4 4L19 6', lock: 'M5 10h14v11H5z M8 10V6a4 4 0 0 1 8 0v4',
  close: 'm6 6 12 12 M6 18 18 6', git: 'M6 3v12a5 5 0 0 0 10 0V9 M6 8h10 M4 3h4 M14 9h4', play: 'm8 4 12 8-12 8z', refresh: 'M20 7v5h-5 M4 17v-5h5 M5 8a8 8 0 0 1 14-3l1 3 M4 16l1 3a8 8 0 0 0 14-3'
};
export function icon(name, className = '') {
  const node = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  for (const [k, v] of Object.entries({ viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '1.6', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true', class: `icon ${className}` })) node.setAttribute(k, v);
  const p = document.createElementNS(node.namespaceURI, 'path'); p.setAttribute('d', paths[name] || paths.overview); node.append(p); return node;
}
export function button(text, action, opts = {}) { return h('button', { type: 'button', className: 'button ' + (opts.kind || ''), onClick: action, ...opts }, opts.icon ? icon(opts.icon) : null, text); }
export function badge(text, state = 'unknown') { return h('span', { className: `badge ${state}` }, h('span', { className: 'status-dot' }), text); }
export function card(title, subtitle, content, action) { return h('section', { className: 'card' }, h('div', { className: 'card-heading' }, h('div', {}, h('h2', {}, title), subtitle ? h('p', {}, subtitle) : null), action), content); }
export function empty(title, detail, action) { return h('div', { className: 'empty' }, h('span', { className: 'empty-icon' }, icon('events')), h('h3', {}, title), h('p', {}, detail), action); }
export function ring(percent) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); svg.setAttribute('viewBox', '0 0 144 144'); svg.setAttribute('class', 'coverage-ring'); svg.setAttribute('aria-hidden', 'true');
  for (let i = 0; i < 2; i++) { const c = document.createElementNS(svg.namespaceURI, 'circle'); for (const [k, v] of Object.entries({ cx: 72, cy: 72, r: 60, fill: 'none', 'stroke-width': 9, class: i ? 'ring-fill' : 'ring-track' })) c.setAttribute(k, v); if (i) { c.setAttribute('stroke-dasharray', `${Math.max(0, percent || 0) / 100 * 377} 377`); c.setAttribute('transform', 'rotate(-90 72 72)'); } svg.append(c); } return svg;
}
export function showDialog(title, content, footer, closeLabel) {
  const root = document.getElementById('dialog-root'), previous = document.activeElement;
  const dialog = h('dialog', { className: 'dialog', 'aria-labelledby': 'dialog-title' });
  const close = () => dialog.close();
  dialog.append(h('header', { className: 'dialog-header' }, h('h2', { id: 'dialog-title' }, title), button('×', close, { className: 'icon-button', 'aria-label': closeLabel, testId: 'dialog-close' })), h('div', { className: 'dialog-body' }, content), footer ? h('footer', { className: 'dialog-footer' }, footer) : null);
  dialog.addEventListener('close', () => { root.replaceChildren(); previous?.focus(); });
  dialog.addEventListener('click', e => { if (e.target === dialog) { const r = dialog.getBoundingClientRect(); if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) close(); } });
  root.replaceChildren(dialog); dialog.showModal(); return { dialog, close };
}
