#Requires -Version 5.1
<#
.SYNOPSIS
  Patch Freight/_pipeline/update.py so raw .xlsb files are read only from Freight/WeeklyDrop.

.EXAMPLE
  npm run freight:patch-weeklydrop
#>
param(
  [string]$UpdatePyPath = "\\192.168.190.10\Claude Sandbox\DataDrops\Freight\_pipeline\update.py"
)

$ErrorActionPreference = "Stop"
if (-not (Test-Path -LiteralPath $UpdatePyPath)) {
  Write-Error "update.py not found: $UpdatePyPath"
}

$content = [System.IO.File]::ReadAllText($UpdatePyPath)
$alreadyPatched = $content.Contains("RAW_DATA_DIR")
if ($alreadyPatched -and $content.Contains("Also copied to WeeklyDrop")) {
  Write-Host "Already fully patched. Skipping." -ForegroundColor Green
  exit 0
}
if ($alreadyPatched) {
  Write-Host "RAW_DATA_DIR present; applying publish->WeeklyDrop copy only." -ForegroundColor Cyan
}

$bak = "$UpdatePyPath.bak"
if (-not (Test-Path -LiteralPath $bak)) {
  Copy-Item -LiteralPath $UpdatePyPath -Destination $bak -Force
  Write-Host "Backup: $bak" -ForegroundColor Cyan
}

if (-not $alreadyPatched) {
$content = $content.Replace(
  "Run this after dropping a new freight data file into /Freight/.",
  "Run this after dropping raw freight data files into /Freight/WeeklyDrop/."
)

$content = $content.Replace(
@'
FREIGHT_DIR  = os.path.dirname(PIPELINE_DIR)
SCRIPTS_DIR  = os.path.join(PIPELINE_DIR, "scripts")
'@,
@'
FREIGHT_DIR  = os.path.dirname(PIPELINE_DIR)
WEEKLY_DROP_DIR = os.path.join(FREIGHT_DIR, "WeeklyDrop")
RAW_DATA_DIR = WEEKLY_DROP_DIR if os.path.isdir(WEEKLY_DROP_DIR) else FREIGHT_DIR
SCRIPTS_DIR  = os.path.join(PIPELINE_DIR, "scripts")
'@
)

$oldPatchLine = "    content = content.replace(OLD_FREIGHT_PREFIX, FREIGHT_DIR)"
$newPatchBlock = @'
    content = content.replace(OLD_FREIGHT_PREFIX, RAW_DATA_DIR)
    _raw_path_literal = repr(RAW_DATA_DIR)
    content = content.replace(
        "FREIGHT_DIR = _os_patched.path.normpath(_os_patched.path.join(_HERE, '..', '..'))",
        f"FREIGHT_DIR = {_raw_path_literal}  # WeeklyDrop path at patch time",
    )
'@
$content = $content.Replace($oldPatchLine, $newPatchBlock)

$content = $content.Replace(
  "input_files = sorted([f for f in os.listdir(FREIGHT_DIR) if f.endswith('.xlsb') and 'Everde Freight Data' in f])",
  "input_files = sorted([f for f in os.listdir(RAW_DATA_DIR) if f.endswith('.xlsb') and 'Everde Freight Data' in f])"
)

$content = $content.Replace(
  'print(f"Freight dir: {FREIGHT_DIR}")',
  @'
print(f"Freight dir: {FREIGHT_DIR}")
    print(f"Raw data dir (weekly drop): {RAW_DATA_DIR}")
'@
)
}

$publishOld = "    shutil.copy(final_src, final_dst)`n    print("
$publishNew = @'
    shutil.copy(final_src, final_dst)
    if os.path.isdir(WEEKLY_DROP_DIR):
        weekly_dst = os.path.join(WEEKLY_DROP_DIR, final_name)
        shutil.copy(final_src, weekly_dst)
        print(f"  Also copied to WeeklyDrop: {weekly_dst}")
    print(
'@
if ($content.Contains("Also copied to WeeklyDrop")) {
  # already has publish copy block
} elseif ($content.Contains($publishOld)) {
  $content = $content.Replace($publishOld, $publishNew)
} else {
  Write-Warning "Could not patch publish->WeeklyDrop copy block; add manually if needed."
}

if (-not $alreadyPatched -and -not $content.Contains("RAW_DATA_DIR")) {
  Write-Error "Patch failed - expected markers missing. Restore from .bak and report."
}

[System.IO.File]::WriteAllText($UpdatePyPath, $content)
Write-Host "Patched: $UpdatePyPath" -ForegroundColor Green
Write-Host "Next: npm run freight:migrate-weeklydrop (one-time move of xlsb into WeeklyDrop)" -ForegroundColor Yellow
