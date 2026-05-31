!macro customInstall
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
!macroend

!macro customUnInstall
  DeleteRegValue HKCU "Software\Classes\.md\OpenWithProgids" "Foliole.Markdown"
  DeleteRegValue HKCU "Software\Classes\.markdown\OpenWithProgids" "Foliole.Markdown"
  DeleteRegKey HKCU "Software\Classes\Foliole.Markdown"
  DeleteRegKey HKCU "Software\Classes\Applications\Foliole.exe"
  DeleteRegValue HKCU "Software\RegisteredApplications" "Foliole"
  DeleteRegKey HKCU "Software\Foliole\Capabilities"
  DeleteRegKey /ifempty HKCU "Software\Foliole"
!macroend
