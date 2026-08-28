param(
  [int]$TimeoutSeconds = 60
)

$requiredServices = @('postgres', 'redis', 'qdrant', 'minio', 'temporal', 'livekit', 'livekit-egress')
$deadline = (Get-Date).AddSeconds($TimeoutSeconds)

function serviceName($service) {
  if ($service.Service) { return [string]$service.Service }
  return ([string]$service.Name -replace '-1$','')
}

function describeServices($services) {
  return ($services | ForEach-Object {
    $name = serviceName $_
    $health = if ($_.Health) { [string]$_.Health } else { 'none' }
    '{0}: state={1}, health={2}, exit={3}' -f $name, $_.State, $health, $_.ExitCode
  }) -join '; '
}

do {
  try {
    $services = @(docker compose -f infra/docker-compose.yml ps --format json | ConvertFrom-Json)
  } catch {
    $services = @()
  }

  $byName = @{}
  foreach ($service in $services) { $byName[(serviceName $service)] = $service }
  $missing = @($requiredServices | Where-Object { -not $byName.ContainsKey($_) })
  $notReady = @($requiredServices | Where-Object {
    $service = $byName[$_]
    $service -and ($service.State -ne 'running' -or ($service.Health -and $service.Health -ne 'healthy'))
  })
  $init = $byName['minio-init']
  $initReady = $init -and $init.State -eq 'exited' -and ([string]$init.ExitCode -eq '0')

  if ($missing.Count -eq 0 -and $notReady.Count -eq 0 -and $initReady) {
    Write-Output 'Vision Codef local foundation services are healthy; MinIO bucket initialization completed.'
    exit 0
  }

  if ((Get-Date) -ge $deadline) {
    docker compose -f infra/docker-compose.yml ps
    $missingText = if ($missing.Count) { $missing -join ', ' } else { 'none' }
    $notReadyText = if ($notReady.Count) { $notReady -join ', ' } else { 'none' }
    throw ('Timed out waiting for first-slice services. Missing: {0}. Not ready: {1}. MinIO init completed: {2}. Observed: {3}' -f $missingText, $notReadyText, $initReady, (describeServices $services))
  }

  Start-Sleep -Seconds 2
} while ($true)
