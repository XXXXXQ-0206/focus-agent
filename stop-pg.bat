@echo off
chcp 65001 >nul 2>&1
rem 停止本机自带的 PostgreSQL 17（fast 模式：断开连接后立即关闭）
cd /d "%~dp0"

"pgsql\bin\pg_ctl.exe" -D "%~dp0data\pgdata" stop -m fast
exit /b %ERRORLEVEL%
