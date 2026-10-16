$ErrorActionPreference = 'Stop'
$taskStateFile = Join-Path $PSScriptRoot 'server_state.json'
if (-not (Test-Path -LiteralPath $taskStateFile)) { Write-Output '没有本程序的服务记录。'; exit }
$taskState = Get-Content -LiteralPath $taskStateFile -Raw | ConvertFrom-Json
$taskProcess = Get-CimInstance Win32_Process -Filter ('ProcessId = ' + [int]$taskState.pid)
$taskServerPath = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot 'server.py'))
if ($null -eq $taskProcess) { Write-Output '服务已停止。'; exit }
if (-not $taskProcess.CommandLine.Contains($taskServerPath)) { throw '进程与本程序不匹配，未执行停止。' }
$taskWorkers = Get-CimInstance Win32_Process -Filter ('ParentProcessId = ' + [int]$taskState.pid)
foreach ($taskWorker in $taskWorkers) {
    if ($taskWorker.CommandLine.Contains((Join-Path $PSScriptRoot 'worker.py'))) { Stop-Process -Id $taskWorker.ProcessId }
}
Stop-Process -Id $taskProcess.ProcessId
Write-Output '裁切实验室已停止，数据与历史记录保留。'
