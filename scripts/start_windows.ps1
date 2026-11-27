# Blueberry Farm and Resort - Windows PowerShell Startup Script
$ErrorActionPreference = "Stop"

$RootDir = Split-Path -Parent $PSScriptRoot
Set-Location $RootDir

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "  BLUEBERRY FARM AND RESORT - KARJAT" -ForegroundColor Cyan
Write-Host "  Resort Management and Public Booking System" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

# Check for existing process holding port 8000 and free it cleanly
$connections = Get-NetTCPConnection -LocalPort 8000 -State Listen -ErrorAction SilentlyContinue
if ($connections) {
    foreach ($conn in $connections) {
        $pId = $conn.OwningProcess
        if ($pId -gt 0) {
            Write-Host "Releasing port 8000 from hanging process PID: $pId ..." -ForegroundColor Yellow
            Stop-Process -Id $pId -Force -ErrorAction SilentlyContinue
        }
    }
    Start-Sleep -Seconds 1
}

# Ensure production frontend bundle is fresh
Write-Host "Checking frontend build..." -ForegroundColor Yellow
Push-Location frontend
if (-not (Test-Path "dist\index.html")) {
    Write-Host "Building frontend assets..." -ForegroundColor Yellow
    npm run build
}
Pop-Location

$env:PYTHONPATH = "$RootDir\backend"
Write-Host ""
Write-Host "Server ready!" -ForegroundColor Green
Write-Host "-> Public Website:      http://localhost:8000" -ForegroundColor Green
Write-Host "-> Admin Login:         http://localhost:8000/admin/login" -ForegroundColor Green
Write-Host "-> API Interactive Doc: http://localhost:8000/docs" -ForegroundColor Green
Write-Host "-> Credentials:         admin / Admin@123" -ForegroundColor Yellow
Write-Host "Press Ctrl+C in this terminal to stop the server." -ForegroundColor Gray
Write-Host ""

python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
