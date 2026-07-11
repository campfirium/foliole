!include "WinMessages.nsh"

!ifndef BUILD_UNINSTALLER
Function AddFolioleCliToUserPath
  Push $0
  Push $1
  Push $2
  Push $3
  Push $4
  ReadRegStr $0 HKCU "Environment" "Path"
  StrCpy $1 "$INSTDIR\bin"
  StrCpy $2 0
  StrCpy $3 ""

  addCliPathLoop:
    StrCpy $4 $0 1 $2
    StrCmp $4 "" addCliPathFinalSegment
    StrCmp $4 ";" addCliPathCompareSegment
    StrCpy $3 "$3$4"
    IntOp $2 $2 + 1
    Goto addCliPathLoop

  addCliPathCompareSegment:
    StrCmp $3 $1 addCliPathAlreadyInstalled
    StrCmp $3 "$1\" addCliPathAlreadyInstalled
    StrCpy $3 ""
    IntOp $2 $2 + 1
    Goto addCliPathLoop

  addCliPathFinalSegment:
    StrCmp $3 $1 addCliPathAlreadyInstalled
    StrCmp $3 "$1\" addCliPathAlreadyInstalled
    StrCmp $0 "" addCliPathWriteFirst
    StrCpy $4 $0 1 -1
    StrCmp $4 ";" 0 +2
      StrCpy $0 $0 -1
    StrCpy $0 "$0;$1"
    Goto addCliPathWrite

  addCliPathWriteFirst:
    StrCpy $0 $1

  addCliPathWrite:
    WriteRegExpandStr HKCU "Environment" "Path" $0
    SendMessage ${HWND_BROADCAST} ${WM_SETTINGCHANGE} 0 "STR:Environment" /TIMEOUT=5000

  addCliPathAlreadyInstalled:
    WriteRegStr HKCU "Software\Foliole\Cli" "InstalledBin" "$1"
    Pop $4
    Pop $3
    Pop $2
    Pop $1
    Pop $0
FunctionEnd
!endif

!ifdef BUILD_UNINSTALLER
Function un.RemoveFolioleCliFromUserPath
  Push $0
  Push $1
  Push $2
  Push $3
  Push $4
  Push $5
  ReadRegStr $0 HKCU "Environment" "Path"
  StrCpy $1 "$INSTDIR\bin"
  StrCpy $2 0
  StrCpy $3 ""
  StrCpy $5 ""

  removeCliPathLoop:
    StrCpy $4 $0 1 $2
    StrCmp $4 "" removeCliPathFinalSegment
    StrCmp $4 ";" removeCliPathAppendSegment
    StrCpy $3 "$3$4"
    IntOp $2 $2 + 1
    Goto removeCliPathLoop

  removeCliPathAppendSegment:
    StrCmp $3 $1 removeCliPathNextSegment
    StrCmp $3 "$1\" removeCliPathNextSegment
    StrCmp $3 "$\"$1$\"" removeCliPathNextSegment
    StrCmp $3 "" removeCliPathNextSegment
    StrCmp $5 "" removeCliPathAppendValue
    StrCpy $5 "$5;"
  removeCliPathAppendValue:
    StrCpy $5 "$5$3"

  removeCliPathNextSegment:
    StrCpy $3 ""
    IntOp $2 $2 + 1
    Goto removeCliPathLoop

  removeCliPathFinalSegment:
    StrCmp $3 $1 removeCliPathWrite
    StrCmp $3 "$1\" removeCliPathWrite
    StrCmp $3 "$\"$1$\"" removeCliPathWrite
    StrCmp $3 "" removeCliPathWrite
    StrCmp $5 "" removeCliPathAppendFinalValue
    StrCpy $5 "$5;"
  removeCliPathAppendFinalValue:
    StrCpy $5 "$5$3"

  removeCliPathWrite:
    WriteRegExpandStr HKCU "Environment" "Path" $5
    SendMessage ${HWND_BROADCAST} ${WM_SETTINGCHANGE} 0 "STR:Environment" /TIMEOUT=5000
    Pop $5
    Pop $4
    Pop $3
    Pop $2
    Pop $1
    Pop $0
FunctionEnd
!endif

!macro customInstall
  Call AddFolioleCliToUserPath
!ifndef FOLIOLE_CLI_SMOKE_ONLY
  WriteRegStr HKCU "Software\Classes\Foliole.Markdown" "" "Markdown Document"
  WriteRegStr HKCU "Software\Classes\Foliole.Markdown\DefaultIcon" "" "$INSTDIR\Foliole.exe,0"
  WriteRegStr HKCU "Software\Classes\Foliole.Markdown\shell" "" "open"
  WriteRegStr HKCU "Software\Classes\Foliole.Markdown\shell\open" "" "Open with Foliole"
  WriteRegStr HKCU "Software\Classes\Foliole.Markdown\shell\open\command" "" '"$INSTDIR\Foliole.exe" "%1"'
  WriteRegNone HKCU "Software\Classes\.md\OpenWithProgids" "Foliole.Markdown"
  WriteRegNone HKCU "Software\Classes\.markdown\OpenWithProgids" "Foliole.Markdown"

  WriteRegStr HKCU "Software\Classes\Applications\Foliole.exe" "FriendlyAppName" "Foliole"
  WriteRegStr HKCU "Software\Classes\Applications\Foliole.exe\shell\open\command" "" '"$INSTDIR\Foliole.exe" "%1"'
  WriteRegStr HKCU "Software\Classes\Applications\Foliole.exe\SupportedTypes" ".md" ""
  WriteRegStr HKCU "Software\Classes\Applications\Foliole.exe\SupportedTypes" ".markdown" ""

  WriteRegStr HKCU "Software\Foliole\Capabilities" "ApplicationName" "Foliole"
  WriteRegStr HKCU "Software\Foliole\Capabilities" "ApplicationDescription" "Open Markdown documents with Foliole."
  WriteRegStr HKCU "Software\Foliole\Capabilities\FileAssociations" ".md" "Foliole.Markdown"
  WriteRegStr HKCU "Software\Foliole\Capabilities\FileAssociations" ".markdown" "Foliole.Markdown"
  WriteRegStr HKCU "Software\RegisteredApplications" "Foliole" "Software\Foliole\Capabilities"
!endif
!macroend

!macro customUnInstall
  Call un.RemoveFolioleCliFromUserPath
!ifndef FOLIOLE_CLI_SMOKE_ONLY
  DeleteRegValue HKCU "Software\Classes\.md\OpenWithProgids" "Foliole.Markdown"
  DeleteRegValue HKCU "Software\Classes\.markdown\OpenWithProgids" "Foliole.Markdown"
  DeleteRegKey HKCU "Software\Classes\Foliole.Markdown"
  DeleteRegKey HKCU "Software\Classes\Applications\Foliole.exe"
  DeleteRegValue HKCU "Software\RegisteredApplications" "Foliole"
  DeleteRegKey HKCU "Software\Foliole\Capabilities"
  DeleteRegKey HKCU "Software\Foliole\Cli"
  DeleteRegKey /ifempty HKCU "Software\Foliole"
!endif
!macroend
