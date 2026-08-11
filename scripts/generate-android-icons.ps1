param(
  [string]$Source = (Join-Path $PSScriptRoot '..\assets\android-icon-master.png')
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$projectRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$resourceRoot = Join-Path $projectRoot 'android\app\src\main\res'
$sourcePath = (Resolve-Path -LiteralPath $Source).Path
$background = [Drawing.Color]::FromArgb(255, 3, 25, 48)
$densities = @{
  'ldpi' = @{ launcher = 36; foreground = 81 }
  'mdpi' = @{ launcher = 48; foreground = 108 }
  'hdpi' = @{ launcher = 72; foreground = 162 }
  'xhdpi' = @{ launcher = 96; foreground = 216 }
  'xxhdpi' = @{ launcher = 144; foreground = 324 }
  'xxxhdpi' = @{ launcher = 192; foreground = 432 }
}

function New-IconBitmap([int]$size) {
  return [Drawing.Bitmap]::new($size, $size, [Drawing.Imaging.PixelFormat]::Format32bppArgb)
}

function Set-HighQuality([Drawing.Graphics]$graphics) {
  $graphics.CompositingMode = [Drawing.Drawing2D.CompositingMode]::SourceOver
  $graphics.CompositingQuality = [Drawing.Drawing2D.CompositingQuality]::HighQuality
  $graphics.InterpolationMode = [Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $graphics.SmoothingMode = [Drawing.Drawing2D.SmoothingMode]::HighQuality
  $graphics.PixelOffsetMode = [Drawing.Drawing2D.PixelOffsetMode]::HighQuality
}

function Save-SquareIcon([Drawing.Image]$image, [int]$size, [string]$destination) {
  $canvas = New-IconBitmap $size
  $graphics = [Drawing.Graphics]::FromImage($canvas)
  try {
    Set-HighQuality $graphics
    $graphics.DrawImage($image, 0, 0, $size, $size)
    $canvas.Save($destination, [Drawing.Imaging.ImageFormat]::Png)
  } finally {
    $graphics.Dispose()
    $canvas.Dispose()
  }
}

function Save-RoundIcon([Drawing.Image]$image, [int]$size, [string]$destination) {
  $canvas = New-IconBitmap $size
  $graphics = [Drawing.Graphics]::FromImage($canvas)
  try {
    Set-HighQuality $graphics
    $graphics.DrawImage($image, 0, 0, $size, $size)
    $center = ($size - 1) / 2
    $radius = ($size / 2) - 0.5
    for ($y = 0; $y -lt $size; $y += 1) {
      for ($x = 0; $x -lt $size; $x += 1) {
        $distance = [Math]::Sqrt([Math]::Pow($x - $center, 2) + [Math]::Pow($y - $center, 2))
        if ($distance -gt $radius) { $canvas.SetPixel($x, $y, [Drawing.Color]::Transparent) }
      }
    }
    $canvas.Save($destination, [Drawing.Imaging.ImageFormat]::Png)
  } finally {
    $graphics.Dispose()
    $canvas.Dispose()
  }
}

function Save-AdaptiveForeground([Drawing.Image]$image, [int]$size, [string]$destination) {
  $canvas = New-IconBitmap $size
  $graphics = [Drawing.Graphics]::FromImage($canvas)
  try {
    Set-HighQuality $graphics
    $graphics.Clear($background)
    $inset = [Math]::Round($size * 0.17)
    $contentSize = $size - (2 * $inset)
    $content = New-IconBitmap $contentSize
    $contentGraphics = [Drawing.Graphics]::FromImage($content)
    try {
      Set-HighQuality $contentGraphics
      $contentGraphics.DrawImage($image, 0, 0, $contentSize, $contentSize)
    } finally {
      $contentGraphics.Dispose()
    }
    $contentCenter = ($contentSize - 1) / 2
    $fadeStart = $contentSize * 0.46
    $fadeEnd = $contentSize * 0.5
    for ($y = 0; $y -lt $contentSize; $y += 1) {
      for ($x = 0; $x -lt $contentSize; $x += 1) {
        $distance = [Math]::Sqrt([Math]::Pow($x - $contentCenter, 2) + [Math]::Pow($y - $contentCenter, 2))
        if ($distance -gt $fadeStart) {
          $mix = [Math]::Max(0, [Math]::Min(1, ($fadeEnd - $distance) / ($fadeEnd - $fadeStart)))
          $pixel = $content.GetPixel($x, $y)
          $red = [Math]::Round(($background.R * (1 - $mix)) + ($pixel.R * $mix))
          $green = [Math]::Round(($background.G * (1 - $mix)) + ($pixel.G * $mix))
          $blue = [Math]::Round(($background.B * (1 - $mix)) + ($pixel.B * $mix))
          $content.SetPixel($x, $y, [Drawing.Color]::FromArgb(255, $red, $green, $blue))
        }
      }
    }
    $graphics.DrawImage($content, $inset, $inset, $contentSize, $contentSize)
    $content.Dispose()
    $canvas.Save($destination, [Drawing.Imaging.ImageFormat]::Png)
  } finally {
    $graphics.Dispose()
    $canvas.Dispose()
  }
}

$sourceImage = [Drawing.Image]::FromFile($sourcePath)
try {
  foreach ($density in $densities.Keys) {
    $directory = Join-Path $resourceRoot "mipmap-$density"
    [IO.Directory]::CreateDirectory($directory) | Out-Null
    $launcherSize = $densities[$density].launcher
    $foregroundSize = $densities[$density].foreground
    Save-SquareIcon $sourceImage $launcherSize (Join-Path $directory 'ic_launcher.png')
    Save-RoundIcon $sourceImage $launcherSize (Join-Path $directory 'ic_launcher_round.png')
    Save-AdaptiveForeground $sourceImage $foregroundSize (Join-Path $directory 'ic_launcher_foreground.png')
  }
} finally {
  $sourceImage.Dispose()
}

Write-Output "Ikon Android dibuat dari $sourcePath"
