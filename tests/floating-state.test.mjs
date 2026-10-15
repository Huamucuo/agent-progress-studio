import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultFloating, restoreFloating, transitionFloating, dockBounds, snapPreview, floatingFrame, pointerNearEdge, floatingOpacity } from '../desktop/window-state.mjs';
const displays=[{id:1,scaleFactor:1.25,workArea:{x:0,y:0,width:1536,height:824}},{id:2,scaleFactor:2,workArea:{x:-1280,y:40,width:1280,height:984}}];
const act=(s,action,extra={})=>transitionFloating(s,{action,...extra},displays);
test('edge visibility follows idle, nearby and expanded states, including return and hide/restore',()=>{
 for(const edge of ['left','right','top','bottom']){let s=act(restoreFloating(defaultFloating(),displays),'show');assert.equal(floatingOpacity(s),1);s=act(s,'dock',{edge});assert.equal(floatingOpacity(s),0);s=act(s,'peek');assert.equal(floatingOpacity(s),.5);s=act(s,'expand');assert.equal(floatingOpacity(s),1);s=act(s,'leave');assert.equal(floatingOpacity(s),0);s=act(s,'peek');s=act(s,'hide');s=act(s,'show');assert.equal(floatingOpacity(s),0);s=act(s,'undock');assert.equal(floatingOpacity(s),1);}
});
test('legacy opacity cannot override the state policy after expansion or collapse',()=>{
 for(const drawerOpacity of [.5,.9,1]){const s=restoreFloating({...defaultFloating(),schema:1,mode:'DOCKED_EXPANDED',edge:'left',drawerOpacity},displays);assert.equal(s.schema,2);assert.equal(s.drawerOpacity,undefined);assert.equal(floatingOpacity(s),1);assert.equal(floatingOpacity(act(s,'collapse')),0);}
 assert.throws(()=>act(defaultFloating(),'drawerOpacity',{value:.5}),/Unsupported/);
});
test('all five modes, hidden recovery and independent locks',()=>{
 let s=restoreFloating(defaultFloating(),displays);assert.equal(s.mode,'HIDDEN');s=act(s,'show');assert.equal(s.mode,'FLOATING');
 s=act(s,'compact');assert.equal(s.mode,'FLOATING_COMPACT');s=act(s,'hide');assert.equal(s.mode,'HIDDEN');s=act(s,'show');assert.equal(s.mode,'FLOATING_COMPACT');
 s=act(s,'expand');s=act(s,'positionLocked',{value:true});s=act(s,'alwaysOnTop',{value:false});assert.equal(s.positionLocked,true);assert.equal(s.alwaysOnTop,false);
 assert.throws(()=>act(s,'dock',{edge:'left'}),/locked/);s=act(s,'positionLocked',{value:false});s=act(s,'dock',{edge:'left'});assert.equal(s.mode,'DOCKED_COLLAPSED');
 s=act(s,'expand');assert.equal(s.mode,'DOCKED_EXPANDED');s=act(s,'expandedPinned',{value:true});assert.equal(act(s,'leave').mode,'DOCKED_EXPANDED');
 s=act(s,'expandedPinned',{value:false});assert.equal(act(s,'leave').mode,'DOCKED_COLLAPSED');s=act(s,'undock');assert.equal(s.mode,'FLOATING');
});
for(const edge of ['left','right','top','bottom'])test(`native bounds ${edge} open inward and honor taskbar work area`,()=>{
 const area=displays[1].workArea,s={...defaultFloating(),displayId:2,edge,anchor:.5};
 const collapsed=dockBounds(s,area,false),expanded=dockBounds(s,area,true);
 for(const b of [collapsed,expanded]){assert.ok(b.x>=area.x&&b.y>=area.y);assert.ok(b.x+b.width<=area.x+area.width&&b.y+b.height<=area.y+area.height);}
 if(edge==='left')assert.equal(expanded.x,area.x);if(edge==='right')assert.equal(expanded.x+expanded.width,area.x+area.width);
 if(edge==='top')assert.equal(expanded.y,area.y);if(edge==='bottom')assert.equal(expanded.y+expanded.height,area.y+area.height);
 assert.ok(collapsed.width<expanded.width||collapsed.height<expanded.height);
});
test('snap preview is pure; disabled snapping never docks and corners are deterministic',()=>{
 const s=restoreFloating(defaultFloating(),displays),before=JSON.stringify(s);
 assert.equal(snapPreview({x:2,y:200,width:380,height:330},displays)?.edge,'left');assert.equal(JSON.stringify(s),before);
 assert.equal(snapPreview({x:500,y:300,width:380,height:330},displays),null);
 const no=act(s,'autoSnap',{value:false});assert.equal(transitionFloating(no,{action:'dragEnd',bounds:{x:1,y:200,width:380,height:330}},displays).mode,'FLOATING');
 assert.equal(snapPreview({x:0,y:0,width:380,height:330},displays).edge,'left');
});
test('drag release docks only on user transition; moving away restores floating size',()=>{
 let s=act(restoreFloating(defaultFloating(),displays),'show');s=act(s,'dragEnd',{bounds:{x:1156,y:200,width:380,height:330}});assert.equal(s.edge,'right');assert.equal(s.mode,'DOCKED_COLLAPSED');
 s=act(s,'dragEnd',{bounds:{x:500,y:300,width:48,height:180}});assert.equal(s.mode,'FLOATING');assert.equal(s.bounds.width,380);
});
test('DIP geometry restores visible bounds after display disconnect and malformed settings',()=>{
 for(const scaleFactor of [1.25,1.5,2]){const ds=[{id:9,scaleFactor,workArea:{x:40,y:0,width:960,height:680}}];
 const s=restoreFloating({...defaultFloating(),mode:'FLOATING',bounds:{x:-6000,y:9000,width:4000,height:4000},displayId:2},ds);
 assert.ok(s.bounds.x>=40&&s.bounds.y>=0);assert.ok(s.bounds.x+s.bounds.width<=1000);assert.ok(s.bounds.y+s.bounds.height<=680);assert.equal(s.displayId,9);
 }
 const s=restoreFloating({mode:'EVIL',bounds:{x:NaN,y:Infinity,width:-1,height:1},edge:'invalid',alwaysOnTop:'yes'},displays);assert.equal(s.mode,'HIDDEN');assert.equal(typeof s.alwaysOnTop,'boolean');
 assert.throws(()=>act(s,'exec'),/Unsupported/);
});
test('move to a selected monitor remains explicit and preserves independent preferences',()=>{
 let s=act(restoreFloating(defaultFloating(),displays),'show');s=act(s,'alwaysOnTop',{value:false});s=act(s,'display',{displayId:2});assert.equal(s.displayId,2);assert.ok(s.bounds.x<0);assert.equal(s.alwaysOnTop,false);
 assert.throws(()=>act(s,'display',{displayId:999}),/display/);
});
test('collapsed edge stays short at 2 by 24 DIP; small APS click opens the full drawer',()=>{for(const edge of ['left','right','top','bottom']){let s=act(restoreFloating(defaultFloating(),displays),'show');s=act(s,'dock',{edge});const thickness=b=>['left','right'].includes(edge)?b.width:b.height,length=b=>['left','right'].includes(edge)?b.height:b.width;assert.ok(thickness(s.bounds)<=2&&length(s.bounds)<=24);s=act(s,'peek');assert.equal(s.mode,'DOCKED_COLLAPSED');assert.ok(thickness(s.bounds)>2&&thickness(s.bounds)<=28&&length(s.bounds)<=64);s=act(s,'unpeek');assert.ok(thickness(s.bounds)<=2);s=act(s,'peek');s=act(s,'expand');assert.equal(s.mode,'DOCKED_EXPANDED');assert.ok(s.bounds.width>300);}});

test('hiding a hovered edge never restores a stale expanded tag',()=>{let s=act(restoreFloating(defaultFloating(),displays),'show');s=act(s,'dock',{edge:'right'});s=act(s,'peek');s=act(s,'hide');assert.equal(s.peek,false);s=act(s,'show');assert.equal(s.peek,false);assert.equal(s.mode,'DOCKED_COLLAPSED');});

test('native backing frames contain the small cue without entering taskbar or another display',()=>{for(const edge of ['left','right','top','bottom']){let s=act(restoreFloating(defaultFloating(),displays),'show');s=act(s,'display',{displayId:2});s=act(s,'dock',{edge});for(const hovered of [false,true]){if(hovered)s=act(s,'peek');const a=displays[1].workArea,f=floatingFrame(s,a),r=s.bounds;assert.ok(f.x>=a.x&&f.y>=a.y&&f.x+f.width<=a.x+a.width&&f.y+f.height<=a.y+a.height);assert.ok(r.x>=f.x&&r.y>=f.y&&r.x+r.width<=f.x+f.width&&r.y+r.height<=f.y+f.height);}}});

test('proximity requires the selected work area; hidden, foreign-screen and malformed points never reveal APS',()=>{const a=displays[0].workArea;let s=act(restoreFloating(defaultFloating(),displays),'show');s=act(s,'dock',{edge:'left'});const y=s.bounds.y+12;assert.equal(pointerNearEdge(s,{x:10,y},a),true);assert.equal(pointerNearEdge(s,{x:100,y},a),false);assert.equal(pointerNearEdge(s,{x:-1,y},a),false);assert.equal(pointerNearEdge(s,{x:10,y:NaN},a),false);s=act(s,'hide');assert.equal(pointerNearEdge(s,{x:10,y},a),false);});
