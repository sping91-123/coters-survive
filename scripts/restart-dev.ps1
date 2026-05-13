# 개발 서버 캐시를 정리하고 Next.js dev 서버를 다시 시작합니다.
param(
  [switch]$SkipStart
)

$ErrorActionPreference = "Stop"
$repo = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$port = 3000

function Remove-DirectoryWithRetry {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Path,
    [int]$Attempts = 5,
    [int]$DelayMs = 400
  )

  for ($attempt = 1; $attempt -le $Attempts; $attempt += 1) {
    try {
      Remove-Item -LiteralPath $Path -Recurse -Force -ErrorAction Stop
      return
    } catch {
      if ($attempt -eq $Attempts) {
        throw
      }
      Start-Sleep -Milliseconds $DelayMs
    }
  }
}

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
  Remove-DirectoryWithRetry -Path $resolved
}

if ($SkipStart) {
  Write-Host "Chart Radar dev cache cleaned. Start skipped."
  exit 0
}

$outLog = Join-Path $repo "dev-server.out.log"
$errLog = Join-Path $repo "dev-server.err.log"
Remove-Item -LiteralPath $outLog, $errLog -ErrorAction SilentlyContinue

Start-Process `
  -FilePath "npm.cmd" `
  -ArgumentList "run", "dev" `
  -WorkingDirectory $repo `
  -RedirectStandardOutput $outLog `
  -RedirectStandardError $errLog `
  -WindowStyle Hidden

Write-Host "Chart Radar dev server restarted at http://127.0.0.1:3000"
