param(
  [int]$TimeoutSeconds = 60
)

$deadline = (Get-Date).AddSeconds($TimeoutSeconds)
do {
  $services = docker compose -f infra/docker-compose.yml ps --format json | ConvertFrom-Json
  $unhealthy = @($services | Where-Object { $_.Health -and $_.Health -ne 'healthy' })
  $running = @($services | Where-Object { $_.State -eq 'running' })
  if ($services.Count -ge 5 -and $unhealthy.Count -eq 0 -and $running.Count -ge 5) {
    Write-Output 'Vision Codef local foundation services are healthy.'
    exit 0
  }
  Start-Sleep -Seconds 2
} while ((Get-Date) -lt $deadline)

docker compose -f infra/docker-compose.yml ps
throw 'Timed out waiting for Vision Codef local foundation services.'
