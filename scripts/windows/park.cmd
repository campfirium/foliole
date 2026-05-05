@echo off
REM ---------------------------------------------------------------
REM park.cmd - Signal the agent to stop after current task completes
REM
REM Usage:  park          (create stop signal)
REM         park clear    (remove stop signal, resume agent)
REM ---------------------------------------------------------------

set "FLAG=%~dp0..\..\.lab\agent\park.flag"

if /i "%~1"=="clear" (
    if exist "%FLAG%" (
        del "%FLAG%"
        echo [park] Stop signal cleared. Agent will resume normal execution.
    ) else (
        echo [park] No stop signal found. Nothing to clear.
    )
    goto :eof
)

echo PARK> "%FLAG%"
echo [park] Stop signal written to .lab/agent/park.flag
echo [park] Agent will stop after completing its current task.
echo [park] To resume: park clear
