# Build, install, and launch the debug app on a connected Android phone.
#
#   1. On the phone: Settings > About phone > tap "Build number" 7x to unlock
#      Developer options, then Settings > System > Developer options > enable
#      "USB debugging".
#   2. Plug the phone into this PC via USB and tap "Allow" on the debugging prompt.
#   3. From the project root, run:
#        powershell -ExecutionPolicy Bypass -File scripts\run-on-phone.ps1
#      Add -Logcat to also stream the app's WebView/Capacitor logs after launch.
param(
  [switch]$Logcat
)
$ErrorActionPreference = "Stop"

$env:JAVA_HOME    = "C:\Program Files\Android\Android Studio\jbr"
$env:ANDROID_HOME = "C:\Users\LeonOriti\AppData\Local\Android\Sdk"
$adb     = "$env:ANDROID_HOME\platform-tools\adb.exe"
$appId   = "com.tldkgames.cubicle"
$root    = Split-Path -Parent $PSScriptRoot

Write-Host "==> Checking for a connected device..." -ForegroundColor Cyan
$devices = (& $adb devices) -split "`n" | Where-Object { $_ -match "\tdevice$" }
if (-not $devices) {
  Write-Host "No authorised device found." -ForegroundColor Red
  Write-Host "  - Is USB debugging enabled and the cable connected?"
  Write-Host "  - Check the phone for an 'Allow USB debugging?' prompt and tap Allow."
  Write-Host "  - Verify with: `"$adb`" devices"
  exit 1
}
Write-Host ("Device(s): " + (($devices | ForEach-Object { ($_ -split "`t")[0] }) -join ", ")) -ForegroundColor Green

Write-Host "==> Syncing web assets (www -> android)..." -ForegroundColor Cyan
Push-Location $root
& npx cap sync android
Pop-Location

Write-Host "==> Building + installing the debug app (first run downloads deps)..." -ForegroundColor Cyan
Push-Location "$root\android"
& .\gradlew.bat installDebug --no-daemon
$code = $LASTEXITCODE
Pop-Location
if ($code -ne 0) { Write-Host "Build/install failed (exit $code)." -ForegroundColor Red; exit $code }

Write-Host "==> Launching $appId on the phone..." -ForegroundColor Cyan
& $adb shell monkey -p $appId -c android.intent.category.LAUNCHER 1 | Out-Null
Write-Host "Launched. The app appears on your phone as 'Cubicle'." -ForegroundColor Green

if ($Logcat) {
  Write-Host "==> Streaming logs (Ctrl+C to stop)..." -ForegroundColor Cyan
  & $adb logcat -c
  # Capacitor/WebView console + JS errors surface under these tags.
  & $adb logcat Capacitor:V chromium:V "*:E"
}
