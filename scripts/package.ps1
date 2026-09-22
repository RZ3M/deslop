# Builds dist/deslop-<version>.zip containing only what the extension needs
# (manifest, icons, src). config.local.json and tests are never included.
#   pwsh scripts/package.ps1

$root = Split-Path -Parent $PSScriptRoot
$version = (Get-Content (Join-Path $root 'manifest.json') -Raw | ConvertFrom-Json).version
$dist = Join-Path $root 'dist'
$stage = Join-Path $dist "deslop-$version"
$zip = Join-Path $dist "deslop-$version.zip"

Remove-Item -Recurse -Force $stage, $zip -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force $stage | Out-Null
Copy-Item (Join-Path $root 'manifest.json') $stage
Copy-Item (Join-Path $root 'icons') $stage -Recurse
Copy-Item (Join-Path $root 'src') $stage -Recurse

$leaked = Get-ChildItem $stage -Recurse -File | Where-Object { $_.Name -match 'config\.local|\.env' }
if ($leaked) { Write-Error "Refusing to package secrets: $($leaked.FullName -join ', ')"; exit 1 }

Compress-Archive -Path (Join-Path $stage '*') -DestinationPath $zip
Remove-Item -Recurse -Force $stage
Write-Output "Wrote $zip"
