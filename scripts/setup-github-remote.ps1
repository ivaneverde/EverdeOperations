#Requires -Version 5.1
<#
.SYNOPSIS
  Add or replace git remote `origin` for pushing to GitHub.

.DESCRIPTION
  Create an empty repo on GitHub (no README/license if this folder already has history),
  then run from repo root:
    .\scripts\setup-github-remote.ps1 https://github.com/OWNER/REPO.git
    git push -u origin master

.EXAMPLE
  .\scripts\setup-github-remote.ps1 https://github.com/EverdeGrowers/Everde-AI-Operations.git
#>
param(
  [Parameter(Mandatory = $true, Position = 0)]
  [string]$RepoUrl
)

$ErrorActionPreference = "Stop"
$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
Set-Location $RepoRoot

$trim = $RepoUrl.Trim()
if ($trim -notmatch "^https://github\.com/[^/]+/[^/]+(?:\.git)?$") {
  Write-Warning "URL should look like: https://github.com/OWNER/REPO.git"
}

$existing = git remote get-url origin 2>$null
if ($LASTEXITCODE -eq 0) {
  Write-Host "Removing existing origin ($existing)" -ForegroundColor Yellow
  git remote remove origin
}

git remote add origin $trim
Write-Host "origin -> $(git remote get-url origin)" -ForegroundColor Green
Write-Host ""
Write-Host "Next (current branch is usually master):" -ForegroundColor Cyan
Write-Host "  git push -u origin master" -ForegroundColor White
Write-Host "If GitHub default branch is main, use instead: git branch -M main && git push -u origin main" -ForegroundColor DarkGray
