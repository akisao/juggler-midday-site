# 昼の速報を書き出して公開する。12時・17時の取り込みのあとに1回叩く。
# 書き出しは禁止項目があると何も書かずに止まる。そのときは push もしない。
param([string]$At = (Get-Date -Format "HH:mm"), [switch]$Notify)
$ErrorActionPreference = "Stop"
$site = $PSScriptRoot
$app = "C:\Users\Owner\juggler-analyzer-paste"

# $args は PowerShell の予約された変数なので別の名前にする
$pyArgs = @("-m", "juggler.cli", "midday", "--at", $At, "--out", "$site\data")
if ($Notify) { $pyArgs += "--notify" }
& "$app\.venv\Scripts\python.exe" @pyArgs
if ($LASTEXITCODE -ne 0) { Write-Host "行が無いか書き出しに失敗したので公開しません"; exit 1 }

git -C $site add -A
$changed = git -C $site status --porcelain
if (-not $changed) { Write-Host "変更なし"; exit 0 }
git -C $site commit -q -m ("速報 " + (Get-Date -Format "yyyy-MM-dd HH:mm"))
git -C $site push
Write-Host "公開しました。数分で反映されます"