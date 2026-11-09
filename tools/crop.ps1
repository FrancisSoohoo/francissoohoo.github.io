param([string]$Src, [string]$Out, [int]$X, [int]$Y, [int]$W, [int]$H, [int]$MaxW, [int]$Quality = 80)
Add-Type -AssemblyName System.Drawing
$img = [System.Drawing.Image]::FromFile($Src)
if ($img.PropertyIdList -contains 274) {
  $o = [int]$img.GetPropertyItem(274).Value[0]
  if ($o -eq 3) { $img.RotateFlip([System.Drawing.RotateFlipType]::Rotate180FlipNone) }
  elseif ($o -eq 6) { $img.RotateFlip([System.Drawing.RotateFlipType]::Rotate90FlipNone) }
  elseif ($o -eq 8) { $img.RotateFlip([System.Drawing.RotateFlipType]::Rotate270FlipNone) }
}
if ($W -le 0) { $W = $img.Width - $X }
if ($H -le 0) { $H = $img.Height - $Y }
$W = [Math]::Min($W, $img.Width - $X); $H = [Math]::Min($H, $img.Height - $Y)
[double]$scale = [Math]::Min(1.0, [double]$MaxW / [double]$W)
[int]$nw = [Math]::Round($W * $scale); [int]$nh = [Math]::Round($H * $scale)
$bmp = New-Object System.Drawing.Bitmap -ArgumentList $nw, $nh
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.Clear([System.Drawing.Color]::White)
$g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
$dstRect = New-Object System.Drawing.Rectangle -ArgumentList 0, 0, $nw, $nh
$srcRect = New-Object System.Drawing.Rectangle -ArgumentList $X, $Y, $W, $H
$g.DrawImage($img, $dstRect, $srcRect, [System.Drawing.GraphicsUnit]::Pixel)
$jpeg = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq 'image/jpeg' }
$ep = New-Object System.Drawing.Imaging.EncoderParameters -ArgumentList 1
$ep.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter -ArgumentList ([System.Drawing.Imaging.Encoder]::Quality), ([long]$Quality)
$bmp.Save($Out, $jpeg, $ep)
"{0}: {1}x{2} -> {3}x{4}" -f (Split-Path $Out -Leaf), $img.Width, $img.Height, $nw, $nh
$g.Dispose(); $bmp.Dispose(); $img.Dispose()

