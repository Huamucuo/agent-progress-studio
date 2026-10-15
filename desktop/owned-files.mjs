import { mkdir, lstat, open, rename, unlink } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { canonicalPath, within } from '../src/core/resource-registry.mjs';
const folded=p=>process.platform==='win32'?p.toLowerCase():p;
/** App-owned metadata only. Never used as a session-content permission. */
export async function ownedDirectory(directory) {
  const literal=path.resolve(directory);
  // Validate every existing ancestor before creating anything through it.
  let parent=literal;
  while(true){try{const stat=await lstat(parent);if(!stat.isDirectory()||stat.isSymbolicLink()||await canonicalPath(parent)!==folded(parent))throw Error('Owned directory alias');break;}catch(e){if(e.code!=='ENOENT')throw e;const next=path.dirname(parent);if(next===parent)throw e;parent=next;}}
  await mkdir(literal,{recursive:true});if(await canonicalPath(literal)!==folded(literal))throw Error('Owned directory changed');return literal;
}
async function ownedParent(root,file){await ownedDirectory(root);if(!within(path.resolve(root),path.resolve(file)))throw Error('Owned path escaped');await ownedDirectory(path.dirname(file));}
export async function writeOwnedJSON(root,file,value){
  await ownedParent(root,file);const temp=file+'.'+randomUUID()+'.tmp';let h;
  try{try{const stat=await lstat(file);if(!stat.isFile()||stat.isSymbolicLink()||stat.nlink>1)throw Error('Owned file alias');}catch(e){if(e.code!=='ENOENT')throw e;}
    h=await open(temp,'wx',0o600);await h.writeFile(JSON.stringify(value,null,2));await h.sync();await h.close();h=null;await ownedParent(root,file);await rename(temp,file);
  }finally{await h?.close();await unlink(temp).catch(()=>{});}
}
export async function readOwnedJSON(root,file,max=16384){
  await ownedParent(root,file);const named=await lstat(file);if(!named.isFile()||named.isSymbolicLink()||named.nlink>1||named.size>max)throw Error('Owned metadata denied');
  const h=await open(file,'r');try{const stat=await h.stat();if(stat.dev!==named.dev||stat.ino!==named.ino||stat.nlink>1||!stat.isFile())throw Error('Owned metadata changed');const buffer=Buffer.alloc(max+1),{bytesRead}=await h.read(buffer,0,buffer.length,0);if(bytesRead>max)throw Error('Owned metadata grew');return JSON.parse(buffer.subarray(0,bytesRead).toString());}finally{await h.close();}
}
