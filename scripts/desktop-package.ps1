param([string]$BuildDirectory='dist',[string]$Destination='dist-release')
$ErrorActionPreference='Stop'
$repo=(Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$build=(Resolve-Path $BuildDirectory).Path
$dest=[IO.Path]::GetFullPath($Destination)
if(Test-Path -LiteralPath $dest){throw 'Release directory must be fresh; do not overwrite an existing candidate.'}
if($dest -eq $build -or $build.StartsWith($dest+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)){throw 'Release directory overlaps build input.'}
$pkg=Get-Content -LiteralPath (Join-Path $repo 'package.json') -Raw | ConvertFrom-Json
$version=$pkg.version
if($version -notmatch '^[0-9]+\.[0-9]+\.[0-9]+-desktop\.[0-9]+$'){throw 'Unexpected release version.'}
$setup=Join-Path $build ('AgentProgressStudio-'+$version+'-Setup.exe')
if(-not(Test-Path -LiteralPath $setup)){throw 'Build installer first.'}
New-Item -ItemType Directory -Path $dest | Out-Null
$portable=Join-Path $dest ('AgentProgressStudio-'+$version+'-Portable')
Copy-Item -LiteralPath (Join-Path $build 'win-unpacked') -Destination $portable -Recurse
New-Item -ItemType File -Path (Join-Path $portable 'Portable.flag') | Out-Null
Copy-Item -LiteralPath $setup -Destination $dest
Copy-Item -LiteralPath (Join-Path $repo 'docs\desktop\USER-GUIDE.md') -Destination (Join-Path $portable 'INSTALL-UNINSTALL.md')
Copy-Item -LiteralPath (Join-Path $repo 'THIRD_PARTY_NOTICES.md') -Destination $portable
$forbidden=@(Get-ChildItem -LiteralPath $portable -Recurse -Force | Where-Object {$_.Name -match '^(?:APS Desktop Data|hook-events|desktop-settings\.json|auth\.json|node_modules|\.aps-data)$' -or $_.Extension -match '^\.(?:log|jsonl|pem|key|pfx|woff2?|ttf|otf)$'})
if($forbidden.Count){throw 'Unexpected user data, credentials or fonts in portable staging.'}
Compress-Archive -LiteralPath $portable -DestinationPath (Join-Path $dest ('AgentProgressStudio-'+$version+'-Portable.zip')) -CompressionLevel Optimal
Get-FileHash -Algorithm SHA256 -LiteralPath (Join-Path $dest ('AgentProgressStudio-'+$version+'-Setup.exe')),(Join-Path $dest ('AgentProgressStudio-'+$version+'-Portable.zip')) | ForEach-Object {$_.Hash.ToLower()+'  '+[IO.Path]::GetFileName($_.Path)} | Set-Content -LiteralPath (Join-Path $dest 'SHA256SUMS.txt') -Encoding utf8
Write-Output ('Packaged '+$version+' in '+$dest)
