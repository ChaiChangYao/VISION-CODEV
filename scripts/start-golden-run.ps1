param(
  [switch]$SkipBuild,
  [switch]$Restart,
  [int]$TimeoutSeconds = 120
)

$ErrorActionPreference = 'Stop'
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$runRoot = Join-Path $projectRoot '.run'
$pidRoot = Join-Path $runRoot 'pids'
$logRoot = Join-Path $runRoot 'logs'
New-Item -ItemType Directory -Force -Path $pidRoot, $logRoot | Out-Null

function Import-DotEnv([string]$path) {
  foreach ($line in Get-Content -LiteralPath $path) {
    $trimmed = $line.Trim()
    if (-not $trimmed -or $trimmed.StartsWith('#') -or -not $trimmed.Contains('=')) { continue }
    $parts = $trimmed.Split('=', 2)
    [Environment]::SetEnvironmentVariable($parts[0].Trim(), $parts[1].Trim().Trim('"').Trim("'"), 'Process')
  }
}

function Stop-Managed([string]$name) {
  $pidPath = Join-Path $pidRoot "$name.pid"
  if (-not (Test-Path -LiteralPath $pidPath)) { return }
  $savedPid = [int](Get-Content -LiteralPath $pidPath)
  $process = Get-CimInstance Win32_Process -Filter "ProcessId = $savedPid" -ErrorAction SilentlyContinue
  $markers = @{ api = 'apps/api/dist/server.js'; 'local-processing' = 'services/local-processing/dist/server.js'; worker = 'apps/worker/dist/temporal-worker.js'; web = 'node_modules/next/dist/bin/next' }
  $commandLine = [string]$process.CommandLine
  if ($process -and ($commandLine.Contains($projectRoot) -or $commandLine.Contains([string]$markers[$name]))) {
    Stop-Process -Id $savedPid -Force
    Wait-Process -Id $savedPid -ErrorAction SilentlyContinue
  }
  if (-not $process -or -not (Get-Process -Id $savedPid -ErrorAction SilentlyContinue)) { Remove-Item -LiteralPath $pidPath -Force -ErrorAction SilentlyContinue }
}

function Test-Url([string]$url) {
  try { $response = Invoke-WebRequest -UseBasicParsing -Uri $url -TimeoutSec 3; return $response.StatusCode -ge 200 -and $response.StatusCode -lt 300 }
  catch { return $false }
}

function Start-ManagedNode([string]$name, [string]$entrypoint, [string]$healthUrl, [string]$workingDirectory = $projectRoot, [string]$entrypointArgument = '') {
  if (Test-Url $healthUrl) { Write-Output "$name already healthy at $healthUrl"; return }
  $stdout = Join-Path $logRoot "$name.out.log"
  $stderr = Join-Path $logRoot "$name.err.log"
  $arguments = @($entrypoint)
  if ($entrypointArgument) { $arguments += $entrypointArgument }
  $process = Start-Process -FilePath (Get-Command node).Source -ArgumentList $arguments -WorkingDirectory $workingDirectory -WindowStyle Hidden -RedirectStandardOutput $stdout -RedirectStandardError $stderr -PassThru
  Set-Content -LiteralPath (Join-Path $pidRoot "$name.pid") -Value $process.Id
}

function Wait-Healthy([string]$name, [string]$url, [datetime]$deadline) {
  while ((Get-Date) -lt $deadline) {
    if (Test-Url $url) { Write-Output "$name healthy at $url"; return }
    Start-Sleep -Seconds 2
  }
  $errorLog = Join-Path $logRoot "$name.err.log"
  if (Test-Path -LiteralPath $errorLog) { Get-Content -LiteralPath $errorLog -Tail 30 }
  throw "$name did not become healthy at $url"
}

Import-DotEnv (Join-Path $projectRoot '.env')
Set-Location $projectRoot

if ($Restart) { @('api', 'local-processing', 'worker', 'web') | ForEach-Object { Stop-Managed $_ } }

docker compose -f infra/docker-compose.yml up -d
& (Join-Path $projectRoot 'infra/healthcheck.ps1') -TimeoutSeconds $TimeoutSeconds

if (-not $SkipBuild) {
  pnpm --filter @vision-codef/api build
  if ($LASTEXITCODE) { throw 'API build failed.' }
  pnpm --filter @vision-codef/worker build
  if ($LASTEXITCODE) { throw 'Worker build failed.' }
  pnpm --filter @vision-codef/local-processing build
  if ($LASTEXITCODE) { throw 'Local processing build failed.' }
  pnpm --filter @vision-codef/realtime-guidance build
  if ($LASTEXITCODE) { throw 'Realtime guidance build failed.' }
  $webBuildOutput = Join-Path $projectRoot 'apps/web/.next'
  $webRoot = (Resolve-Path -LiteralPath (Join-Path $projectRoot 'apps/web')).Path
  if (Test-Path -LiteralPath $webBuildOutput) {
    $resolvedWebBuildOutput = (Resolve-Path -LiteralPath $webBuildOutput).Path
    if (-not $resolvedWebBuildOutput.StartsWith($webRoot + [IO.Path]::DirectorySeparatorChar)) { throw 'Refusing to clear an unexpected web build path.' }
    Remove-Item -LiteralPath $resolvedWebBuildOutput -Recurse -Force
  }
  $buildNodeEnv = $env:NODE_ENV
  $env:NODE_ENV = 'production'
  pnpm --filter @vision-codef/web build
  $env:NODE_ENV = $buildNodeEnv
  if ($LASTEXITCODE) { throw 'Web build failed.' }
}

Start-ManagedNode 'api' 'apps/api/dist/server.js' 'http://127.0.0.1:4000/health'
Start-ManagedNode 'local-processing' 'services/local-processing/dist/server.js' 'http://127.0.0.1:8092/health'
Start-ManagedNode 'worker' 'apps/worker/dist/temporal-worker.js' 'http://127.0.0.1:8093/health'

if (-not (Test-Url 'http://127.0.0.1:3000')) {
  $applicationPort = $env:PORT; $applicationNodeEnv = $env:NODE_ENV
  $env:PORT = '3000'; $env:NODE_ENV = 'production'
  Start-ManagedNode 'web' 'node_modules/next/dist/bin/next' 'http://127.0.0.1:3000' (Join-Path $projectRoot 'apps/web') 'start'
  $env:PORT = $applicationPort; $env:NODE_ENV = $applicationNodeEnv
}

$deadline = (Get-Date).AddSeconds($TimeoutSeconds)
Wait-Healthy 'API' 'http://127.0.0.1:4000/health' $deadline
Wait-Healthy 'Local processing' 'http://127.0.0.1:8092/health' $deadline
Wait-Healthy 'Temporal worker' 'http://127.0.0.1:8093/health' $deadline
Wait-Healthy 'Web UI' 'http://127.0.0.1:3000' $deadline
Write-Output "Golden Run stack is ready. Logs: $logRoot"
