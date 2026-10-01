# 昼の速報を書き出して公開する。12時・17時の取り込みのあとに1回叩く。
# 書き出しは禁止項目があると何も書かずに止まる。そのときは push もしない。
# -At は必須。省略して現在時刻を使うと 1207 のような回ができ、「12時」ボタンと重複するため
# -Slot は回の名前（予定の時刻 12:00 / 17:00）。長引いて時をまたいでもボタンが「12時」「17時」のままになる
param([Parameter(Mandatory=$true)][string]$At, [string]$Slot, [switch]$Notify)
$ErrorActionPreference = "Stop"
$site = $PSScriptRoot
$app = "C:\Users\Owner\juggler-analyzer-paste"

# $args は PowerShell の予約された変数なので別の名前にする
$pyArgs = @("-m", "juggler.cli", "midday", "--at", $At, "--out", "$site\data")
if ($Slot) { $pyArgs += @("--slot", $Slot) }
if ($Notify) { $pyArgs += "--notify" }
& "$app\.venv\Scripts\python.exe" @pyArgs
if ($LASTEXITCODE -ne 0) { Write-Host "行が無いか書き出しに失敗したので公開しません"; exit 1 }

git -C $site add -A
$changed = git -C $site status --porcelain
if (-not $changed) { Write-Host "変更なし"; exit 0 }
git -C $site commit -q -m ("速報 " + (Get-Date -Format "yyyy-MM-dd HH:mm"))
if ($LASTEXITCODE -ne 0) { Write-Host "コミットに失敗しました"; exit 1 }
git -C $site push
if ($LASTEXITCODE -ne 0) { Write-Host "push に失敗しました（公開されていません）"; exit 1 }
Write-Host "公開しました。数分で反映されます"
