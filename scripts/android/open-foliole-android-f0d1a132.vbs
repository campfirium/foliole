Set shell = CreateObject("WScript.Shell")
shell.CurrentDirectory = "C:\tmp\scrcpy\scrcpy-win64-v3.3.4"
shell.Run """C:\tmp\scrcpy\scrcpy-win64-v3.3.4\scrcpy.exe"" --serial f0d1a132 --stay-awake --window-title ""Foliole Android f0d1a132""", 1, False
