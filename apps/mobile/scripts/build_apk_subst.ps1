$ErrorActionPreference = "Stop"
$projectRoot = "c:\Users\subad\Desktop\CERTIFICATES PROJECTS RESUMES IMPORTANT NOTES\SIH\S40 - Copy"
$mobileDir = "$projectRoot\apps\mobile"
$releaseDest = "$projectRoot\releases"

Write-Host "Unmounting any previous X: drive..."
cmd /c "subst X: /D 2>nul"

Write-Host "Mounting $mobileDir as X:..."
cmd /c "subst X: `"$mobileDir`""

try {
    Set-Location "X:\android"
    
    Write-Host "Running assembleRelease on short virtual drive X:\android..."
    cmd /c "set ANDROID_HOME=C:\Users\subad\AppData\Local\Android\Sdk&& gradlew.bat assembleRelease -x lint -x test"
    
    $apkSrc = "X:\android\app\build\outputs\apk\release\app-release.apk"
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
}
finally {
    Set-Location "$projectRoot"
    cmd /c "subst X: /D 2>nul"
    Write-Host "Unmounted X: drive."
}
