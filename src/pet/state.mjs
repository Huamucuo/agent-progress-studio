/** Pet state is a presentation of observed facts, never a completion estimator. */
export const defaultPetPreferences = () => ({enabled:false,character:'aps-dog',size:224,alwaysOnTop:true,positionLocked:false,animations:true,lowPerformance:false,muted:true,hidden:false,bounds:null});
export function normalizePetPreferences(change={},previous=defaultPetPreferences()) {
  if(!change||typeof change!=='object'||Array.isArray(change)||Object.keys(change).some(k=>!Object.hasOwn(defaultPetPreferences(),k)))throw Error('Invalid pet preferences');
  const next={...previous};
  for(const [key,value]of Object.entries(change)){
    if(key==='character'){if(typeof value!=='string'||!/^[a-z][a-z0-9-]{2,63}$/.test(value))throw Error('Invalid pet character');}
    else if(key==='size'){if(!Number.isInteger(value)||value<96||value>384)throw Error('Invalid pet size');}
    else if(key==='bounds'){if(value!==null&&(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).sort().join(',')!=='x,y'||!['x','y'].every(k=>Number.isInteger(value[k])&&Math.abs(value[k])<=100000)))throw Error('Invalid pet position');}
    else if(typeof value!=='boolean')throw Error('Invalid pet preference');
    next[key]=value;
  }
  return next;
}
export function projectPet(snapshot={}) {
  const source=snapshot.source||{},monitor=snapshot.monitor||{};
  const demo=source.mode==='demo';
  const origin=['codex','work-local'].includes(source.origin)?source.origin:'unknown';
  const observable=demo||(origin!=='unknown'&&(source.mode==='work-hooks'?(snapshot.access?.dependencies||[]).some(d=>d.capability==='observe'):source.contentAccess?.readable===true));
  const evidence=demo||(origin!=='unknown'&&(snapshot.access?.dependencies||[]).some(d=>d.capability==='evidence'));
  let animation='idle',factStatus='unknown';
  if(source.connected&&observable){
    factStatus=monitor.status||'waiting_event';
    if(monitor.fresh||demo){
      if(['prompt_received','turn_running','tool_running'].includes(factStatus))animation='working';
      if(['waiting_approval','waiting_user'].includes(factStatus))animation='waiting';
      if(['tool_failed','turn_failed'].includes(factStatus))animation='failed';
    }
  }else if(!source.connected)factStatus='source_unavailable';
  return {version:snapshot.version,observedAt:snapshot.observedAt||null,petState:{animation,factStatus,origin,connected:source.connected===true,demo,at:observable?monitor.at||null:null,fresh:observable&&monitor.fresh===true},progress:{overallPercent:null,planCompleted:observable?snapshot.progress?.plan?.completed||0:0,planTotal:observable?snapshot.progress?.plan?.total||0:0,verifiedCount:evidence?snapshot.acceptance?.met||0:0}};
}
