const desktop = window.apsDesktop;
const getMethods = new Map([['/api/bootstrap','bootstrap'],['/api/snapshot','snapshot'],['/api/sessions','sessions'],['/api/export','exportReport']]);
const postMethods = new Map([['/api/source','selectSource'],['/api/session-access','sessionAccess'],['/api/hook-origin','labelHook'],['/api/review','review'],['/api/demo','demo']]);
export const isDesktop = !!desktop;
export async function wireRequest(url, data, token) {
  if (desktop) {
    const parsed = new URL(url,'aps://studio/');
    if (parsed.pathname === '/api/evidence' && !data) return desktop.detail({kind:parsed.searchParams.get('kind'),id:parsed.searchParams.get('id') || ''});
    const method = (data ? postMethods : getMethods).get(parsed.pathname); if (!method) throw Error('Unsupported desktop operation');
    return data ? desktop[method](JSON.parse(JSON.stringify(data))) : desktop[method]();
  }
  const response = await fetch(url,data ? {method:'POST',headers:{'Content-Type':'application/json','X-APS-Token':token},body:JSON.stringify(data)} : {cache:'no-store'});
  const result = await response.json(); if (!response.ok) throw Error(result.error || response.statusText); return result;
}
export function eventStream(url, scope) {
  if (!desktop) return new EventSource(url);
  const listeners = new Map(), stream = {onopen:null,onerror:null,addEventListener:(type,callback) => listeners.set(type,callback),close:() => {closed=true;unsubscribe?.();}};
  let closed=false,unsubscribe;
  queueMicrotask(() => {
    if (closed) return;
    unsubscribe = desktop.observe(scope,frame => {
      if (closed) return;
      if (frame.type === 'open') { stream.onopen?.({type:'open'}); return; }
      if (frame.type === 'invalidate') { stream.onerror?.({type:'error'}); return; }
      const type = frame.type === 'authority' ? 'authority' : 'snapshot';
      listeners.get(type)?.({data:typeof frame.data === 'string' ? frame.data : JSON.stringify(frame.data)});
    });
  });
  return stream;
}
