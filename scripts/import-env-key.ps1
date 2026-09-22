# Copies OPENROUTER_API_KEY from a .env file into config.local.json (gitignored).
# When the unpacked extension starts without a saved key, it imports this file once,
# so you don't have to paste the key into the options page. The test harness uses it too.
#
#   pwsh scripts/import-env-key.ps1            # looks for .env here, then in the parent folder
#   pwsh scripts/import-env-key.ps1 path\.env

param([string]$EnvFile)

$root = Split-Path -Parent $PSScriptRoot
$candidates = @($EnvFile, (Join-Path $root '.env'), (Join-Path (Split-Path -Parent $root) '.env')) | Where-Object { $_ }
$envPath = $candidates | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $envPath) { Write-Error 'No .env file found.'; exit 1 }

$line = Get-Content $envPath | Where-Object { $_ -match '^\s*OPENROUTER_API_KEY\s*=' } | Select-Object -First 1
if (-not $line) { Write-Error "OPENROUTER_API_KEY not found in $envPath"; exit 1 }
$key = ($line -split '=', 2)[1].Trim().Trim('"').Trim("'")

$out = Join-Path $root 'config.local.json'
@{ openrouterApiKey = $key } | ConvertTo-Json | Set-Content -Path $out -Encoding utf8
Write-Output "Wrote $out (gitignored)."
