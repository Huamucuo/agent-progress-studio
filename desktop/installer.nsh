; Remove only the opt-in registration for this installation's exact EXE.
!macro customUnInstall
  ReadRegStr $0 HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "Agent Progress Studio Desktop"
  StrCmp $0 '"$INSTDIR\AgentProgressStudio.exe" --aps-start-hidden' 0 +2
    DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "Agent Progress Studio Desktop"
!macroend
