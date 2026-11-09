# Receives canvas snapshots from the test scripts (snap() in tools/tests/lib.js) and saves them as
# JPEGs in tools/snaps/. Useful when the preview pane is hidden and screenshots come back stale.
# Usage: powershell -ExecutionPolicy Bypass -File tools/snap.ps1   (leave it running; Ctrl+C to stop)
param([int]$Port = 5179, [string]$OutDir = (Join-Path $PSScriptRoot 'snaps'))
New-Item -ItemType Directory -Force $OutDir | Out-Null
$l = New-Object System.Net.HttpListener
$l.Prefixes.Add("http://localhost:$Port/")
$l.Start()
Write-Host "Saving snapshots to $OutDir (port $Port)"
$n = 0
try {
  while ($l.IsListening) {
    $c = $l.GetContext()
    try {
      $c.Response.Headers.Add('Access-Control-Allow-Origin', '*')
      if ($c.Request.HttpMethod -eq 'POST') {
        $sr = New-Object IO.StreamReader($c.Request.InputStream)
        $body = $sr.ReadToEnd(); $sr.Close()
        $name = $c.Request.Url.AbsolutePath.Trim('/') -replace '[^A-Za-z0-9_-]', ''
        if (-not $name) { $name = "shot$n" }
        $b64 = $body.Substring($body.IndexOf(',') + 1)
        [IO.File]::WriteAllBytes((Join-Path $OutDir "$name.jpg"), [Convert]::FromBase64String($b64))
        $n++
      }
      $c.Response.StatusCode = 200
    } catch { $c.Response.StatusCode = 500 } finally { $c.Response.OutputStream.Close() }
  }
} finally { $l.Stop() }
