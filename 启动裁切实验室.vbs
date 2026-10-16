Option Explicit
Dim fso, shell, root, py, url, req, ready, i
Set fso = CreateObject("Scripting.FileSystemObject")
Set shell = CreateObject("WScript.Shell")
root = fso.GetParentFolderName(WScript.ScriptFullName)
py = root & "\.venv\Scripts\pythonw.exe"
If Not fso.FileExists(py) Then py = fso.GetParentFolderName(root) & "\nesting_20261015\.venv\Scripts\pythonw.exe"
If Not fso.FileExists(py) Then
  MsgBox "未找到本地 Python 环境，请查看使用说明中的环境配置。", 48, "裁切实验室"
  WScript.Quit 1
End If
url = "http://127.0.0.1:8767"
ready = False
On Error Resume Next
Set req = CreateObject("MSXML2.ServerXMLHTTP.6.0")
req.setTimeouts 1000, 1000, 1000, 1000
req.Open "GET", url & "/api/health", False
req.Send
If Err.Number = 0 Then
  If req.Status = 200 Then ready = InStr(req.responseText, "engine_version") > 0
End If
Err.Clear
On Error GoTo 0
If Not ready Then
  shell.Run Chr(34) & py & Chr(34) & " " & Chr(34) & root & "\server.py" & Chr(34), 0, False
  For i = 1 To 20
    WScript.Sleep 500
    On Error Resume Next
    req.Open "GET", url & "/api/health", False
    req.Send
    If Err.Number = 0 Then
      If req.Status = 200 Then ready = InStr(req.responseText, "engine_version") > 0
    End If
    Err.Clear
    On Error GoTo 0
    If ready Then Exit For
  Next
End If
If ready Then
  shell.Run url, 1, False
Else
  MsgBox "本地服务未能启动。请查看使用说明；端口 8767 可能被占用。", 48, "裁切实验室"
End If
