#ifndef AppVersion
#define AppVersion "1.1.0"
#endif

#ifndef AppSource
#define AppSource "DesktopApp\bin\Release\net10.0-windows\publish\*"
#endif

[Setup]
AppName=Oxygen Low's Software
AppVersion={#AppVersion}
AppPublisher=Oxygen Low
DefaultDirName={localappdata}\OxygenLowsSoftware
DefaultGroupName=Oxygen Low's Software
OutputDir=Output
OutputBaseFilename=OxygenLowsSoftware_Installer
Compression=lzma2/ultra64
SolidCompression=yes
PrivilegesRequired=lowest
LicenseFile=EULA.txt
WizardStyle=modern

[Files]
; You will need to build the DesktopApp in Release mode and ensure this path points to the build output.
; For self-contained single-file apps, this would be a single exe.
Source: "{#AppSource}"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs skipifsourcedoesntexist

[Icons]
Name: "{group}\Oxygen Low's Software"; Filename: "{app}\DesktopApp.exe"
Name: "{autoprograms}\Oxygen Low's Software"; Filename: "{app}\DesktopApp.exe"

[Registry]
Root: HKCU; Subkey: "Software\OxygenLowsSoftware"; ValueType: string; ValueName: "InstallPath"; ValueData: "{app}"; Flags: uninsdeletekey
Root: HKCU; Subkey: "Software\OxygenLowsSoftware"; ValueType: string; ValueName: "Version"; ValueData: "1.1.0"; Flags: uninsdeletekey
; Clean up the URL scheme on uninstall, just like the original uninstaller did
Root: HKCU; Subkey: "Software\Classes\oxygenlows"; Flags: uninsdeletekey

[Run]
Filename: "{app}\DesktopApp.exe"; Description: "{cm:LaunchProgram,Oxygen Low's Software}"; Flags: nowait postinstall skipifsilent

[UninstallDelete]
Type: filesandordirs; Name: "{app}"
Type: filesandordirs; Name: "{userappdata}\OxygenLowsSoftware"

[Code]
procedure InitializeWizard;
begin
  // Set main wizard form colors to black
  WizardForm.Color := clBlack;
  WizardForm.Font.Color := clWhite;
  
  // Set individual page colors to black
  WizardForm.WelcomePage.Color := clBlack;
  WizardForm.InnerPage.Color := clBlack;
  WizardForm.FinishedPage.Color := clBlack;
  
  WizardForm.MainPanel.Color := clBlack;
  WizardForm.TasksList.Color := clBlack;
  WizardForm.TasksList.Font.Color := clWhite;
  
  WizardForm.ReadyMemo.Color := clBlack;
  WizardForm.ReadyMemo.Font.Color := clWhite;
  
  // Ensure labels and text are visible on the black background
  WizardForm.WelcomeLabel1.Font.Color := clWhite;
  WizardForm.WelcomeLabel2.Font.Color := clWhite;
  WizardForm.FinishedLabel.Font.Color := clWhite;
  WizardForm.FinishedHeadingLabel.Font.Color := clWhite;
  WizardForm.PageNameLabel.Font.Color := clWhite;
  WizardForm.PageDescriptionLabel.Font.Color := clWhite;
end;
