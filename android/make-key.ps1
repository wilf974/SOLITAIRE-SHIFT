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

function Read-Plain([Security.SecureString] $secure) {
    $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
    try   { return [Runtime.InteropServices.Marshal]::PtrToStringAuto($bstr) }
    finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr) }
}

$p1 = Read-Plain $pw1
$p2 = Read-Plain $pw2

if ($p1 -ne $p2) { throw 'The two passwords do not match.' }
# Java's own floor is 6, but this key guards the app's identity for its whole
# lifetime and cannot be rotated, so hold it to a real length.
if ($p1.Length -lt 12) {
    throw 'Use at least 12 characters: this key can never be replaced once the app is published.'
}

# The password goes to keytool on STDIN, never as an argument: command lines
# are readable by any other process on the machine (and land in shell history).
# -dname is filled in non-interactively; none of it is shown to players, and
# Google identifies the app by the key itself, not by these fields.
$keytoolArgs = @(
    '-genkeypair', '-v',
    '-keystore', $keystore,
    '-alias', $alias,
    '-keyalg', 'RSA', '-keysize', '2048', '-validity', '10000',
    '-dname', 'CN=Solitaire Shift, OU=Games, O=Solitaire Shift, L=Paris, C=FR'
)
# keytool prompts for the store password twice, then the key password.
# An empty third line reuses the store password for the key.
"$p1`n$p1`n`n" | & $keytool @keytoolArgs

if ($LASTEXITCODE -ne 0) { throw "keytool failed ($LASTEXITCODE)" }

# keystore.properties holds the password in clear text, because that is the
# only format Gradle reads. It is gitignored, but make it unreadable to other
# accounts on this machine as well.
@"
storeFile=$keystore
storePassword=$p1
keyAlias=$alias
keyPassword=$p1
"@ | Out-File -FilePath 'keystore.properties' -Encoding ascii

foreach ($f in @('keystore.properties', $keystore)) {
    $acl = Get-Acl $f
    $acl.SetAccessRuleProtection($true, $false)   # drop inherited permissions
    $acl.SetAccessRule((New-Object Security.AccessControl.FileSystemAccessRule(
        "$env:USERDOMAIN\$env:USERNAME", 'FullControl', 'Allow')))
    Set-Acl -Path $f -AclObject $acl
}

# don't leave the password sitting in a PowerShell variable
$p1 = $null; $p2 = $null
[GC]::Collect()

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
