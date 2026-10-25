; VDGS Slot Board – installer for the MSFS bridge (Inno Setup 6).
; Build: put VDGS-Bridge.exe (PyInstaller, see ANLEITUNG-BRIDGE.md) next to this file, then
;   ISCC.exe VDGS-Setup.iss      ->  Output\VDGS-Setup.exe

#define AppVer "1.0.0"

[Setup]
AppId={{CB41B736-8654-42DA-BAC6-3E61CC9E8C60}
AppName=VDGS Slot Board Bridge
AppVersion={#AppVer}
AppVerName=VDGS Slot Board Bridge {#AppVer}
AppPublisher=VDGS Slot Board (Community, inoffiziell)
AppPublisherURL=https://github.com/sbelic95/vdgs-slot-board
AppSupportURL=https://github.com/sbelic95/vdgs-slot-board/issues
DefaultDirName={autopf}\VDGS Bridge
DefaultGroupName=VDGS Bridge
DisableProgramGroupPage=yes
; admin: Program Files and the firewall rule for the home network
PrivilegesRequired=admin
UsedUserAreasWarning=no
OutputDir=Output
OutputBaseFilename=VDGS-Setup
SetupIconFile=icon.ico
UninstallDisplayIcon={app}\VDGS-Bridge.exe
Compression=lzma2/max
SolidCompression=yes
WizardStyle=modern
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
MinVersion=10.0

[Languages]
Name: "de"; MessagesFile: "compiler:Languages\German.isl"; InfoBeforeFile: "info-de.txt"
Name: "en"; MessagesFile: "compiler:Default.isl"; InfoBeforeFile: "info-en.txt"

[CustomMessages]
de.Bridge=VDGS Bridge
en.Bridge=VDGS Bridge
de.BridgeTest=VDGS Bridge (Testmodus ohne Simulator)
en.BridgeTest=VDGS Bridge (test mode, no simulator)
de.Guide=Anleitung
en.Guide=Guide
de.Licenses=Datenschutz und Lizenzen
en.Licenses=Privacy and licenses
de.WebApp=VDGS im Browser (ohne Bridge)
en.WebApp=VDGS in the browser (no bridge)
de.Firewall=Zugriff aus dem Heimnetz erlauben (Firewall, nur private Netzwerke)
en.Firewall=Allow access from the home network (firewall, private networks only)
de.StartNow=VDGS Bridge jetzt starten
en.StartNow=Start VDGS Bridge now

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"
Name: "firewall"; Description: "{cm:Firewall}"

[Files]
Source: "VDGS-Bridge.exe"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\ANLEITUNG-BRIDGE.md"; DestDir: "{app}"; DestName: "ANLEITUNG.txt"; Flags: ignoreversion
Source: "..\..\LIZENZEN.md"; DestDir: "{app}"; DestName: "LIZENZEN.txt"; Flags: ignoreversion

[Icons]
Name: "{group}\{cm:Bridge}"; Filename: "{app}\VDGS-Bridge.exe"
Name: "{group}\{cm:BridgeTest}"; Filename: "{app}\VDGS-Bridge.exe"; Parameters: "--test"
Name: "{group}\{cm:Guide}"; Filename: "{app}\ANLEITUNG.txt"
Name: "{group}\{cm:Licenses}"; Filename: "{app}\LIZENZEN.txt"
Name: "{group}\{cm:WebApp}"; Filename: "https://sbelic95.github.io/vdgs-slot-board/"
Name: "{group}\{cm:UninstallProgram,VDGS Bridge}"; Filename: "{uninstallexe}"
Name: "{autodesktop}\{cm:Bridge}"; Filename: "{app}\VDGS-Bridge.exe"; Tasks: desktopicon

[Run]
; inbound rule only for this program and only on private networks (home Wi-Fi), never public ones
Filename: "{sys}\netsh.exe"; Parameters: "advfirewall firewall delete rule name=""VDGS Bridge"""; Flags: runhidden; Tasks: firewall
Filename: "{sys}\netsh.exe"; Parameters: "advfirewall firewall add rule name=""VDGS Bridge"" dir=in action=allow program=""{app}\VDGS-Bridge.exe"" enable=yes profile=private"; Flags: runhidden; Tasks: firewall
Filename: "{app}\VDGS-Bridge.exe"; Description: "{cm:StartNow}"; Flags: postinstall nowait skipifsilent

[UninstallRun]
Filename: "{sys}\taskkill.exe"; Parameters: "/F /IM VDGS-Bridge.exe"; Flags: runhidden; RunOnceId: "StopBridge"
Filename: "{sys}\netsh.exe"; Parameters: "advfirewall firewall delete rule name=""VDGS Bridge"""; Flags: runhidden; RunOnceId: "DelFirewall"

[UninstallDelete]
; the app copy the bridge downloads (no personal data: settings stay in the tablet's browser)
Type: filesandordirs; Name: "{localappdata}\VDGS-Bridge"
