const path = require('node:path');
module.exports = async context => {
  if (context.electronPlatformName !== 'win32') return;
  const { flipFuses, FuseVersion, FuseV1Options } = await import('@electron/fuses');
  await flipFuses(path.join(context.appOutDir,'AgentProgressStudio.exe'),{version:FuseVersion.V1,
    [FuseV1Options.RunAsNode]:false,[FuseV1Options.EnableNodeOptionsEnvironmentVariable]:false,
    [FuseV1Options.EnableNodeCliInspectArguments]:false,[FuseV1Options.OnlyLoadAppFromAsar]:true,
    [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]:true,
    [FuseV1Options.GrantFileProtocolExtraPrivileges]:false});
};
