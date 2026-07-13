# Run this ONCE as Administrator to register PostgreSQL as a Windows auto-start service.
# After this, PostgreSQL will start automatically on every reboot — no manual pg_ctl needed.

$PG_BIN  = "C:\Program Files\PostgreSQL\16\bin"
$PG_DATA = "C:\Program Files\PostgreSQL\16\data"

Write-Host "Registering PostgreSQL16 as a Windows service..." -ForegroundColor Cyan
& "$PG_BIN\pg_ctl.exe" register -N "PostgreSQL16" -D $PG_DATA -w

if ($?) {
    Set-Service -Name "PostgreSQL16" -StartupType Automatic
    Start-Service -Name "PostgreSQL16"
    Write-Host "Done. PostgreSQL16 service registered and set to auto-start." -ForegroundColor Green
    Write-Host "Your data at $PG_DATA will now persist across reboots automatically." -ForegroundColor Green
} else {
    Write-Host "Registration failed — make sure you are running this as Administrator." -ForegroundColor Red
}
