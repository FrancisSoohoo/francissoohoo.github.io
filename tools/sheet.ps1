param([string]$Out, [int]$Cell = 300, [int]$Cols = 5, [string[]]$Files)
Add-Type -AssemblyName System.Drawing
$rows = [Math]::Ceiling($Files.Count / $Cols)
$sheet = New-Object System.Drawing.Bitmap ($Cols * $Cell), ($rows * ($Cell + 18))
$g = [System.Drawing.Graphics]::FromImage($sheet); $g.Clear([System.Drawing.Color]::White)
$g.InterpolationMode = 'HighQualityBicubic'
$font = New-Object System.Drawing.Font 'Arial', 9
for ($i = 0; $i -lt $Files.Count; $i++) {
  $img = [System.Drawing.Image]::FromFile($Files[$i])
  foreach ($p in $img.PropertyItems) { if ($p.Id -eq 0x0112) { $o = [BitConverter]::ToUInt16($p.Value, 0); if ($o -eq 6) { $img.RotateFlip('Rotate90FlipNone') } elseif ($o -eq 8) { $img.RotateFlip('Rotate270FlipNone') } elseif ($o -eq 3) { $img.RotateFlip('Rotate180FlipNone') } } }
  $s = [Math]::Min($Cell / $img.Width, $Cell / $img.Height)
  $w = [int]($img.Width * $s); $h = [int]($img.Height * $s)
  $x = ($i % $Cols) * $Cell + ($Cell - $w) / 2; $y = [Math]::Floor($i / $Cols) * ($Cell + 18)
  $g.DrawImage($img, [int]$x, [int]$y, $w, $h)
  $g.DrawString(("{0}: {1}" -f $i, [IO.Path]::GetFileName($Files[$i])), $font, [System.Drawing.Brushes]::Black, ($i % $Cols) * $Cell + 2, $y + $Cell + 2)
  $img.Dispose()
}
$sheet.Save($Out, [System.Drawing.Imaging.ImageFormat]::Jpeg); $g.Dispose(); $sheet.Dispose(); 'ok'
