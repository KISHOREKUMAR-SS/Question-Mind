# Mobile App Testing Script - Simple Version
# Usage: .\mobile-app-test.ps1 <command>

param([string]$Command = "help")

Write-Host "Mobile App Testing Script" -ForegroundColor Cyan

if ($Command -eq "help") {
    Write-Host @"

USAGE:
  .\mobile-app-test.ps1 <command>

COMMANDS:
  help      Show this help
  check     Check ADB and connected devices
  build     Build mobile app
  install   Build and install on device
  logs      Show live logs
  dev       Development mode with live reload

EXAMPLES:
  .\mobile-app-test.ps1 check
  .\mobile-app-test.ps1 install
  .\mobile-app-test.ps1 logs

"@
}
elseif ($Command -eq "check") {
    Write-Host "Checking ADB..." -ForegroundColor Green
    adb devices
}
elseif ($Command -eq "build") {
    Write-Host "Building app..." -ForegroundColor Green
    Set-Location mobile-app
    npm install
    npm run build
    Set-Location ..
}
elseif ($Command -eq "install") {
    Write-Host "Installing app..." -ForegroundColor Green
    Write-Host "Checking devices..." -ForegroundColor Gray
    adb devices
    Write-Host "Building..." -ForegroundColor Gray
    Set-Location mobile-app
    npm run mobile:run-android
    Set-Location ..
}
elseif ($Command -eq "logs") {
    Write-Host "Showing logs (Press Ctrl+C to stop)..." -ForegroundColor Green
    adb logcat | Select-String "questionmind|ERROR|WARNING"
}
elseif ($Command -eq "dev") {
    Write-Host "Starting dev mode with live reload..." -ForegroundColor Green
    Set-Location mobile-app
    npm run build
    npx cap run android --livereload --external
    Set-Location ..
}
else {
    Write-Host "Unknown command: $Command" -ForegroundColor Red
    Write-Host "Use: .\mobile-app-test.ps1 help" -ForegroundColor Gray
}
