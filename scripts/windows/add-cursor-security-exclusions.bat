@echo off
REM Run as Administrator: right-click -> Run as administrator
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0add-cursor-security-exclusions.ps1"
pause
