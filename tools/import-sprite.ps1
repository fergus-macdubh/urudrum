<#
.SYNOPSIS
  Turn a raw AI-generated PNG into a game-ready sprite.

.DESCRIPTION
  Image models render at their own fixed sizes (around 1024x1024, 1024x1536 or 1536x1024)
  and you cannot ask for 140px. So the sprite always arrives enormous and padded with empty
  space. This crops it to the actual drawing, scales it to a sane texture size, and drops it
  in public/sprites/ under the texture key the game expects.

  Uses System.Drawing, which ships with Windows: no install, no dependencies.

  NOTE: keep this file pure ASCII. Windows PowerShell 5.1 reads .ps1 as ANSI unless the file
  has a BOM, so a stray em-dash or curly quote turns into mojibake and breaks parsing.

.EXAMPLE
  .\tools\import-sprite.ps1 -Source "$env:USERPROFILE\Downloads\thing.png" -Key brute

.EXAMPLE
  .\tools\import-sprite.ps1 -Source .\boss.png -Key boss -Height 220
#>
param(
  [Parameter(Mandatory = $true)][string]$Source,
  [Parameter(Mandatory = $true)][string]$Key,
  # Output texture height. Author at 2x the intended on-screen height.
  [int]$Height = 140,
  # Transparent margin left around the drawing, in SOURCE pixels. Default 0, and leave it
  # there: the game works out where a unit's feet are by assuming they are the bottom row of
  # the texture. Padding also does not survive scaling consistently - 6px on a 1536px source
  # shrinks to half a pixel, while 6px on an 80px source stays 6px - so a shared value gives
  # different results per sprite and units end up standing at different heights on the road.
  [int]$Pad = 0,
  [string]$OutDir
)

Add-Type -AssemblyName System.Drawing

# Resolved here rather than as a parameter default: invoked through -File with a relative
# path, PowerShell 5.1 leaves $PSScriptRoot empty during parameter binding, and the default
# collapses to "\..\public\sprites" - which lands the sprite at the root of the drive.
if (-not $OutDir) {
  $root = $PSScriptRoot
  if (-not $root) { $root = Split-Path -Parent $MyInvocation.MyCommand.Path }
  if (-not $root) { throw "Cannot locate the script directory; pass -OutDir explicitly." }
  $OutDir = Join-Path $root "..\public\sprites"
}

if (-not (Test-Path $Source)) { throw "Source not found: $Source" }
if (-not (Test-Path $OutDir)) { New-Item -ItemType Directory -Path $OutDir -Force | Out-Null }
$OutDir = (Resolve-Path $OutDir).Path

$img = [System.Drawing.Bitmap]::FromFile((Resolve-Path $Source))
try {
  # Read the alpha channel in one block. GetPixel over a 1.5-megapixel image is minutes of
  # marshalling; LockBits is instant.
  $rect = New-Object System.Drawing.Rectangle(0, 0, $img.Width, $img.Height)
  $data = $img.LockBits($rect, [System.Drawing.Imaging.ImageLockMode]::ReadOnly,
                        [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $bytes = New-Object byte[] ($data.Stride * $img.Height)
  [System.Runtime.InteropServices.Marshal]::Copy($data.Scan0, $bytes, 0, $bytes.Length)
  $stride = $data.Stride
  $img.UnlockBits($data)

  $minX = $img.Width; $minY = $img.Height; $maxX = -1; $maxY = -1
  for ($y = 0; $y -lt $img.Height; $y++) {
    $row = $y * $stride
    for ($x = 0; $x -lt $img.Width; $x++) {
      if ($bytes[$row + $x * 4 + 3] -gt 16) {
        if ($x -lt $minX) { $minX = $x }
        if ($x -gt $maxX) { $maxX = $x }
        if ($y -lt $minY) { $minY = $y }
        if ($y -gt $maxY) { $maxY = $y }
      }
    }
  }

  if ($maxX -lt 0) {
    throw "Every pixel is transparent. The background was probably flattened, so ask for a transparent background or key out the flat colour first."
  }

  $cx = [Math]::Max(0, $minX - $Pad)
  $cy = [Math]::Max(0, $minY - $Pad)
  $cw = [Math]::Min($img.Width - $cx, ($maxX - $minX + 1) + $Pad * 2)
  $ch = [Math]::Min($img.Height - $cy, ($maxY - $minY + 1) + $Pad * 2)

  $crop = $img.Clone((New-Object System.Drawing.Rectangle($cx, $cy, $cw, $ch)), $img.PixelFormat)
  try {
    $outW = [int][Math]::Round($cw * $Height / $ch)
    $out = New-Object System.Drawing.Bitmap($outW, $Height)
    try {
      $gfx = [System.Drawing.Graphics]::FromImage($out)
      try {
        $gfx.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
        $gfx.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
        $gfx.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
        # TileFlipXY stops the resampler pulling transparent pixels in at the borders, which
        # otherwise leaves a faint bitten-off edge around the sprite.
        $attr = New-Object System.Drawing.Imaging.ImageAttributes
        $attr.SetWrapMode([System.Drawing.Drawing2D.WrapMode]::TileFlipXY)
        $destRect = New-Object System.Drawing.Rectangle(0, 0, $outW, $Height)
        $gfx.DrawImage($crop, $destRect, 0, 0, $cw, $ch,
                       [System.Drawing.GraphicsUnit]::Pixel, $attr)
      } finally { $gfx.Dispose() }

      $dest = Join-Path $OutDir "$Key.png"
      $out.Save($dest, [System.Drawing.Imaging.ImageFormat]::Png)

      $kb = [Math]::Round((Get-Item $dest).Length / 1KB)
      Write-Output ("source  {0}x{1}" -f $img.Width, $img.Height)
      Write-Output ("cropped {0}x{1}" -f $cw, $ch)
      Write-Output ("output  {0}x{1}  ({2} KB)" -f $outW, $Height, $kb)
      Write-Output ("wrote   {0}" -f $dest)
      Write-Output ""
      Write-Output ("Now add to REAL_ART in src/render/GameScene.ts:")
      Write-Output ('  {0}: "sprites/{0}.png",' -f $Key)
    } finally { $out.Dispose() }
  } finally { $crop.Dispose() }
} finally { $img.Dispose() }
