param([string]$Video, [string]$OutDir, [double[]]$Times = @(), [int]$Every = 0, [int]$Width = 900)
# Grab still frames from a video with the Windows media APIs (no ffmpeg on this machine).
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$null = [Windows.Storage.StorageFile, Windows.Storage, ContentType = WindowsRuntime]
$null = [Windows.Media.Editing.MediaComposition, Windows.Media.Editing, ContentType = WindowsRuntime]
$null = [Windows.Media.Editing.MediaClip, Windows.Media.Editing, ContentType = WindowsRuntime]
$asTaskGeneric = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1' })[0]
function Await($op, [Type]$t) { $m = $asTaskGeneric.MakeGenericMethod($t); $task = $m.Invoke($null, @($op)); $task.Wait(-1) | Out-Null; $task.Result }
New-Item -ItemType Directory -Force $OutDir | Out-Null
$file = Await ([Windows.Storage.StorageFile]::GetFileFromPathAsync($Video)) ([Windows.Storage.StorageFile])
$clip = Await ([Windows.Media.Editing.MediaClip]::CreateFromFileAsync($file)) ([Windows.Media.Editing.MediaClip])
$comp = New-Object Windows.Media.Editing.MediaComposition
[System.Collections.Generic.ICollection[Windows.Media.Editing.MediaClip]].GetMethod("Add").Invoke($comp.Clips, @($clip)) | Out-Null
$ErrorActionPreference = "Stop"
$dur = $clip.OriginalDuration.TotalSeconds
$props = $clip.GetVideoEncodingProperties()
"duration: $dur s, $($props.Width)x$($props.Height)"
if ($Every -gt 0) { $Times = @(); for ($t = 0.5; $t -lt $dur; $t += $Every) { $Times += $t } }
$h = [int]([double]$Width * $props.Height / $props.Width)
foreach ($t in $Times) {
  $ts = [TimeSpan]::FromSeconds([Math]::Min($t, $dur - 0.05))
  $img = Await ($comp.GetThumbnailAsync($ts, $Width, $h, [Windows.Media.Editing.VideoFramePrecision]::NearestFrame)) ([Windows.Graphics.Imaging.ImageStream])
  $net = [System.IO.WindowsRuntimeStreamExtensions]::AsStreamForRead($img)
  $out = Join-Path $OutDir ("f{0:000.0}.jpg" -f $t)
  $fs = [IO.File]::Create($out); $net.CopyTo($fs); $fs.Close(); $net.Dispose()
}
'done'
