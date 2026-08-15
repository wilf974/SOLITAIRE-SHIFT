# make-key.ps1 — create the app signing key, once.
#
#   .\make-key.ps1
#
# Produces solitaire-shift.keystore and the keystore.properties that
# build.ps1 -Release reads. Both are gitignored.
#
# WARNING: this key is irreplaceable. Google ties your app's identity to it.
# Lose it and you can never publish an update to the same listing again —
# you would have to publish a brand new app and lose every install and review.
# Back up BOTH the .keystore file and the passwords somewhere off this PC.

$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot

$keystore = 'solitaire-shift.keystore'
$alias    = 'solitaire'

if (Test-Path $keystore) {
    Write-Host ""
    Write-Host "  $keystore already exists." -ForegroundColor Yellow
    Write-Host "  Refusing to overwrite it: replacing a signing key breaks all future updates." -ForegroundColor Yellow
    Write-Host "  Delete it by hand only if you are certain it was never used to publish." -ForegroundColor Yellow
    Write-Host ""
    exit 1
}

$jdk = Get-ChildItem 'C:\Program Files\Eclipse Adoptium' -Directory -ErrorAction SilentlyContinue |
       Where-Object { $_.Name -like 'jdk-21*' } | Select-Object -First 1
if (-not $jdk) { throw 'JDK 21 not found. Run: winget install EclipseAdoptium.Temurin.21.JDK' }
$keytool = "$($jdk.FullName)\bin\keytool.exe"

Write-Host ""
Write-Host "  Creating the signing key for Solitaire Shift." -ForegroundColor Cyan
Write-Host "  Choose a password you will not lose. You will type it twice." -ForegroundColor Cyan
Write-Host ""

$pw1 = Read-Host 'Password' -AsSecureString
$pw2 = Read-Host 'Confirm ' -AsSecureString

$p1 = [Runtime.InteropServices.Marshal]::PtrToStringAuto(
        [Runtime.InteropServices.Marshal]::SecureStringToBSTR($pw1))
$p2 = [Runtime.InteropServices.Marshal]::PtrToStringAuto(
        [Runtime.InteropServices.Marshal]::SecureStringToBSTR($pw2))

if ($p1 -ne $p2)      { throw 'The two passwords do not match.' }
if ($p1.Length -lt 6) { throw 'Java requires at least 6 characters.' }

# -dname is filled in non-interactively: none of it is shown to players, and
# Google identifies the app by the key itself, not by these fields.
& $keytool -genkeypair -v `
    -keystore $keystore `
    -alias $alias `
    -keyalg RSA -keysize 2048 -validity 10000 `
    -storepass $p1 -keypass $p1 `
    -dname "CN=Solitaire Shift, OU=Games, O=Solitaire Shift, L=Paris, C=FR"

if ($LASTEXITCODE -ne 0) { throw "keytool failed ($LASTEXITCODE)" }

@"
storeFile=$keystore
storePassword=$p1
keyAlias=$alias
keyPassword=$p1
"@ | Out-File -FilePath 'keystore.properties' -Encoding ascii

Write-Host ""
Write-Host "  Created $keystore and keystore.properties" -ForegroundColor Green
Write-Host ""
Write-Host "  BACK THESE UP NOW, somewhere that is not this PC:" -ForegroundColor Yellow
Write-Host "    - $PSScriptRoot\$keystore"
Write-Host "    - the password you just chose"
Write-Host ""
Write-Host "  Without them you can never update the app on the Play Store." -ForegroundColor Yellow
Write-Host ""
Write-Host "  Next:  .\build.ps1 -Release" -ForegroundColor Cyan
Write-Host ""
