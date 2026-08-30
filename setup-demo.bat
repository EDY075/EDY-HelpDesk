@echo off
setlocal EnableExtensions DisableDelayedExpansion
cd /d "%~dp0"

if /I not "%OS%"=="Windows_NT" (
  echo [EDY HelpDesk] This launcher requires Windows.
  exit /b 1
)

where node.exe >nul 2>&1
if errorlevel 1 (
  echo [EDY HelpDesk] Node.js 22.12 or newer is required.
  echo Install it from: https://nodejs.org/en/download
  exit /b 1
)

node "%~dp0scripts\demo\setup-demo.mjs"
exit /b %errorlevel%
