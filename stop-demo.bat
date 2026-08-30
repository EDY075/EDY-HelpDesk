@echo off
setlocal EnableExtensions DisableDelayedExpansion
cd /d "%~dp0"

if /I not "%OS%"=="Windows_NT" (
  echo [EDY HelpDesk] This launcher requires Windows.
  exit /b 1
)

where node.exe >nul 2>&1
if errorlevel 1 (
  echo [EDY HelpDesk] Node.js is required to contact the local demo supervisor.
  exit /b 1
)

node "%~dp0scripts\demo\stop-demo.mjs"
exit /b %errorlevel%
