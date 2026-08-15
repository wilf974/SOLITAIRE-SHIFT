# build.ps1 — compile the Android app.
#
#   .\build.ps1              debug APK, installable straight onto a phone
#   .\build.ps1 -Release     signed AAB for the Play Store
#   .\build.ps1 -Install     build, then push to a connected device
#
# The web game is copied into the APK by Gradle's syncAssets task, so the
# Android build can never drift out of sync with the web version.

param(
    [switch]$Release,
    [switch]$Install,
    [switch]$Clean
)

$ErrorActionPreference = 'Stop'

# --- toolchain ---------------------------------------------------------------

$jdk = Get-ChildItem 'C:\Program Files\Eclipse Adoptium' -Directory -ErrorAction SilentlyContinue |
       Where-Object { $_.Name -like 'jdk-21*' } | Select-Object -First 1
if (-not $jdk) { throw 'JDK 21 not found. Run: winget install EclipseAdoptium.Temurin.21.JDK' }

$env:JAVA_HOME    = $jdk.FullName
$env:ANDROID_HOME = "$env:LOCALAPPDATA\Android\Sdk"
$env:PATH         = "$env:JAVA_HOME\bin;$env:ANDROID_HOME\platform-tools;$env:PATH"

$gradle = "$env:USERPROFILE\gradle-8.10.2\bin\gradle.bat"
if (-not (Test-Path $gradle)) { throw "Gradle not found at $gradle" }

Set-Location $PSScriptRoot

# local.properties is machine-specific and gitignored; regenerate it silently
$sdkEscaped = $env:ANDROID_HOME -replace '\\', '\\'
"sdk.dir=$sdkEscaped" | Out-File -FilePath 'local.properties' -Encoding ascii

# --- build -------------------------------------------------------------------

$tasks = @()
if ($Clean) { $tasks += 'clean' }

if ($Release) {
    if (-not (Test-Path 'keystore.properties')) {
        Write-Warning 'keystore.properties missing — the bundle will be UNSIGNED and the Play Store will reject it.'
        Write-Warning 'See android/README.md, section "Signer pour le Play Store".'
    }
    $tasks += 'bundleRelease'
} else {
    $tasks += 'assembleDebug'
}

Write-Host "Building: $($tasks -join ' ')" -ForegroundColor Cyan
& $gradle @tasks --no-daemon
if ($LASTEXITCODE -ne 0) { throw "Gradle failed with exit code $LASTEXITCODE" }

# --- report ------------------------------------------------------------------

$artifact = if ($Release) {
    'app\build\outputs\bundle\release\app-release.aab'
} else {
    'app\build\outputs\apk\debug\app-debug.apk'
}

if (Test-Path $artifact) {
    $mb = [math]::Round((Get-Item $artifact).Length / 1MB, 1)
    Write-Host ""
    Write-Host "  $artifact" -ForegroundColor Green
    Write-Host "  $mb MB" -ForegroundColor Green
    Write-Host ""
} else {
    throw "Build reported success but $artifact is missing"
}

# --- optional install --------------------------------------------------------

if ($Install -and -not $Release) {
    $adb = "$env:ANDROID_HOME\platform-tools\adb.exe"
    $devices = (& $adb devices) -split "`n" | Where-Object { $_ -match "`tdevice$" }
    if (-not $devices) {
        Write-Warning 'No device connected. Enable USB debugging and plug the phone in.'
    } else {
        Write-Host 'Installing...' -ForegroundColor Cyan
        & $adb install -r $artifact
        & $adb shell monkey -p fr.solitaireshift.app.debug -c android.intent.category.LAUNCHER 1 | Out-Null
        Write-Host 'Launched on device.' -ForegroundColor Green
    }
}