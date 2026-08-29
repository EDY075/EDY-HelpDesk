param([ValidateSet('windows.system.summary')][string]$ActionId)
# Test-only fixture, NOT in the production catalog. Creates one inert owned descendant.
$ErrorActionPreference='Stop'
[Console]::OutputEncoding=New-Object System.Text.UTF8Encoding($false)
$probe=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../../../../../storage/runtime/Edy.SleepProbe.exe'))
$info=New-Object Diagnostics.ProcessStartInfo
$info.FileName=$probe
$info.UseShellExecute=$false
$info.CreateNoWindow=$true
$child=[Diagnostics.Process]::Start($info)
[Console]::WriteLine((@{pid=$child.Id;rootPid=$PID} | ConvertTo-Json -Compress))
[Console]::Out.Flush()
Start-Sleep -Seconds 60
