# Release & Build Guide — Cubicle

This documents how the Play-ready Android App Bundle was built on this machine, the
signing credentials, and how to rebuild for future updates.

## Versioning & release protocol

This project (`cubicle-app/`) lives inside the `StaldexGames` git repo — that's now the
single source of truth. `.aab` build output is git-ignored (`dist/`); it is **not**
committed. Instead, every shipped version follows this loop:

1. Edit the game in `../site/cubicle.html` (also the file served live at
   staldex.com/cubicle — see `../DEPLOY.md`), then copy it into `www/index.html` and
   run `npx cap sync android` so the native project picks it up.
2. Bump `versionCode` (always +1) and `versionName` in `android/app/build.gradle`.
3. Add an entry to `CHANGELOG.md` describing what changed.
4. Commit the source changes (`git commit`) — this is the permanent record of every
   revision; no more manual `.bak` files.
5. Once a signed `.aab` is built (see below), tag the commit (`git tag vX.Y.Z`) and
   create a **GitHub Release** with the `.aab` attached and the changelog entry as the
   release notes. This keeps every historical build downloadable without bloating the
   repo with binaries.

## The deliverable

```
dist/Cubicle-v1.0.5-release.aab
```

A **signed Android App Bundle** ready to upload to Google Play Console.

- App ID: `com.tldkgames.cubicle`
- Display name: `Cubicle` (in-game wellness wrapper is still branded "Vitals 365")
- versionCode `6`, versionName `1.0.5`
- minSdk 22 (Android 5.1), targetSdk 35 (Android 15) — meets Play's current target-API requirement
- Size: ~2.6 MB

## ⚠️ Signing key — DO NOT LOSE THIS

The bundle is signed with an **upload key** in:

```
keystore/cubicle-upload.jks
```

| Field | Value |
|---|---|
| Keystore file | `keystore/cubicle-upload.jks` |
| Store password | `Cub1cle-V1tals365-Upload` |
| Key alias | `cubicle-upload` |
| Key password | `Cub1cle-V1tals365-Upload` |
| Validity | 10,000 days |

Certificate fingerprints (you may need these in Play Console):

```
SHA1:   FF:D3:82:C1:3D:1B:45:C8:4E:AC:5E:87:A8:B7:E9:10:39:78:C5:0E
SHA256: 13:A8:8F:21:EB:79:4E:CB:01:FE:00:A4:47:2D:91:1C:2B:B2:72:80:EC:CD:94:CE:1E:74:E4:38:8E:F2:5B:5E
```

**Back up `keystore/cubicle-upload.jks` and these passwords somewhere safe (password
manager, offline backup).** If you lose this key you cannot publish updates to the
same app listing under the standard flow. (If you enrol in Google **Play App Signing** —
recommended, and the default for new apps — Google holds the real app-signing key and
this file becomes your *upload* key, which Google can help you reset if lost. Enrol on
first upload.)

The keystore and `android/keystore.properties` are git-ignored. They are the only
secrets in the repo.

## Uploading to Play

1. Create the app in [Play Console](https://play.google.com/console) → bundle ID `com.tldkgames.cubicle`.
2. Production (or Internal testing) → Create release → upload `dist/Cubicle-v1.0.1-release.aab`.
3. Accept **Play App Signing** when prompted (recommended).
4. Content rating: this game references prescription stimulants (dexamphetamine),
   nicotine, pre-workout, and bowel humour — answer the rating questionnaire honestly;
   expect **Mature 17+**. Understating it gets the listing rejected.
5. Fill store listing, data-safety form, then roll out.

Suggested listing copy is in `README.md`.

## Testing / smoke test

The app is `www/index.html` running inside a Chromium-based Android System WebView,
so the game logic was validated by loading it in desktop Chrome (same Blink/V8 engine
family) via `scripts/smoke-test.js`:

```powershell
node scripts/smoke-test.js   # screenshots + console-error capture in dist/smoke/
```

Result: intro screen, "Clock in", action handlers, work/report filing, time advance,
and meter updates all work with **zero console/page errors**. Evidence screenshots are
in `dist/smoke/`.

### Run on a connected phone (one command)

A local emulator can't run on this machine (see the Windows-on-ARM note below), so the
quickest way to see the native app is a USB-connected phone:

1. On the phone: **Settings → About phone → tap "Build number" 7×** to unlock Developer
   options, then **Settings → System → Developer options → enable "USB debugging"**.
2. Plug the phone into this PC and tap **Allow** on the "Allow USB debugging?" prompt.
3. From the project root:

   ```powershell
   powershell -ExecutionPolicy Bypass -File scripts\run-on-phone.ps1
   # add -Logcat to also stream the app's console/WebView logs after it launches:
   powershell -ExecutionPolicy Bypass -File scripts\run-on-phone.ps1 -Logcat
   ```

   The script checks for an authorised device, runs `npx cap sync`, builds + installs the
   debug app (`gradlew installDebug`), and launches it. It appears on the phone as
   **Cubicle**. If no device is found it prints exactly what to fix.

You can also just open the project in Android Studio (`npx cap open android`) and hit Run.

**Note on the Android emulator (Windows on ARM):** a local emulator boot is *not*
possible on this machine. `sdkmanager` only provides the x86_64 emulator binary, and its
QEMU2 refuses to run an arm64 system image (`Avd's CPU Architecture 'arm64' is not
supported by the QEMU2 emulator on x86_64 host`). Use a physical phone (above) or upload
the `.aab` to Play Console **Internal testing** and install via the test link.

## Rebuilding (for the next version)

Toolchain used (already installed on this machine):

- Node 24 / npm 11
- JDK 21 — bundled with Android Studio at `C:\Program Files\Android\Android Studio\jbr`
- Android SDK at `C:\Users\LeonOriti\AppData\Local\Android\Sdk` (platform android-35, build-tools 35.0.0)
- Gradle 8.7 (via the wrapper), Android Gradle Plugin 8.6.0

Steps from PowerShell:

```powershell
$env:JAVA_HOME = "C:\Program Files\Android\Android Studio\jbr"
$env:ANDROID_HOME = "C:\Users\LeonOriti\AppData\Local\Android\Sdk"

# 1. After editing www/index.html, copy web assets into the native project
npx cap sync android

# 2. Bump the version for every Play upload (edit android/app/build.gradle):
#    versionCode 3   (must increase each upload)
#    versionName "1.0.2"

# 3. Build the signed bundle
cd android
.\gradlew.bat clean bundleRelease --no-daemon

# Output: android/app/build/outputs/bundle/release/app-release.aab
```

The signing config in `android/app/build.gradle` reads `android/keystore.properties`
automatically, so release builds are signed with no extra steps.

## Notes / changes made during setup

- `package.json`: moved `@capacitor/assets` to `optionalDependencies` because its native
  `sharp` dependency won't compile on this ARM64 Windows machine. Icon generation is
  instead done by `scripts/gen-icons.js` (pure-JS, uses `jimp`).
- App launcher icons were generated from `resources/icon.png` into all mipmap densities,
  with the adaptive-icon background set to the Teams purple `#33344a`.
- Gradle wrapper bumped 8.2.1 → 8.7 and AGP 8.2.1 → 8.6.0 so the build runs on the
  bundled JDK 21 and can target API 35.
- `android/` is generated by Capacitor. If you ever delete and re-run `npx cap add android`,
  re-apply: `local.properties`, the signing block in `app/build.gradle`, the icon
  generation (`node scripts/gen-icons.js`), the `ic_launcher_background` colour, the
  Gradle wrapper version, the AGP version, and the targetSdk/compileSdk in `variables.gradle`.

## Regenerating launcher icons

```powershell
node scripts/gen-icons.js   # reads resources/icon.png, writes all mipmap densities
npx cap sync android
```
