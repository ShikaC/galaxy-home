!macro NSIS_HOOK_POSTUNINSTALL
  SetShellVarContext current
  Delete "$SMPROGRAMS\银河居所.lnk"
  Delete "$STARTMENU\银河居所.lnk"
  RMDir "$SMPROGRAMS\银河居所"
  RMDir "$STARTMENU\银河居所"
  Delete "$DESKTOP\银河居所.lnk"
  SetShellVarContext all
  Delete "$SMPROGRAMS\银河居所.lnk"
  Delete "$STARTMENU\银河居所.lnk"
  RMDir "$SMPROGRAMS\银河居所"
  RMDir "$STARTMENU\银河居所"
  Delete "$DESKTOP\银河居所.lnk"
  ${If} $UpdateMode <> 1
    DeleteRegKey HKCU "Software\galaxyhome\银河居所"
    DeleteRegKey /ifempty HKCU "Software\galaxyhome"
  ${EndIf}
!macroend
