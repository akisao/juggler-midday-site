# 昼の速報: 取り込み → 公開・通知。タスクスケジューラから 12:00（のちに 16:40）に呼ぶ。
# -At には予定の時刻を渡す（報告に出すだけ）。公開の -At には「取り込みが終わった時刻」を渡す。
# ぱちタウンの途中データの時刻はサイトの更新時刻（例 12:03）で、それより前で区切ると入らないため
param([Parameter(Mandatory=$true)][string]$At)
$ErrorActionPreference = "Stop"
$site = $PSScriptRoot
$app = "C:\Users\Owner\juggler-analyzer-paste"

& "$app\.venv\Scripts\python.exe" -m juggler.cli midday-fetch --at $At --notify
$until = Get-Date -Format "HH:mm"
& "$site\publish.ps1" -At $until -Notify
exit $LASTEXITCODE
