param([string]$NodePath='D:\tool\Node.js\node.exe',[string]$TestDirectory='installed-desktop-test3',[string]$SetupPath,[string]$EvidenceDirectory)
$ErrorActionPreference='Stop'
$out=(Resolve-Path '..\..\outputs').Path
if(-not $SetupPath){$version=(Get-Content -LiteralPath 'package.json' -Raw | ConvertFrom-Json).version;$SetupPath=Join-Path $out ('desktop-floating-build\AgentProgressStudio-'+$version+'-Setup.exe')}
$setup=(Resolve-Path -LiteralPath $SetupPath).Path
if(-not $EvidenceDirectory){$EvidenceDirectory=Join-Path $out 'floating-evidence'}
if(-not(Test-Path -LiteralPath $EvidenceDirectory)){New-Item -ItemType Directory -Path $EvidenceDirectory | Out-Null}
$env:APS_EVIDENCE_DIR=$EvidenceDirectory
if($TestDirectory -notmatch '^installed-desktop-test[0-9]+$'){throw 'Invalid fixed test directory.'}
$target=Join-Path $out $TestDirectory
$uninstallRegistry='HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall'
$prior=@();if(Test-Path -LiteralPath $uninstallRegistry){$prior=@(Get-ChildItem -LiteralPath $uninstallRegistry | Get-ItemProperty | Where-Object {$_.DisplayName -like '*Agent Progress Studio*'})}
if($prior.Count -ne 0){throw 'Existing product installation found; do not overwrite it for acceptance.'}
$runRegistry='HKCU:\Software\Microsoft\Windows\CurrentVersion\Run'
$startup=Get-ItemProperty -LiteralPath $runRegistry -Name 'Agent Progress Studio Desktop' -ErrorAction SilentlyContinue
if($startup){throw 'Existing login registration found; do not replace another copy.'}
if(Test-Path -LiteralPath $target){throw 'Test installation path must be new.'}
# Fixed absolute child of this task's outputs; installer and uninstaller touch
# their own application only. No computed deletion via another shell.
if(-not $target.StartsWith($out+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)){throw 'Installation target escaped outputs.'}
$install=Start-Process -FilePath $setup -ArgumentList @('/S',('/D='+$target)) -WindowStyle Hidden -Wait -PassThru
if($install.ExitCode -ne 0){throw ('Install exit '+$install.ExitCode)}
$exe=Join-Path $target 'AgentProgressStudio.exe'
if(-not(Test-Path -LiteralPath $exe)){throw 'Installed executable missing.'}
$registered=@(Get-ChildItem -LiteralPath $uninstallRegistry | Get-ItemProperty | Where-Object {$_.DisplayName -like '*Agent Progress Studio*'})
if($registered.Count -ne 1){throw 'Unexpected uninstall registration.'}
& $NodePath tests/desktop-packaged.mjs $exe installed
$testCode=$LASTEXITCODE
$uninstaller=Join-Path $target 'Uninstall AgentProgressStudio.exe'
if(-not(Test-Path -LiteralPath $uninstaller)){throw 'Owned uninstaller missing.'}
$remove=Start-Process -FilePath $uninstaller -ArgumentList '/S' -WindowStyle Hidden -Wait -PassThru
for($i=0;$i -lt 100 -and (Test-Path -LiteralPath $exe);$i++){Start-Sleep -Milliseconds 100}
if(Test-Path -LiteralPath $exe){throw 'Uninstaller left installed executable.'}
$remaining=@(Get-ChildItem -LiteralPath $uninstallRegistry | Get-ItemProperty | Where-Object {$_.DisplayName -like '*Agent Progress Studio*'})
if($remaining.Count -ne 0){throw 'Uninstall registration remains.'}
if(Get-ItemProperty -LiteralPath $runRegistry -Name 'Agent Progress Studio Desktop' -ErrorAction SilentlyContinue){throw 'Owned startup registration remains.'}
$record=@{silentInstallExit=$install.ExitCode;silentUninstallExit=$remove.ExitCode;installedExecutableRemoved=$true;uninstallRegistrationRemoved=$true;startupRegistrationRemoved=$true;installedRuntimeTestsExit=$testCode;interactiveWizard='PENDING_MANUAL';cleanVM='PENDING_MANUAL'}
$record | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $EvidenceDirectory 'installer-results.json') -Encoding utf8
if($testCode -eq 0){Write-Output 'PASS fresh per-user silent install, installed runtime, silent uninstall and exact startup registration cleanup'}else{Write-Output 'FAIL installed runtime tests; owned installation was cleaned up'}
exit $testCode
