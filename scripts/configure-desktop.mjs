import fs from 'node:fs/promises';
const pkg = JSON.parse(await fs.readFile('package.json','utf8'));
const desktop=pkg.version.match(/^(\d+\.\d+\.\d+)-desktop\.(\d+)$/);if(!desktop)throw Error('Set the intended desktop version in package.json first');
Object.assign(pkg,{productName:'Agent Progress Studio',main:'desktop/main.cjs',author:'Agent Progress Studio contributors',description:'Private local AI task monitoring for Windows. Desktop Edition.'});
pkg.engines.node='>=22.17.0';
Object.assign(pkg.scripts,{'start':'electron .','demo':'electron . --aps-demo','web:start':'node src/server.mjs','web:demo':'node src/server.mjs --demo','desktop:build':'electron-builder --win nsis --x64 --publish never','desktop:unpacked':'electron-builder --win --x64 --dir --publish never','test:desktop':'node tests/desktop-window.mjs'});
delete pkg.scripts['release:candidate'];
pkg.build={appId:'com.agentprogressstudio.desktop',productName:pkg.productName,buildVersion:desktop[1]+'.'+desktop[2],buildNumber:desktop[2],executableName:'AgentProgressStudio',asar:true,npmRebuild:false,
  directories:{output:'dist',buildResources:'desktop/assets'},
  files:['package.json','desktop/**/*.cjs','desktop/**/*.mjs','desktop/assets/icon.png','desktop/assets/icon.ico','desktop/licenses/*','public/**/*','src/**/*.mjs','src/adapters/contract.d.ts','experiments/work-hooks/plugin/hooks/record-event.js','experiments/work-hooks/plugin/package.json','LICENSE','THIRD_PARTY_NOTICES.md','!**/settings.json','!**/node_modules/**/*','!**/.aps-data/**/*','!**/*.log'],
  afterPack:'desktop/fuses.cjs',win:{target:[{target:'nsis',arch:['x64']}],icon:'desktop/assets/icon.ico',artifactName:'AgentProgressStudio-${version}-Setup.${ext}'},
  nsis:{include:'desktop/installer.nsh',oneClick:false,perMachine:false,allowElevation:false,allowToChangeInstallationDirectory:true,deleteAppDataOnUninstall:false,runAfterFinish:false,createDesktopShortcut:true,createStartMenuShortcut:true,shortcutName:'Agent Progress Studio',uninstallDisplayName:'Agent Progress Studio Desktop',installerIcon:'desktop/assets/icon.ico',uninstallerIcon:'desktop/assets/icon.ico'},publish:null};
await fs.writeFile('package.json',JSON.stringify(pkg,null,2)+'\n');
const lock=JSON.parse(await fs.readFile('package-lock.json','utf8'));lock.version=pkg.version;lock.packages[''].version=pkg.version;lock.packages[''].engines=pkg.engines;await fs.writeFile('package-lock.json',JSON.stringify(lock,null,2)+'\n');
