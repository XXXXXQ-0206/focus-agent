@echo off
chcp 65001 >nul 2>&1
rem 启动本机自带的 PostgreSQL 17（端口 5433，仅监听 127.0.0.1）
rem 数据目录：%~dp0data\pgdata    日志：%~dp0data\pg.log
cd /d "%~dp0"

if not exist "data\pgdata\PG_VERSION" (
	echo [pg] 找不到 data\pgdata，仓库未初始化数据库集群。
	exit /b 1
)

"pgsql\bin\pg_isready.exe" -h 127.0.0.1 -p 5433 -q
if not errorlevel 1 (
	echo [pg] 已在运行（127.0.0.1:5433）
	exit /b 0
)

"pgsql\bin\pg_ctl.exe" -D "%~dp0data\pgdata" -l "%~dp0data\pg.log" start
exit /b %ERRORLEVEL%
