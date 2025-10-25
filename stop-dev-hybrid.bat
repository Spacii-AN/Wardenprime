@echo off
REM WardenPrime Hybrid Development Stopper (Windows)
REM Stops Docker services (database and dashboard)

echo.
echo 🛑 Stopping WardenPrime Hybrid Development Environment
echo.

REM Stop Docker services
echo ℹ️  Stopping Docker services...
docker-compose -f docker-compose.dev-hybrid.yml down

echo ✅ Docker services stopped

REM Ask if user wants to clean up volumes
echo.
set /p cleanup="Do you want to remove database data? (y/N): "
if /i "%cleanup%"=="y" (
    echo ℹ️  Removing database volumes...
    docker-compose -f docker-compose.dev-hybrid.yml down -v
    echo ✅ Database data removed
) else (
    echo ℹ️  Database data preserved
)

echo ✅ Hybrid development environment stopped
echo.
echo 📋 Next Steps:
echo   Start again: start-dev-hybrid.bat
echo   Full cleanup: stop-dev-hybrid.bat (and choose 'y' for cleanup)
pause
