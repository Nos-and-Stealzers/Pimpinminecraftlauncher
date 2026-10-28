; Keep the upstream assisted installer, identity, registry and updater protocol.
; Only replace the unsafe blanket file removal and add retention information.
!ifdef DELETE_APP_DATA_ON_UNINSTALL
  !error "Pimpin must never enable application data deletion"
!endif
!ifndef APP_64
  !error "Pimpin installer currently supports the configured x64 archive only"
!endif
!tempfile PIMPIN_PAYLOAD_MANIFEST
!system 'node "${BUILD_RESOURCES_DIR}\installer-manifest.js" "${APP_64}" "${PIMPIN_PAYLOAD_MANIFEST}"' = 0
!include "${PIMPIN_PAYLOAD_MANIFEST}"
!delfile "${PIMPIN_PAYLOAD_MANIFEST}"
!undef PIMPIN_PAYLOAD_MANIFEST

!ifdef BUILD_UNINSTALLER
Function un.pimpinRestoreFiles
  !insertmacro pimpinRestorePackagedFiles
FunctionEnd
!endif

!macro customWelcomePage
  !insertmacro skipPageIfUpdated
  !define MUI_WELCOMEPAGE_TEXT "Install the Pimpin Launcher application.$\r$\n$\r$\nThe installation folder contains the launcher, not your game data. Worlds, accounts, instances, settings and cache are retained when you uninstall.$\r$\n$\r$\nDefault game data: %APPDATA%\.pimpinlauncher$\r$\nA PIMPIN_ROOT override uses its own folder."
  !insertmacro MUI_PAGE_WELCOME
!macroend

!macro customUnWelcomePage
  !define MUI_WELCOMEPAGE_TEXT "Remove the Pimpin Launcher application and its shortcuts.$\r$\n$\r$\nYour worlds, accounts, instances, settings and cache will be retained. There is no delete-data option.$\r$\n$\r$\nDefault game data: %APPDATA%\.pimpinlauncher$\r$\nA PIMPIN_ROOT override uses its own folder, which is also retained. Reinstall to use your data again."
  !insertmacro MUI_UNPAGE_WELCOME
!macroend

!macro customUnInit
  ; false in configuration does NOT disable upstream's command-line override.
  ClearErrors
  ${GetParameters} $R0
  ${GetOptions} $R0 "--delete-app-data" $R1
  ${IfNot} ${Errors}
    IfSilent +2
      MessageBox MB_OK|MB_ICONSTOP "Data deletion is not supported. Run the uninstaller without the data-deletion argument."
    SetErrorLevel 2
    Abort
  ${EndIf}
!macroend

!macro pimpinCheckDirectory RELATIVE
  ; Do not traverse directory junctions/symlinks into a custom data folder.
  System::Call 'kernel32::GetFileAttributesW(w "$INSTDIR${RELATIVE}") i .r0'
  ${If} $0 != -1
    IntOp $0 $0 & 0x400
    ${If} $0 != 0
      SetErrorLevel 2
      Abort "The application folder contains a directory link. No application files were removed."
    ${EndIf}
  ${EndIf}
!macroend

!macro pimpinCheckFile RELATIVE
  System::Call 'kernel32::GetFileAttributesW(w "$INSTDIR\${RELATIVE}") i .r0'
  ${If} $0 != -1
    IntOp $0 $0 & 0x10
    ${If} $0 != 0
      SetErrorLevel 2
      Abort "An application file was replaced by a directory. No application files were removed."
    ${EndIf}
  ${EndIf}
!macroend

!macro pimpinMoveFile RELATIVE
  ${If} ${FileExists} "$INSTDIR\${RELATIVE}"
    ClearErrors
    Rename "$INSTDIR\${RELATIVE}" "$PLUGINSDIR\pimpin-old\${RELATIVE}"
    ${If} ${Errors}
      Call un.pimpinRestoreFiles
      SetErrorLevel 2
      Abort "An application file could not be moved. Close the launcher and try again."
    ${EndIf}
  ${EndIf}
!macroend

!macro customRemoveFiles
  ; Same transaction for upgrades and manual removal: only exact payload paths.
  ; The stock recursive atomicRMDir/RMDir would remove user-created data too.
  InitPluginsDir
  !insertmacro pimpinCheckDirectory ""
  !insertmacro pimpinCheckPackagedDirectories
  !insertmacro pimpinCheckPackagedFiles
  CreateDirectory "$PLUGINSDIR\pimpin-old"
  !insertmacro pimpinMovePackagedFiles
  ; NSIS runs its uninstaller from a temporary copy. Never use wildcards here.
  ${If} ${FileExists} "$INSTDIR\${UNINSTALL_FILENAME}"
    ClearErrors
    Delete "$INSTDIR\${UNINSTALL_FILENAME}"
    ${If} ${Errors}
      Call un.pimpinRestoreFiles
      SetErrorLevel 2
      Abort "The uninstaller file could not be removed. Close the launcher and try again."
    ${EndIf}
  ${EndIf}
  !insertmacro pimpinRemoveEmptyDirectories
  SetOutPath $TEMP
  RMDir "$INSTDIR"
!macroend
