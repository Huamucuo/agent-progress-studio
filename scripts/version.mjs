import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { VERSION } from '../src/version.mjs';
const root = fileURLToPath(new URL('../', import.meta.url)), write = process.argv.includes('--write');
const desktop=VERSION.match(/^(\d+\.\d+\.\d+)-desktop\.(\d+)$/);
if(desktop){const file=path.join(root,'package.json'),pkg=JSON.parse(await readFile(file,'utf8')),native=desktop[1]+'.'+desktop[2];if(write){pkg.build.buildVersion=native;pkg.build.buildNumber=desktop[2];await writeFile(file,JSON.stringify(pkg,null,2)+'\n');}else if(pkg.build.buildVersion!==native||pkg.build.buildNumber!==desktop[2])throw Error('Native version is stale; run version:sync');}
const mark = `<!-- APS_VERSION -->${VERSION}<!-- /APS_VERSION -->`;
for (const name of ['README.md', 'README.zh-CN.md']) {
  const file = path.join(root, name), text = await readFile(file, 'utf8');
  if (write) await writeFile(file, text.replace(/<!-- APS_VERSION -->.*?<!-- \/APS_VERSION -->/, mark));
  else if (!text.includes(mark)) throw new Error(`${name} version is stale; run npm run version:sync`);
}
const file = path.join(root, 'package-lock.json'), lock = JSON.parse(await readFile(file, 'utf8'));
if (write) { lock.version = VERSION; lock.packages[''].version = VERSION; await writeFile(file, JSON.stringify(lock, null, 2) + '\n'); }
else if (lock.version !== VERSION || lock.packages[''].version !== VERSION) throw new Error('Lockfile version is stale');
console.log(`Agent Progress Studio ${VERSION}: version ${write ? 'synchronized' : 'checked'}`);
