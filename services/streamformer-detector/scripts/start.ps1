param(
  [ValidateSet('streamformer', 'statistical')]
  [string]$Backend = 'streamformer'
)

$ErrorActionPreference = 'Stop'
$serviceRoot = Split-Path -Parent $PSScriptRoot
$env:STREAMFORMER_BACKEND = $Backend
$pythonPath = if ($Backend -eq 'streamformer') {
  Join-Path $serviceRoot '.venv\Scripts\python.exe'
} else {
  (Get-Command python).Source
}
if (-not (Test-Path -LiteralPath $pythonPath)) {
  throw "Python runtime not found at $pythonPath. Run scripts/setup.ps1 first."
}
Push-Location $serviceRoot
try {
  & $pythonPath -m streamformer_detector.server
} finally {
  Pop-Location
}
