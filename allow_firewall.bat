@echo off
echo Configuring Windows Firewall for AVARAN...
netsh advfirewall firewall add rule name="AVARAN_8000" dir=in action=allow protocol=tcp localport=8000 profile=any
netsh advfirewall firewall add rule name="AVARAN_8081" dir=in action=allow protocol=tcp localport=8081 profile=any
powershell -Command "Remove-NetFirewallRule -DisplayName 'Python' -ErrorAction SilentlyContinue"
echo.
echo ===================================================
echo AVARAN Ports 8000 and 8081 allowed successfully!
echo You can now connect from your physical phone.
echo ===================================================
pause
