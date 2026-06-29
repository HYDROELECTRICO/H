@echo off
title Phone Mouse - Internet (Cloudflare Tunnel)
echo ==================================================
echo    Phone Mouse - Internet thi controll karva
echo ==================================================
echo.

REM Node check
where node >nul 2>nul
if %errorlevel% neq 0 (
  echo [ERROR] Node.js install nathi. https://nodejs.org parthi install karo.
  pause & exit /b
)

REM cloudflared check
where cloudflared >nul 2>nul
if %errorlevel% neq 0 (
  echo [ERROR] cloudflared malyu nahi.
  echo.
  echo Install karva mate (PowerShell admin ma):
  echo     winget install --id Cloudflare.cloudflared
  echo Athva: https://github.com/cloudflare/cloudflared/releases
  echo.
  pause & exit /b
)

REM Dependencies
if not exist "node_modules" (
  echo Pehli vaar setup... npm install chali rahyu chhe.
  call npm install
  echo.
)

echo.
echo Server chalu thai rahyo chhe (background ma)...
start "PhoneMouseServer" /min cmd /c "node server.js & pause"

timeout /t 3 >nul

echo.
echo ==================================================
echo   HE;ANE Cloudflare tunnel chalu thase.
echo   Niche "https://....trycloudflare.com" jevu
echo   public URL aavshe - te phone ma kholo.
echo.
echo   Server window ma batavel PIN phone par nakho.
echo ==================================================
echo.

cloudflared tunnel --url http://localhost:3000

pause
