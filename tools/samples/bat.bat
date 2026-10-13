@echo off
REM build script
setlocal enabledelayedexpansion
set NAME=world
:loop
if "%1"=="" goto done
echo Hello, %NAME% and %1
shift
goto loop
:done
if exist build\out.log (type build\out.log) else (echo none)
exit /b 0
