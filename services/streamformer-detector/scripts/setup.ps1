param(
  [ValidateSet('cpu', 'cuda')]
  [string]$Device = 'cpu'
)

$ErrorActionPreference = 'Stop'
$serviceRoot = Split-Path -Parent $PSScriptRoot
$venvPath = Join-Path $serviceRoot '.venv'
$vendorPath = Join-Path $serviceRoot 'vendor\StreamFormer'

if (-not (Test-Path -LiteralPath $venvPath)) {
  py -3.11 -m venv $venvPath
}

$pythonPath = Join-Path $venvPath 'Scripts\python.exe'
& $pythonPath -m pip install --upgrade pip
if ($Device -eq 'cuda') {
  & $pythonPath -m pip install torch==2.5.1 torchvision==0.20.1 --index-url https://download.pytorch.org/whl/cu124
} else {
  & $pythonPath -m pip install torch==2.5.1 torchvision==0.20.1 --index-url https://download.pytorch.org/whl/cpu
}
& $pythonPath -m pip install -r (Join-Path $serviceRoot 'requirements-model.txt')

if (-not (Test-Path -LiteralPath $vendorPath)) {
  New-Item -ItemType Directory -Force -Path (Split-Path -Parent $vendorPath) | Out-Null
  git clone --depth 1 https://github.com/Go2Heart/StreamFormer.git $vendorPath
}

Write-Host "Setup complete. Activate $venvPath and start with scripts/start.ps1."
