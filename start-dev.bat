@echo off
chcp 65001 >nul
setlocal

:: ============================================================
::  INVOOFFICE — start-dev.bat
::  Arrete les processus Node existants puis demarre le projet
:: ============================================================

cd /d "%~dp0"

echo ======================================
echo   INVOOFFICE v1.0
echo   Development Server (clean start)
echo ======================================
echo.

:: Arreter les processus node existants
echo Arret des anciens processus Node...
taskkill /f /im node.exe >nul 2>&1
if %errorlevel% equ 0 (
    echo Anciens processus arretes.
) else (
    echo Aucun processus Node trouve.
)
echo.

:: Relancer via start.bat
call "%~dp0start.bat"
