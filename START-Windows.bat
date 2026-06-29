@echo off
title Phone Mouse Server
echo ============================================
echo    Phone Mouse - Server shuru thai rahyu chhe
echo ============================================
echo.

REM Node install chhe ke nahi te check karo
where node >nul 2>nul
if %errorlevel% neq 0 (
  echo [ERROR] Node.js install nathi.
  echo Pehla https://nodejs.org parthi Node.js install karo.
  echo.
  pause
  exit /b
)

REM Pehli vaar dependencies install karo
if not exist "node_modules" (
  echo Pehli vaar setup thai rahyu chhe... thodi var lagshe.
  echo.
  call npm install
  echo.
)

echo Server chalu thai rahyo chhe...
echo.
node server.js

pause
