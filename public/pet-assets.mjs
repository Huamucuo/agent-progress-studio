/** Original AI-assisted cozy pixel atlases. Only fixed local resources are addressable. */
export const PET_ANIMATION_STATES=Object.freeze(['idle','working','waiting','happy','failed','sleeping']);
export const PET_FRAME_COUNT=4;
export const PET_LOGICAL_SIZE=128;
/* APS_ATLAS_HASHES_BEGIN */
const ATLAS_HASHES={"aps-dog":"40e75246dbd8e3d3c8a84563f929cdd74851bab1362e6ef94b9baff1c4b9d1cc","aps-cat":"72a6a500f751302a6660304d810d0fe9a62af6ad871899945b9c70221039876b","aps-capybara":"bc0869d5cca32e7dc245e5a569b1228258625d7e36abc2988c6c1512af31b533","aps-outline-dog":"87749ae80374459f83e4585662eabdeb76ea2e09c73cbb0fcd923ca2c1b62624"};
/* APS_ATLAS_HASHES_END */
export const PET_ATLASES=Object.freeze(Object.fromEntries(Object.entries(ATLAS_HASHES).map(([id,sha256])=>[id,Object.freeze({url:'assets/pets/'+id+'.png',sha256,width:512,height:768,columns:4,rows:6})])));

const timings={idle:[420,200,120,240],working:[180,160,180,160],waiting:[420,300,420,300],happy:[150,140,150,140],failed:[480,320,360,320],sleeping:[520,480,520,480]};
const sheetImages=new Map(),preparedFrames=new Map();
const equipment=value=>Object.fromEntries(Object.entries({hat:'hat',scarf:'scarf',action:'wave',background:'mat',skin:'dog-copper'}).filter(([slot,id])=>value?.[slot]===id));
export function getPetFrame(character,state,frame){
 const id=Object.hasOwn(PET_ATLASES,character)?character:'aps-dog',mode=PET_ANIMATION_STATES.includes(state)?state:'idle',index=Number.isFinite(frame)?((Math.trunc(frame)%4)+4)%4:0;
 return {id,state:mode,frame:index,url:PET_ATLASES[id].url,crop:{x:index*128,y:PET_ANIMATION_STATES.indexOf(mode)*128,width:128,height:128},duration:timings[mode][index]};
}
/** Build-time alpha normalization only; source PNGs are preserved byte-for-byte. */
export function preparePetPixels(input,width,height){
 if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1||width>256||height>256||!(input instanceof Uint8ClampedArray)||input.length!==width*height*4)throw Error('Invalid local pet pixels');
 const pixels=new Uint8ClampedArray(input.length),labels=new Int32Array(width*height),queue=new Int32Array(width*height),groups=[];let label=0;
 for(let start=0;start<labels.length;start++){
  if(labels[start]||input[start*4+3]<128)continue;label++;let head=0,tail=1,minX=width,minY=height,maxX=0,maxY=0,totalX=0;queue[0]=start;labels[start]=label;
  while(head<tail){const p=queue[head++],x=p%width,y=Math.floor(p/width);minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);totalX+=x;
   for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){const nx=x+dx,ny=y+dy;if(nx<0||ny<0||nx>=width||ny>=height)continue;const next=ny*width+nx;if(!labels[next]&&input[next*4+3]>=128){labels[next]=label;queue[tail++]=next;}}
  }groups.push({label,count:tail,minX,minY,maxX,maxY,totalX});
 }
 const main=groups.sort((a,b)=>b.count-a.count)[0];if(!main)return {pixels,bounds:null,centerX:width/2};
 const accepted=new Set(groups.filter(g=>g===main||g.count>=2&&g.minX>=main.minX-2&&g.maxX<=main.maxX+2&&g.minY>=main.minY-2&&g.maxY<=main.maxY+2).map(g=>g.label));
 let x0=width,y0=height,x1=0,y1=0;
 for(let p=0;p<labels.length;p++)if(accepted.has(labels[p])){const i=p*4;pixels[i]=Math.min(255,Math.round(input[i]/8)*8);pixels[i+1]=Math.min(255,Math.round(input[i+1]/8)*8);pixels[i+2]=Math.min(255,Math.round(input[i+2]/8)*8);pixels[i+3]=255;const x=p%width,y=Math.floor(p/width);x0=Math.min(x0,x);y0=Math.min(y0,y);x1=Math.max(x1,x);y1=Math.max(y1,y);}
 return {pixels,bounds:{x:x0,y:y0,width:x1-x0+1,height:y1-y0+1},centerX:main.totalX/main.count};
}
async function atlasImage(id){
 if(sheetImages.has(id))return sheetImages.get(id);const image=new Image(),promise=(async()=>{image.src=new URL(PET_ATLASES[id].url,import.meta.url).href;await image.decode();if(image.naturalWidth!==512||image.naturalHeight!==768)throw Error('Unexpected builtin atlas dimensions');return image;})();
 sheetImages.set(id,promise);while(sheetImages.size>1)sheetImages.delete(sheetImages.keys().next().value);return promise;
}
function rect(c,x,y,w,h,color){c.fillStyle=color;c.fillRect(Math.round(x),Math.round(y),Math.round(w),Math.round(h));}
export function petEquipmentAnchor(pixels){
 if(!(pixels instanceof Uint8ClampedArray)||pixels.length!==128*128*4)throw Error('Invalid builtin equipment pixels');
 let top=128,total=0,mass=0;
 for(let y=0;y<128&&top===128;y++)for(let x=16;x<76;x++)if(pixels[(y*128+x)*4+3]){top=y;break;}
 if(top===128)return null;
 for(let y=top;y<Math.min(top+20,128);y++)for(let x=8;x<82;x++)if(pixels[(y*128+x)*4+3]){mass+=x;total++;}
 return {x:Math.round(mass/Math.max(1,total)),top};
}
function extras(c,f,items,before=false,anchor=null){
 if(before){if(items.background==='mat'){for(let y=0;y<10;y++){const edge=Math.abs(5-y)*3;rect(c,18+edge,111+y,92-2*edge,1,y%2?'#779c92':'#91b7a2');}rect(c,31,119,66,1,'#425e5b');}return;}
 if(!anchor||f.state==='sleeping')return;const x=anchor.x,y=anchor.top+5,neckY=anchor.top+(f.id==='aps-capybara'?43:42),neckX=x+7;
 if(items.scarf==='scarf'){rect(c,neckX-12,neckY,25,4,'#476f68');rect(c,neckX-11,neckY,22,2,'#87bbae');rect(c,neckX+6,neckY+3,5,12,'#568a7d');rect(c,neckX+7,neckY+5,2,9,'#a5ccc0');rect(c,neckX+5,neckY+14,7,2,'#d2ddbf');}
 if(items.hat==='hat'){rect(c,x-16,y-3,33,4,'#304755');rect(c,x-12,y-11,25,8,'#587688');rect(c,x-9,y-15,19,4,'#6d8b9a');rect(c,x-10,y-6,21,2,'#c4aa69');rect(c,x-8,y-14,7,1,'#96b3ba');}
}
function tintCopper(data,id,items){if(id==='aps-dog'&&items.skin==='dog-copper')for(let i=0;i<data.length;i+=4)if(data[i+3]&&data[i]>data[i+1]+14&&data[i+1]>data[i+2]+8){data[i]=Math.min(255,data[i]+8);data[i+1]=Math.round(data[i+1]*.84);data[i+2]=Math.round(data[i+2]*.72);}}
/** Development asset compiler only; normal animation uses the compact ready-to-draw atlas. */
export function drawOriginalPetFrame(canvas,image,character,state,frame){
 const f=getPetFrame(character,state,frame);if(image.naturalWidth!==1024||image.naturalHeight!==1536)throw Error('Unexpected original atlas');
 const raw=document.createElement('canvas');raw.width=raw.height=128;const c=raw.getContext('2d',{willReadFrequently:true});c.imageSmoothingEnabled=false;c.drawImage(image,f.frame*256,PET_ANIMATION_STATES.indexOf(f.state)*256,256,256,0,0,128,128);
 const result=preparePetPixels(c.getImageData(0,0,128,128).data,128,128);if(!result.bounds)throw Error('Empty original pet frame');c.putImageData(new ImageData(result.pixels,128,128),0,0);
 const out=canvas.getContext('2d');out.imageSmoothingEnabled=false;out.clearRect(0,0,canvas.width,canvas.height);const b=result.bounds,scale=.82;
 out.drawImage(raw,b.x,b.y,b.width,b.height,Math.round(64+(b.x-result.centerX)*scale),116-Math.round(b.height*scale),Math.round(b.width*scale),Math.round(b.height*scale));return f;
}
/** No per-frame decode/segmentation: crisp fixed logical pixels, stable anchors and true alpha. */
export async function drawBuiltinPet(canvas,character,state,frame,equipped={}){
 const f=getPetFrame(character,state,frame),items=equipment(equipped),key=JSON.stringify([f.id,f.state,f.frame,items]);let art=preparedFrames.get(key);
 if(!art){const image=await atlasImage(f.id),body=document.createElement('canvas');body.width=body.height=128;const c=body.getContext('2d',{willReadFrequently:true});c.imageSmoothingEnabled=false;c.drawImage(image,f.crop.x,f.crop.y,128,128,0,0,128,128);
  const rgba=c.getImageData(0,0,128,128),anchor=petEquipmentAnchor(rgba.data);if(items.skin==='dog-copper'){tintCopper(rgba.data,f.id,items);c.putImageData(rgba,0,0);}
  art=document.createElement('canvas');art.width=art.height=128;const out=art.getContext('2d');out.imageSmoothingEnabled=false;extras(out,f,items,true);out.drawImage(body,0,0);extras(out,f,items,false,anchor);
  preparedFrames.set(key,art);while(preparedFrames.size>12)preparedFrames.delete(preparedFrames.keys().next().value);
 }
 const c=canvas.getContext('2d');c.imageSmoothingEnabled=false;c.clearRect(0,0,canvas.width,canvas.height);c.drawImage(art,0,0,canvas.width,canvas.height);return f;
}
export function clearPetArtCache(){sheetImages.clear();preparedFrames.clear();}
