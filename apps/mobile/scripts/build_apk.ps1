# Standalone Release APK Builder for Windows
$ErrorActionPreference = "Stop"

$src = "c:\Users\subad\Desktop\CERTIFICATES PROJECTS RESUMES IMPORTANT NOTES\SIH\S40 - Copy\apps\mobile"
$dst = "C:\tmp\s40_android"
$releaseDest = "c:\Users\subad\Desktop\CERTIFICATES PROJECTS RESUMES IMPORTANT NOTES\SIH\S40 - Copy\releases"

Write-Host "Step 1: Exporting optimized Hermes JS bundle..."
Set-Location "$src"
cmd /c "npx expo export --platform android"

$bundleFile = (Get-ChildItem "$src\dist\_expo\static\js\android\*.hbc" | Select-Object -First 1).FullName

Write-Host "Step 2: Syncing mobile project and native code to short path: $dst"
if (!(Test-Path $dst)) {
    New-Item -ItemType Directory -Path $dst -Force | Out-Null
}

robocopy "$src" "$dst" /E /XD .gradle build android\.gradle android\app\build android\.cxx /R:1 /W:1

# Place pre-bundled JS directly into Android assets
$assetsDir = "$dst\android\app\src\main\assets"
if (!(Test-Path $assetsDir)) {
    New-Item -ItemType Directory -Path $assetsDir -Force | Out-Null
}
Copy-Item $bundleFile "$assetsDir\index.android.bundle" -Force
Write-Host "Injected pre-bundled index.android.bundle into Android assets."

$env:ANDROID_HOME = "C:\Users\subad\AppData\Local\Android\Sdk"
$env:PATH = "C:\Users\subad\AppData\Local\Android\Sdk\platform-tools;" + $env:PATH

Set-Location "$dst\android"

Write-Host "Step 3: Compiling standalone release APK with Gradle..."
cmd /c "gradlew.bat assembleRelease -x lint -x test -x createBundleReleaseJsAndAssets"

$apkSrc = "$dst\android\app\build\outputs\apk\release\app-release.apk"
if (Test-Path $apkSrc) {
    if (!(Test-Path $releaseDest)) {
        New-Item -ItemType Directory -Path $releaseDest -Force | Out-Null
    }
    Copy-Item $apkSrc "$releaseDest\AVARAN.apk" -Force
    $size = (Get-Item "$releaseDest\AVARAN.apk").Length
    Write-Host "SUCCESS: Standalone APK built and copied to $releaseDest\AVARAN.apk ($size bytes)"
} else {
    Write-Error "APK build output not found at $apkSrc"
}
