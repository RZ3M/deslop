# Tiny static file server for the test harness (tests/harness.html needs http://, not file://).
#   pwsh scripts/serve.ps1 [-Port 8787]
# Then open http://localhost:8787/tests/harness.html

param([int]$Port = 8787)

$root = Split-Path -Parent $PSScriptRoot
$types = @{
  '.html' = 'text/html; charset=utf-8'; '.js' = 'text/javascript; charset=utf-8'
  '.json' = 'application/json'; '.css' = 'text/css'; '.png' = 'image/png'; '.svg' = 'image/svg+xml'
}

$listener = [System.Net.HttpListener]::new()
$listener.Prefixes.Add("http://localhost:$Port/")
$listener.Start()
Write-Output "Serving $root at http://localhost:$Port/"

while ($listener.IsListening) {
  $ctx = $listener.GetContext()
  $rel = [Uri]::UnescapeDataString($ctx.Request.Url.AbsolutePath.TrimStart('/'))
  if ($rel -eq '') { $rel = 'tests/harness.html' }
  # The LinkedIn end-to-end test fetches /in/<slug>/ like the real site; serve fixtures for it.
  if ($rel -match '^in/([\w-]+)/?$') { $rel = "tests/fixtures/profile-$($Matches[1]).html" }
  $path = [IO.Path]::GetFullPath((Join-Path $root $rel))
  $res = $ctx.Response
  if ($path.StartsWith($root) -and (Test-Path $path -PathType Leaf)) {
    $bytes = [IO.File]::ReadAllBytes($path)
    $ext = [IO.Path]::GetExtension($path).ToLower()
    # ?shim injects a fake chrome.* API so extension pages can be previewed in a normal tab.
    if ($ext -eq '.html' -and $ctx.Request.Url.Query -match 'shim') {
      $html = [Text.Encoding]::UTF8.GetString($bytes) -replace '<head>', '<head><script src="/tests/chrome-shim.js"></script>'
      $bytes = [Text.Encoding]::UTF8.GetBytes($html)
    }
    $res.ContentType = $types[$ext] ?? 'application/octet-stream'
    $res.Headers.Add('Cache-Control', 'no-store')
    $res.OutputStream.Write($bytes, 0, $bytes.Length)
  } else {
    $res.StatusCode = 404
  }
  $res.Close()
}
