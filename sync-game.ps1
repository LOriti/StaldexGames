# Sync the Cubicle game into the native app project.
#
# site/cubicle.html is the single source of truth (it's also the file served live at
# staldex.com/cubicle). cubicle-app/www/index.html is a synced COPY — never hand-edit it.
# Run this after editing site/cubicle.html:
#
#   powershell -File sync-game.ps1
#
# Android is currently parked (web-only), so the Capacitor asset sync is skipped unless
# you pass -Android.
param(
  [switch]$Android
)
$ErrorActionPreference = "Stop"
$root = $PSScriptRoot

Copy-Item "$root\site\cubicle.html" "$root\cubicle-app\www\index.html" -Force
Write-Host "Synced site\cubicle.html -> cubicle-app\www\index.html" -ForegroundColor Green
Copy-Item "$root\site\performance-review.html" "$root\cubicle-app\www\performance-review.html" -Force
Write-Host "Synced site\performance-review.html -> cubicle-app\www\performance-review.html" -ForegroundColor Green

if ($Android) {
  Push-Location "$root\cubicle-app"
  npx cap sync android
  Pop-Location
}
