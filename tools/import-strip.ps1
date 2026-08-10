<#
.SYNOPSIS
  Slice a sheet of animation frames into Phaser texture atlases.

.DESCRIPTION
  Image models will happily draw a walk cycle as a row of figures, and drawing them together
  is the only reason they stay on-model. What they will not do is line them up: the figures
  sit at different heights, drift sideways, and come out slightly different sizes.

  This finds each frame, trims it to its drawing, scales everything by ONE shared factor so
  the character does not pulse between frames or between views, and bottom-aligns them so the
  feet stay planted. Output is a PNG strip plus an atlas JSON per row, so no frame sizes end
  up hard-coded in the game.

  NOTE: keep this file pure ASCII. Windows PowerShell 5.1 reads .ps1 as ANSI unless the file
  has a BOM, so a stray em-dash turns into mojibake and breaks parsing.

.EXAMPLE
  # One row of four frames:
  .\tools\import-strip.ps1 -Source .\armed_side.png -Key brute-side -Frames 4

.EXAMPLE
  # A 3x4 sheet, one row per view, written as peasant-face/-side/-back:
  .\tools\import-strip.ps1 -Source .\peasant.png -Key peasant -Frames 4 -RowNames face,side,back
#>
param(
  [Parameter(Mandatory = $true)][string]$Source,
  [Parameter(Mandatory = $true)][string]$Key,
  # Height of the tallest frame in the output. Author at 2x on-screen height.
  [int]$Height = 140,
  # Frames per row. Leave 0 to detect them by looking for columns of empty pixels; set it
  # explicitly whenever figures overlap horizontally, since a shield poking into the next
  # figure's columns leaves no gap to find and two frames get read as one.
  [int]$Frames = 0,
  # Comma-separated name per row of the sheet, e.g. "face,side,back". Output becomes
  # "<Key>-<name>.png". Omit for a single row. Taken as a string and split here rather than
  # declared [string[]]: invoked through -File, PowerShell hands every argument over as one
  # string, so a list arrives as the single element "face,side,back".
  [string]$RowNames = "",
  # A run of empty columns at least this wide separates frames, when detecting.
  [int]$MinGap = 10,
  # Ignore pixels fainter than this. AI renders carry a soft glow that would otherwise merge
  # neighbouring figures into one blob.
  [int]$AlphaFloor = 40,
  [string]$OutDir
)

Add-Type -AssemblyName System.Drawing

# Find complete connected drawings inside one row. Dividing a row into equal-width slices
# clips long props (pitchforks, spears, shields) that cross the nominal cell boundary and can
# even leave the clipped pixels inside the neighbouring frame. Connected components keep the
# whole drawing together regardless of its horizontal reach.
if (-not ("AlphaComponents" -as [type])) {
  Add-Type -ReferencedAssemblies System.Drawing -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Drawing;

public static class AlphaComponents
{
    public static Rectangle[] Find(byte[] pixels, int width, int height, int stride,
                                   int y0, int y1, byte alphaFloor)
    {
        int bandHeight = y1 - y0 + 1;
        var seen = new bool[width * bandHeight];
        var queue = new int[width * bandHeight];
        var found = new List<Tuple<Rectangle, int>>();

        for (int y = y0; y <= y1; y++)
        for (int x = 0; x < width; x++)
        {
            int local = (y - y0) * width + x;
            if (seen[local] || pixels[y * stride + x * 4 + 3] <= alphaFloor) continue;

            int head = 0, tail = 0, count = 0;
            int minX = x, maxX = x, minY = y, maxY = y;
            seen[local] = true;
            queue[tail++] = local;

            while (head < tail)
            {
                int p = queue[head++];
                int px = p % width;
                int py = p / width + y0;
                count++;
                if (px < minX) minX = px; if (px > maxX) maxX = px;
                if (py < minY) minY = py; if (py > maxY) maxY = py;

                if (px > 0) Visit(px - 1, py, y0, width, stride, alphaFloor, pixels, seen, queue, ref tail);
                if (px + 1 < width) Visit(px + 1, py, y0, width, stride, alphaFloor, pixels, seen, queue, ref tail);
                if (py > y0) Visit(px, py - 1, y0, width, stride, alphaFloor, pixels, seen, queue, ref tail);
                if (py < y1) Visit(px, py + 1, y0, width, stride, alphaFloor, pixels, seen, queue, ref tail);
            }

            found.Add(Tuple.Create(new Rectangle(minX, minY, maxX - minX + 1, maxY - minY + 1), count));
        }

        found.Sort((a, b) => b.Item2.CompareTo(a.Item2));
        var boxes = new Rectangle[found.Count];
        for (int i = 0; i < found.Count; i++) boxes[i] = found[i].Item1;
        return boxes;
    }

    private static void Visit(int x, int y, int y0, int width, int stride, byte alphaFloor,
                              byte[] pixels, bool[] seen, int[] queue, ref int tail)
    {
        int local = (y - y0) * width + x;
        if (seen[local]) return;
        seen[local] = true;
        if (pixels[y * stride + x * 4 + 3] > alphaFloor) queue[tail++] = local;
    }
}
'@
}

if (-not $OutDir) {
  $root = $PSScriptRoot
  if (-not $root) { $root = Split-Path -Parent $MyInvocation.MyCommand.Path }
  if (-not $root) { throw "Cannot locate the script directory; pass -OutDir explicitly." }
  $OutDir = Join-Path $root "..\public\sprites"
}
if (-not (Test-Path $Source)) { throw "Source not found: $Source" }
if (-not (Test-Path $OutDir)) { New-Item -ItemType Directory -Path $OutDir -Force | Out-Null }
$OutDir = (Resolve-Path $OutDir).Path

$rowNameList = @()
if ($RowNames.Trim()) {
  $rowNameList = $RowNames.Split(",") | ForEach-Object { $_.Trim() } | Where-Object { $_ }
}
$rowCount = if ($rowNameList.Count -gt 0) { $rowNameList.Count } else { 1 }

$img = [System.Drawing.Bitmap]::FromFile((Resolve-Path $Source))
try {
  $rect = New-Object System.Drawing.Rectangle(0, 0, $img.Width, $img.Height)
  $data = $img.LockBits($rect, [System.Drawing.Imaging.ImageLockMode]::ReadOnly,
                        [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $bytes = New-Object byte[] ($data.Stride * $img.Height)
  [System.Runtime.InteropServices.Marshal]::Copy($data.Scan0, $bytes, 0, $bytes.Length)
  $stride = $data.Stride
  $img.UnlockBits($data)

  # Vertical extent of everything on the sheet, so rows divide the drawing and not the canvas.
  $firstRow = -1; $lastRow = -1
  for ($y = 0; $y -lt $img.Height; $y++) {
    $row = $y * $stride
    for ($x = 0; $x -lt $img.Width; $x++) {
      if ($bytes[$row + $x * 4 + 3] -gt $AlphaFloor) {
        if ($firstRow -lt 0) { $firstRow = $y }
        $lastRow = $y
        break
      }
    }
  }
  if ($firstRow -lt 0) { throw "Image is completely transparent." }

  $bandH = ($lastRow - $firstRow + 1) / $rowCount

  # Pass one: find every frame's box, across all rows, before drawing anything. A single
  # scale factor is derived from the tallest of them so no view ends up larger than another.
  $allBoxes = @()
  for ($r = 0; $r -lt $rowCount; $r++) {
    $y0 = $firstRow + [int][Math]::Floor($r * $bandH)
    $y1 = $firstRow + [int][Math]::Floor(($r + 1) * $bandH) - 1

    $used = New-Object bool[] $img.Width
    for ($y = $y0; $y -le $y1; $y++) {
      $row = $y * $stride
      for ($x = 0; $x -lt $img.Width; $x++) {
        if ($bytes[$row + $x * 4 + 3] -gt $AlphaFloor) { $used[$x] = $true }
      }
    }

    $spans = @()
    $componentBoxes = @()
    if ($Frames -gt 0) {
      $components = [AlphaComponents]::Find($bytes, $img.Width, $img.Height, $stride,
                                             $y0, $y1, [byte]$AlphaFloor)
      if ($components.Count -ge $Frames) {
        # The helper returns largest first. Discard small detached glow/noise, then restore
        # authored left-to-right frame order.
        $componentBoxes = @($components | Select-Object -First $Frames | Sort-Object X)
      } else {
        throw "Row $r contains only $($components.Count) connected drawing(s); expected $Frames. Try a lower -AlphaFloor."
      }
    } else {
      $start = -1; $gap = 0
      for ($x = 0; $x -lt $img.Width; $x++) {
        if ($used[$x]) {
          if ($start -lt 0) { $start = $x }
          $gap = 0
        } elseif ($start -ge 0) {
          $gap++
          if ($gap -ge $MinGap) {
            # Into a local first: an arithmetic expression as an array element straight after
            # the unary comma confuses the 5.1 parser into treating $x as the array.
            $end = $x - $gap
            $spans += ,@($start, $end)
            $start = -1; $gap = 0
          }
        }
      }
      if ($start -ge 0) {
        $end = $img.Width - 1
        $spans += ,@($start, $end)
      }
    }

    $rowBoxes = @()
    if ($componentBoxes.Count -gt 0) {
      foreach ($box in $componentBoxes) {
        $rowBoxes += ,@($box.X, $box.Y, $box.Width, $box.Height)
      }
    } else {
      foreach ($span in $spans) {
        $x0 = $span[0]; $x1 = $span[1]
        $top = $y1 + 1; $bottom = $y0 - 1
        for ($y = $y0; $y -le $y1; $y++) {
          $row = $y * $stride
          for ($x = $x0; $x -le $x1; $x++) {
            if ($bytes[$row + $x * 4 + 3] -gt $AlphaFloor) {
              if ($y -lt $top) { $top = $y }
              if ($y -gt $bottom) { $bottom = $y }
              break
            }
          }
        }
        $bw = $x1 - $x0 + 1
        $bh = $bottom - $top + 1
        $rowBoxes += ,@($x0, $top, $bw, $bh)
      }
    }
    $allBoxes += ,$rowBoxes
  }

  # One scale for the whole sheet. Per-row scaling would make the character change size the
  # moment it turned a corner and switched view.
  $tallest = 0
  foreach ($rowBoxes in $allBoxes) {
    foreach ($b in $rowBoxes) { if ($b[3] -gt $tallest) { $tallest = $b[3] } }
  }
  $scale = $Height / $tallest

  $cellW = 0
  foreach ($rowBoxes in $allBoxes) {
    foreach ($b in $rowBoxes) {
      $w = [int][Math]::Ceiling($b[2] * $scale)
      if ($w -gt $cellW) { $cellW = $w }
    }
  }
  $cellW += 2

  Write-Output ("source   {0}x{1}" -f $img.Width, $img.Height)
  Write-Output ("rows     {0}   cell {1}x{2}" -f $rowCount, $cellW, $Height)

  for ($r = 0; $r -lt $rowCount; $r++) {
    $rowBoxes = $allBoxes[$r]
    $name = if ($rowNameList.Count -gt 0) { "$Key-$($rowNameList[$r])" } else { $Key }

    $out = New-Object System.Drawing.Bitmap(($cellW * $rowBoxes.Count), $Height)
    try {
      $gfx = [System.Drawing.Graphics]::FromImage($out)
      try {
        $gfx.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
        $gfx.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
        $gfx.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
        $attr = New-Object System.Drawing.Imaging.ImageAttributes
        $attr.SetWrapMode([System.Drawing.Drawing2D.WrapMode]::TileFlipXY)

        for ($i = 0; $i -lt $rowBoxes.Count; $i++) {
          $b = $rowBoxes[$i]
          $dw = [int][Math]::Round($b[2] * $scale)
          $dh = [int][Math]::Round($b[3] * $scale)
          # Centred across the cell and sitting on its floor: the feet are the lowest pixel
          # in every pose, so bottom-aligning is what keeps the unit planted while it bobs.
          $dx = $i * $cellW + [int](($cellW - $dw) / 2)
          $dy = $Height - $dh
          $dest = New-Object System.Drawing.Rectangle($dx, $dy, $dw, $dh)
          $gfx.DrawImage($img, $dest, $b[0], $b[1], $b[2], $b[3],
                         [System.Drawing.GraphicsUnit]::Pixel, $attr)
        }
      } finally { $gfx.Dispose() }

      $png = Join-Path $OutDir "$name.png"
      $out.Save($png, [System.Drawing.Imaging.ImageFormat]::Png)

      # Not $frames: PowerShell names are case-insensitive, so it would collide with [int]$Frames.
      $frameJson = @()
      for ($i = 0; $i -lt $rowBoxes.Count; $i++) {
        $fx = $i * $cellW
        $frameJson += ('{{"filename":"walk_{0}","frame":{{"x":{1},"y":0,"w":{2},"h":{3}}},"rotated":false,"trimmed":false,"spriteSourceSize":{{"x":0,"y":0,"w":{2},"h":{3}}},"sourceSize":{{"w":{2},"h":{3}}}}}' -f $i, $fx, $cellW, $Height)
      }
      $sheetW = $cellW * $rowBoxes.Count
      $json = '{"frames":[' + ($frameJson -join ',') +
              ('],"meta":{{"image":"{0}.png","size":{{"w":{1},"h":{2}}},"scale":"1"}}}}' -f $name, $sheetW, $Height)
      [System.IO.File]::WriteAllText((Join-Path $OutDir "$name.json"), $json)

      Write-Output ("  {0,-16} {1} frames -> {2}.png + .json" -f $name, $rowBoxes.Count, $name)
    } finally { $out.Dispose() }
  }
} finally { $img.Dispose() }
