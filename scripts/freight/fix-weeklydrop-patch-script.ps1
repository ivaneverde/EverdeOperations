#Requires -Version 5.1
<#
.SYNOPSIS
  Fix update.py patch_script: bake WeeklyDrop path into _work scripts (not RAW_DATA_DIR name).

.EXAMPLE
  npm run freight:fix-weeklydrop-patch
#>
param(
  [string]$UpdatePyPath = "\\192.168.190.10\Claude Sandbox\DataDrops\Freight\_pipeline\update.py"
)

$ErrorActionPreference = "Stop"
if (-not (Test-Path -LiteralPath $UpdatePyPath)) {
  Write-Error "update.py not found: $UpdatePyPath"
}

$content = [System.IO.File]::ReadAllText($UpdatePyPath)

$broken = @'
    content = content.replace(OLD_FREIGHT_PREFIX, RAW_DATA_DIR)
    content = content.replace(
        "FREIGHT_DIR = _os_patched.path.normpath(_os_patched.path.join(_HERE, '..', '..'))",
        "FREIGHT_DIR = RAW_DATA_DIR  # raw weekly files: Freight/WeeklyDrop only",
    )
'@

$fixed = @'
    content = content.replace(OLD_FREIGHT_PREFIX, RAW_DATA_DIR)
    _raw_path_literal = repr(RAW_DATA_DIR)
    content = content.replace(
        "FREIGHT_DIR = _os_patched.path.normpath(_os_patched.path.join(_HERE, '..', '..'))",
        f"FREIGHT_DIR = {_raw_path_literal}  # WeeklyDrop path at patch time",
    )
'@

if ($content.Contains("_raw_path_literal = repr(RAW_DATA_DIR)")) {
  Write-Host "patch_script already fixed." -ForegroundColor Green
  exit 0
}

if (-not $content.Contains("FREIGHT_DIR = RAW_DATA_DIR  # raw weekly files")) {
  Write-Error "Unexpected update.py content. Restore from update.py.bak or re-run freight:patch-weeklydrop."
}

$content = $content.Replace($broken, $fixed)
[System.IO.File]::WriteAllText($UpdatePyPath, $content)
Write-Host "Fixed patch_script in: $UpdatePyPath" -ForegroundColor Green
Write-Host "Re-run: npm run freight:update-weekly -- -SkipFuelCheck" -ForegroundColor Yellow
