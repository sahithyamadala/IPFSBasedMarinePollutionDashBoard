# Usage: Open PowerShell, cd to this folder and run: .\run_debug.ps1
$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Definition
$venv = Join-Path $projectRoot 'tf-env-backend'  # change if your venv name differs
$activate = Join-Path $venv 'Scripts\Activate.ps1'

if (-Not (Test-Path $activate)) {
    Write-Host "Activation script not found at $activate"
    Write-Host "If your venv has a different name, edit this script to point to it."
    exit 1
}

Write-Host "Activating venv: $venv"
# allow script execution for this process
Set-ExecutionPolicy -Scope Process -ExecutionPolicy RemoteSigned -Force
& $activate

Write-Host "Running env_check.py..."
python .\env_check.py

Write-Host "Calling prediction service /health..."
try {
    $health = curl.exe -s http://127.0.0.1:5001/health
    Write-Host "Health response:"
    Write-Host $health
} catch {
    Write-Host "Failed to call /health: $_"
}

Write-Host "Done. Check logs folder for env_check log."
