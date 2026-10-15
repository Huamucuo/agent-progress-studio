/** Only this app's Chromium network/code cache. Never deletes session stores. */
export class CacheMaintenance{
 constructor({session,settings,clock=()=>Date.now(),notify=()=>{}}){Object.assign(this,{session,settings,clock,notify});this.startedAt=clock();this.busy=false;}
 status(){return {enabled:true,lastClean:null,...this.settings.value.maintenance};}
 async tick(){const v=this.status();if(!v.enabled||this.clock()-(v.lastClean??this.startedAt)<86400000)return false;return this.clear();}
 async clear(){if(this.busy)return false;this.busy=true;let bytesBefore=null,result='CLEARED';try{
  try{bytesBefore=await this.session.getCacheSize();}catch{}
  try{await this.session.clearCache();}catch{result='FAILED';}
  try{await this.session.clearCodeCaches({urls:[]});}catch{if(result!=='FAILED')result='PARTIAL';}
  await this.settings.save({maintenance:{...this.status(),lastClean:this.clock(),bytesBefore,lastResult:result}});this.notify(result);return true;
 }finally{this.busy=false;}}
}
