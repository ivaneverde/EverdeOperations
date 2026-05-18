#Requires -Version 5.1
<#
.SYNOPSIS
  Patch update.py run_step() to set PYTHONUTF8 for child scripts (fixes step 23 print arrow crash on Windows).

.EXAMPLE
  npm run freight:fix-update-utf8
#>
param(
  [string]$UpdatePyPath = "\\192.168.190.10\Claude Sandbox\DataDrops\Freight\_pipeline\update.py"
)

$ErrorActionPreference = "Stop"
$content = [System.IO.File]::ReadAllText($UpdatePyPath)

if ($content.Contains("PYTHONUTF8")) {
  Write-Host "update.py already sets PYTHONUTF8 for pipeline steps." -ForegroundColor Green
  exit 0
}

$old = @'
    result = subprocess.run([sys.executable, full], capture_output=True, text=True, timeout=600)
'@

$new = @'
    result = subprocess.run(
        [sys.executable, full],
        capture_output=True,
        text=True,
        timeout=600,
        env={**os.environ, "PYTHONUTF8": "1", "PYTHONIOENCODING": "utf-8"},
    )
'@

if (-not $content.Contains($old.Trim())) {
  Write-Error "run_step subprocess line not found; update.py may have changed."
}

$content = $content.Replace($old, $new)
[System.IO.File]::WriteAllText($UpdatePyPath, $content)
Write-Host "Patched UTF-8 env in: $UpdatePyPath" -ForegroundColor Green
