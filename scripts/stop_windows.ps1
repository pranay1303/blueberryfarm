# Blueberry Farm and Resort - Windows PowerShell Stop Script
$ErrorActionPreference = "SilentlyContinue"

Write-Host "Stopping Blueberry Farm and Resort processes..." -ForegroundColor Cyan

# Terminate process on port 8000
$port8000Conns = Get-NetTCPConnection -LocalPort 8000 -State Listen -ErrorAction SilentlyContinue
if ($port8000Conns) {
    foreach ($c in $port8000Conns) {
        $p = $c.OwningProcess
        if ($p -gt 0) {
            Write-Host "Terminating server on port 8000 (PID: $p)..." -ForegroundColor Yellow
            Stop-Process -Id $p -Force -ErrorAction SilentlyContinue
        }
    }
}

# Terminate process on Vite dev port 5173 if running
$port5173Conns = Get-NetTCPConnection -LocalPort 5173 -State Listen -ErrorAction SilentlyContinue
if ($port5173Conns) {
    foreach ($c in $port5173Conns) {
        $p = $c.OwningProcess
        if ($p -gt 0) {
            Write-Host "Terminating dev server on port 5173 (PID: $p)..." -ForegroundColor Yellow
            Stop-Process -Id $p -Force -ErrorAction SilentlyContinue
        }
    }
}

Write-Host "All Blueberry Farm services stopped cleanly." -ForegroundColor Green
