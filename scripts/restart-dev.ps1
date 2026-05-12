# 개발 서버 캐시를 정리하고 Next.js dev 서버를 다시 시작합니다.
param(
  [switch]$SkipStart
)

$ErrorActionPreference = "Stop"
$repo = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$port = 3000

$connections = Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue
$processIds = @($connections | Select-Object -ExpandProperty OwningProcess -Unique)
foreach ($processId in $processIds) {
  if ($processId -and $processId -ne $PID) {
    Stop-Process -Id $processId -Force -ErrorAction SilentlyContinue
  }
}

$nextPath = Resolve-Path (Join-Path $repo ".next") -ErrorAction SilentlyContinue
if ($nextPath) {
  $resolved = $nextPath.Path
  if (-not $resolved.StartsWith($repo, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "Refusing to delete outside repo: $resolved"
  }
  Remove-Item -LiteralPath $resolved -Recurse -Force
}

if ($SkipStart) {
  Write-Host "Chart Radar dev cache cleaned. Start skipped."
  exit 0
}

Set-Location $repo
npm.cmd run dev
