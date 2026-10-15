const { app,protocol } = require('electron');
const path = require('node:path');
const args = process.argv.slice(1);
if (args.includes('--aps-hook')) {
  const index = args.indexOf('--aps-hook-spool');
  if (index < 0 || !args[index + 1] || !path.isAbsolute(args[index + 1])) app.exit(0);
  else import('./recorder.mjs').then(m => m.runRecorder(args[index + 1])).catch(() => process.stdout.write('{}')).finally(() => app.exit(0));
} else {
  // This dashboard needs no 3D surface; reduce driver/GPU allocations.
  // The window/notification regressions cover software-rendered transparency.
  app.disableHardwareAcceleration();
  // Electron requires scheme registration before ready. Do this synchronously
  // before any async module/filesystem initialization (including portable I/O).
  protocol.registerSchemesAsPrivileged([{scheme:'aps',privileges:{standard:true,secure:true,supportFetchAPI:true,corsEnabled:true}}]);
  import('./window.mjs').catch(async () => {
    try { const { Diagnostics } = await import('./diagnostics.mjs'); await new Diagnostics(path.join(app.getPath('userData'),'logs')).record('MAIN_FAILED'); } catch {}
    require('electron').dialog.showErrorBox('Agent Progress Studio · 启动失败 / Startup failed','监控没有启动。请重新打开应用；本地日志仅包含诊断代码。\nMonitoring did not start. Reopen the app and check local diagnostics.');
    app.exit(1);
  });
}
