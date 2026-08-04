@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion

:: ============================================================
::  INVOOFFICE — start.bat
::  Lance le serveur de developpement local
::  Reproduit le comportement Vercel (rewrites)
:: ============================================================

cd /d "%~dp0"

echo ======================================
echo   INVOOFFICE v1.0
echo   Local Development Server
echo ======================================
echo.

:: Verifier Node.js
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERREUR] Node.js n'est pas installe.
    echo Telechargez Node.js depuis : https://nodejs.org
    pause
    exit /b 1
)
echo Node.js : OK

:: Verifier npm
where npm >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERREUR] npm non disponible.
    pause
    exit /b 1
)
echo npm : OK

:: Verifier dependances
if not exist "node_modules\" (
    echo.
    echo Dependencies absentes. Installation...
    echo.
    call npm install
    if %errorlevel% neq 0 (
        echo [ERREUR] Echec installation dependances.
        pause
        exit /b 1
    )
)
echo Dependencies : OK

:: Verifier server.js
if not exist "server.js" (
    echo [ERREUR] server.js introuvable.
    pause
    exit /b 1
)

:: Trouver un port disponible
set PORT=3000
:checkport
netstat -ano | findstr ":%PORT% " | findstr "LISTENING" >nul
if not errorlevel 1 (
    set /a PORT+=1
    if !PORT! gtr 3010 goto noport
    goto checkport
)
goto start

:noport
echo [ERREUR] Aucun port disponible (3000-3010).
pause
exit /b 1

:start
echo Port : %PORT%
echo.
echo Demarrage du serveur...
echo.

:: Ouvrir le navigateur
start "" /b cmd /c "timeout /t 2 /nobreak >nul && start http://localhost:%PORT%/"

:: Lancer le serveur (PORT env automatique car deja set)
node server.js

:: Si le serveur s'arrete
echo.
echo Serveur arrete.
pause
