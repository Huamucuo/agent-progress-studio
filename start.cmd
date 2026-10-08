@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js 22.15 or newer is required. Install Node.js, then open this file again.
  pause
  exit /b 1
)
node -e "const [a,b]=process.versions.node.split('.').map(Number);process.exit(a>22||(a===22&&b>=15)?0:1)"
if errorlevel 1 (
  echo Please upgrade Node.js to 22.15 or newer.
  pause
  exit /b 1
)
node scripts\launch.mjs %*
if errorlevel 1 pause
