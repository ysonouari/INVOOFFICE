@echo off
chcp 65001 >nul
setlocal

:: ============================================================
::  INVOOFFICE — install-dependencies.bat
::  Installe toutes les dependances du projet
:: ============================================================

cd /d "%~dp0"

echo ======================================
echo   INVOOFFICE
echo   Installation des dependances
echo ======================================
echo.

:: Vérifier Node.js
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERREUR] Node.js requis.
    pause
    exit /b 1
)

:: Installation
echo Installation via npm...
echo.
call npm install

if %errorlevel% neq 0 (
    echo.
    echo [ERREUR] Echec de l'installation.
    pause
    exit /b 1
)

echo.
echo ======================================
echo Installation terminee avec succes.
echo ======================================
pause
