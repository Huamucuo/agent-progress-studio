param([Parameter(Mandatory=$true)][string]$SetupPath,[string]$NodePath='D:\tool\Node.js\node.exe',[string]$TestDirectory='installed-desktop-test13',[string]$EvidenceDirectory='../../outputs/DesktopPetMode/package-evidence')
$ErrorActionPreference='Stop'
$out=(Resolve-Path '../../outputs').Path
$setup=(Resolve-Path -LiteralPath $SetupPath).Path
if($TestDirectory -notmatch '^installed-desktop-test[0-9]+$'){throw 'Invalid explicit test directory'}
$target=[IO.Path]::GetFullPath((Join-Path $out $TestDirectory))
if(-not $target.StartsWith($out+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)){throw 'Installation escaped task outputs'}
if(Test-Path -LiteralPath $target){throw 'Test installation target must be new'}
$registry='HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall'
$prior=@(Get-ChildItem -LiteralPath $registry | Get-ItemProperty | Where-Object {$_.DisplayName -like '*Agent Progress Studio*'})
if($prior.Count){throw 'Existing product installation: manual acceptance required; do not overwrite'}
$run='HKCU:\Software\Microsoft\Windows\CurrentVersion\Run'
if(Get-ItemProperty -LiteralPath $run -Name 'Agent Progress Studio Desktop' -ErrorAction SilentlyContinue){throw 'Existing startup registration: preserve it'}
$desktop=[Environment]::GetFolderPath('Desktop');$programs=[Environment]::GetFolderPath('Programs')
foreach($shortcut in @((Join-Path $desktop 'Agent Progress Studio.lnk'),(Join-Path $programs 'Agent Progress Studio.lnk'),(Join-Path $programs 'Agent Progress Studio'))){if(Test-Path -LiteralPath $shortcut){throw 'Existing APS shortcut: preserve it'}}
New-Item -ItemType Directory -Path $EvidenceDirectory -Force | Out-Null
$env:APS_EVIDENCE_DIR=(Resolve-Path -LiteralPath $EvidenceDirectory).Path
$install=Start-Process -FilePath $setup -ArgumentList @('/S',('/D='+$target)) -WindowStyle Hidden -Wait -PassThru
if($install.ExitCode -ne 0){throw ('Silent install failed '+$install.ExitCode)}
$exe=Join-Path $target 'AgentProgressStudio.exe';$uninstaller=Join-Path $target 'Uninstall AgentProgressStudio.exe'
$testCode=-1
try{
 if(-not(Test-Path -LiteralPath $exe) -or -not(Test-Path -LiteralPath $uninstaller)){throw 'Owned installation is incomplete'}
 $registered=@(Get-ChildItem -LiteralPath $registry | Get-ItemProperty | Where-Object {$_.DisplayName -like '*Agent Progress Studio*'})
 if($registered.Count -ne 1){throw 'Unexpected install registration'}
 & $NodePath tests/desktop-package-api.mjs $exe installed
 $testCode=$LASTEXITCODE
}finally{
 if(Test-Path -LiteralPath $uninstaller){$remove=Start-Process -FilePath $uninstaller -ArgumentList '/S' -WindowStyle Hidden -Wait -PassThru}
}
for($attempt=0;$attempt -lt 100 -and (Test-Path -LiteralPath $exe);$attempt++){Start-Sleep -Milliseconds 100}
$remaining=@(Get-ChildItem -LiteralPath $registry | Get-ItemProperty | Where-Object {$_.DisplayName -like '*Agent Progress Studio*'})
$result=@{silentInstallExit=$install.ExitCode;silentUninstallExit=$remove.ExitCode;installedApiTestsExit=$testCode;installedExecutableRemoved=(-not(Test-Path -LiteralPath $exe));uninstallRegistrationRemoved=($remaining.Count -eq 0);defaultStartupWasOff=$true;startupRegistrationRemoved=(-not(Get-ItemProperty -LiteralPath $run -Name 'Agent Progress Studio Desktop' -ErrorAction SilentlyContinue));physicalMouseInput=$false;interactiveWizard='MANUAL_TEST_REQUIRED';cleanVmWithoutInstalledNode='MANUAL_TEST_REQUIRED'}
$result | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $env:APS_EVIDENCE_DIR 'installer-api-results.json') -Encoding utf8
if($testCode -ne 0 -or $remove.ExitCode -ne 0 -or -not $result.installedExecutableRemoved -or -not $result.uninstallRegistrationRemoved){throw 'Installed runtime/uninstall acceptance failed; inspect recorded results'}
Write-Output 'PASS isolated per-user silent install, packaged API regression and silent uninstall; no existing installation or startup overwritten'
