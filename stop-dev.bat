@echo off
REM WardenPrime Development Stopper (Windows)
REM This script stops all development services and cleans up

setlocal enabledelayedexpansion

echo.
echo 🛑 Stopping WardenPrime Development Environment
echo ==============================================
echo.

REM Check if we're in the right directory
if not exist "package.json" (
    echo ❌ Please run this script from the WardenPrime root directory
    pause
    exit /b 1
)

REM Check if services are running
docker-compose ps | findstr "Up" >nul
if %errorlevel% neq 0 (
    echo ⚠️  No services are currently running
    pause
    exit /b 0
)

echo ℹ️  Current running services:
docker-compose ps

echo.
echo What would you like to do?
echo 1) Stop all services (keep data)
echo 2) Stop all services and remove volumes (WARNING: deletes database data)
echo 3) Just show status
echo.
set /p choice="Enter your choice (1-3): "

if "!choice!"=="1" (
    echo ℹ️  Stopping all services...
    docker-compose down
    echo ✅ All services stopped (data preserved)
) else if "!choice!"=="2" (
    echo ⚠️  This will delete all database data!
    set /p confirm="Are you sure? Type 'yes' to confirm: "
    if "!confirm!"=="yes" (
        echo ℹ️  Stopping all services and removing volumes...
        docker-compose down -v
        echo ✅ All services stopped and data removed
    ) else (
        echo ℹ️  Operation cancelled
    )
) else if "!choice!"=="3" (
    echo ℹ️  Service status:
    docker-compose ps
    pause
    exit /b 0
) else (
    echo ❌ Invalid choice
    pause
    exit /b 1
)

echo.
echo ✅ Development environment stopped!
echo.
echo 📋 To start again:
echo   start-dev.bat
echo.
echo 🧹 Cleanup options:
echo   Remove all data: docker-compose down -v
echo   Remove images:   docker-compose down --rmi all
echo   Full cleanup:    docker system prune -a
echo.
pause
