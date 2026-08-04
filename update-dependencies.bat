@echo off
chcp 65001 >nul
setlocal

:: ============================================================
::  INVOOFFICE — update-dependencies.bat
::  Met a jour les dependances du projet
:: ============================================================

cd /d "%~dp0"

echo ======================================
echo   INVOOFFICE
echo   Mise a jour des dependances
echo ======================================
echo.

:: Vérifier Node.js
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERREUR] Node.js requis.
    pause
    exit /b 1
)

:: Mise à jour
echo Mise a jour via npm...
echo.
call npm update

if %errorlevel% neq 0 (
    echo.
    echo [ERREUR] Echec de la mise a jour.
    pause
    exit /b 1
)

echo.
echo ======================================
echo Mise a jour terminee avec succes.
echo ======================================
pause
