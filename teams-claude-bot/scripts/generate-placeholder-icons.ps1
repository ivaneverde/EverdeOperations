# Creates simple Teams manifest icons (replace with brand assets later).
$ErrorActionPreference = "Stop"
$outDir = Join-Path (Join-Path $PSScriptRoot "..") "teams-app-manifest"
New-Item -ItemType Directory -Force -Path $outDir | Out-Null

Add-Type -AssemblyName System.Drawing

function Save-Png($path, $width, $height, $color) {
  $bmp = New-Object System.Drawing.Bitmap $width, $height
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.Clear($color)
  $brush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 230, 240, 235))
  $font = New-Object System.Drawing.Font ("Segoe UI", [Math]::Max(8, $width / 8), [System.Drawing.FontStyle]::Bold)
  $sf = New-Object System.Drawing.StringFormat
  $sf.Alignment = [System.Drawing.StringAlignment]::Center
  $sf.LineAlignment = [System.Drawing.StringAlignment]::Center
  $g.DrawString("C", $font, $brush, (New-Object System.Drawing.RectangleF 0, 0, $width, $height), $sf)
  $g.Dispose()
  $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
  $bmp.Dispose()
  Write-Host "Wrote $path"
}

$everdeGreen = [System.Drawing.Color]::FromArgb(255, 27, 67, 50)
Save-Png (Join-Path $outDir "color.png") 192 192 $everdeGreen
Save-Png (Join-Path $outDir "outline.png") 32 32 $everdeGreen
