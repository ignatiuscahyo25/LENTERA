@echo off
setlocal
cd /d "%~dp0"
where py >nul 2>nul
if errorlevel 1 goto use_python
py -3 "%~dp0launch_lentera.py" %*
goto finished
:use_python
python "%~dp0launch_lentera.py" %*
:finished
if errorlevel 1 (
  echo.
  echo LENTERA belum dapat dibuka. Lihat pesan di atas.
  pause
)
endlocal
