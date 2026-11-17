Option Explicit

Dim fso, shell, env, artexHome, repoRoot, desktopDir, electronExe, command

Set fso = CreateObject("Scripting.FileSystemObject")
Set shell = CreateObject("WScript.Shell")
Set env = shell.Environment("PROCESS")

desktopDir = fso.GetParentFolderName(WScript.ScriptFullName)
repoRoot = fso.GetParentFolderName(desktopDir)
artexHome = fso.BuildPath(repoRoot, "dist\dev-run")
electronExe = fso.BuildPath(desktopDir, "node_modules\electron\dist\electron.exe")

If Not fso.FileExists(electronExe) Then
  MsgBox "Electron client not found:" & vbCrLf & electronExe, vbCritical, "Artex client"
  WScript.Quit 1
End If

env("ARTEX_HOME") = artexHome
shell.CurrentDirectory = desktopDir
command = Chr(34) & electronExe & Chr(34) & " ."
shell.Run command, 1, False
