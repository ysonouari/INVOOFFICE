@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion

:: ============================================================
::  INVOOFFICE — start-production-preview.bat
::  Demarre un apercu de production avec rewrites
:: ============================================================

cd /d "%~dp0"

echo ======================================
echo   INVOOFFICE v1.0
echo   Production Preview
echo ======================================
echo.

:: Verifier Node.js
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERREUR] Node.js requis.
    pause
    exit /b 1
)

:: Verifier server.js
if not exist "server.js" (
    echo [ERREUR] server.js introuvable.
    pause
    exit /b 1
)

:: Trouver un port (4000+ pour preview)
set PORT=4000
:checkport
netstat -ano | findstr ":%PORT% " >nul
if not errorlevel 1 (
    set /a PORT+=1
    if !PORT! gtr 4010 goto noport
    goto checkport
)
goto start

:noport
echo [ERREUR] Aucun port disponible.
pause
exit /b 1

:start
echo Port : %PORT%
echo Rewrites Vercel emules (identique production).
echo.
echo Demarrage...
echo.

start "" /b cmd /c "timeout /t 2 /nobreak >nul && start http://localhost:%PORT%/"
node server.js

pause
