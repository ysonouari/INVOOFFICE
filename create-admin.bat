@echo off
chcp 65001 >nul
setlocal

:: ============================================================
::  INVOOFFICE — create-admin.bat
::  Cree le compte administrateur par defaut
::  Utilise node supabase/scripts/create-full-admin.js
:: ============================================================

cd /d "%~dp0"

echo ======================================
echo   INVOOFFICE v1.0
echo   Creation du compte administrateur
echo ======================================
echo.

:: Verifier Node.js
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERREUR] Node.js requis.
    pause
    exit /b 1
)

:: Verifier dependances
if not exist "node_modules\" (
    echo Installation des dependances...
    call npm install
    if %errorlevel% neq 0 (
        echo [ERREUR] Echec installation.
        pause
        exit /b 1
    )
)

echo Execution du script de creation...
echo.

node supabase/scripts/create-full-admin.js

echo.
echo ======================================
echo Script termine.
echo ======================================
pause
