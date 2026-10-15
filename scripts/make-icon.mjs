import { chromium } from 'playwright';
import fs from 'node:fs/promises';
const browser=await chromium.launch({headless:true,channel:'msedge'});
try { const page=await browser.newPage({viewport:{width:512,height:512},deviceScaleFactor:1});const svg=await fs.readFile('desktop/assets/icon.svg','utf8');await page.setContent('<style>html,body{margin:0;width:512px;height:512px;background:transparent}</style>'+svg);await page.screenshot({path:'desktop/assets/icon.png',omitBackground:true}); }
finally {await browser.close();}
