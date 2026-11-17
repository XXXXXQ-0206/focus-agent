Option Explicit

Dim fso, shell, env, artexHome, repoRoot, desktopDir, electronExe, command

Set fso = CreateObject("Scripting.FileSystemObject")
Set shell = CreateObject("WScript.Shell")
Set env = shell.Environment("PROCESS")

desktopDir = fso.GetParentFolderName(WScript.ScriptFullName)
repoRoot = fso.GetParentFolderName(desktopDir)
artexHome = env("ARTEX_HOME")
If Trim(artexHome) = "" Then artexHome = fso.BuildPath(repoRoot, "dist\dev-run")
electronExe = fso.BuildPath(desktopDir, "node_modules\electron\dist\electron.exe")

If Not fso.FileExists(electronExe) Then
  MsgBox "Electron client not found:" & vbCrLf & electronExe, vbCritical, "Artex client"
  WScript.Quit 1
End If

If Not fso.FileExists(fso.BuildPath(artexHome, "artex.exe")) Or _
   Not fso.FileExists(fso.BuildPath(artexHome, "config.json")) Then
  MsgBox "Focus backend not found in:" & vbCrLf & artexHome & vbCrLf & vbCrLf & _
    "Build artex.exe and place it with config.json there, or set ARTEX_HOME before launching.", _
    vbCritical, "Focus backend missing"
  WScript.Quit 1
End If

env("ARTEX_HOME") = artexHome
shell.CurrentDirectory = desktopDir
command = Chr(34) & electronExe & Chr(34) & " ."
shell.Run command, 1, False
