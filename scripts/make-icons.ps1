# Renders icons/icon{16,32,48,128}.png: a white filter funnel on a green rounded square.
#   pwsh scripts/make-icons.ps1

Add-Type -AssemblyName System.Drawing
$root = Split-Path -Parent $PSScriptRoot
$outDir = Join-Path $root 'icons'
New-Item -ItemType Directory -Force $outDir | Out-Null

function New-RoundedRect([float]$x, [float]$y, [float]$w, [float]$h, [float]$r) {
  $p = [System.Drawing.Drawing2D.GraphicsPath]::new()
  $d = $r * 2
  $p.AddArc($x, $y, $d, $d, 180, 90)
  $p.AddArc($x + $w - $d, $y, $d, $d, 270, 90)
  $p.AddArc($x + $w - $d, $y + $h - $d, $d, $d, 0, 90)
  $p.AddArc($x, $y + $h - $d, $d, $d, 90, 90)
  $p.CloseFigure()
  return $p
}

foreach ($size in 16, 32, 48, 128) {
  $s = [float]$size
  $bmp = [System.Drawing.Bitmap]::new($size, $size)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = 'AntiAlias'
  $g.PixelOffsetMode = 'HighQuality'
  $g.Clear([System.Drawing.Color]::Transparent)

  $bg = New-RoundedRect 0 0 $s $s ($s * 0.22)
  $brush = [System.Drawing.Drawing2D.LinearGradientBrush]::new(
    [System.Drawing.PointF]::new(0, 0), [System.Drawing.PointF]::new($s, $s),
    [System.Drawing.Color]::FromArgb(255, 38, 176, 116), [System.Drawing.Color]::FromArgb(255, 20, 110, 72))
  $g.FillPath($brush, $bg)

  # Funnel: wide rim, tapering body, short spout.
  $pts = @(
    @(0.20, 0.26), @(0.80, 0.26), @(0.57, 0.53), @(0.57, 0.74),
    @(0.43, 0.82), @(0.43, 0.53)
  ) | ForEach-Object { [System.Drawing.PointF]::new($_[0] * $s, $_[1] * $s) }
  $white = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::White)
  $g.FillPolygon($white, [System.Drawing.PointF[]]$pts)

  # Slits in the funnel read as a sieve at larger sizes.
  if ($size -ge 32) {
    $slit = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(255, 29, 140, 92))
    $g.FillRectangle($slit, 0.30 * $s, 0.335 * $s, 0.40 * $s, [Math]::Max(1.5, 0.035 * $s))
    $g.FillRectangle($slit, 0.38 * $s, 0.425 * $s, 0.24 * $s, [Math]::Max(1.5, 0.035 * $s))
  }

  $path = Join-Path $outDir "icon$size.png"
  $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
  $g.Dispose(); $bmp.Dispose()
  Write-Output "Wrote $path"
}
