@echo off
chcp 65001 >nul 2>&1
rem ARTEX 一键启动：先确保本地 PostgreSQL 在跑，再把 artex.exe 交给 start.bat 守护。
rem 参数原样透传给 artex.exe，例如： start-artex.bat -addr 0.0.0.0:8787
cd /d "%~dp0"

if not exist "artex.exe" (
	echo [artex] 找不到 artex.exe，请先编译： go build -tags embedui -o artex.exe ./cmd/artex
	exit /b 1
)

"pgsql\bin\pg_isready.exe" -h 127.0.0.1 -p 5433 -q
if errorlevel 1 (
	echo [artex] 本地 PostgreSQL 未运行，正在启动…
	"pgsql\bin\pg_ctl.exe" -D "%~dp0data\pgdata" -l "%~dp0data\pg.log" start
)

call "%~dp0start.bat" %*
