# Usage: Open PowerShell in admin (recommended) and run:
#   .\setup_env.ps1
# This script creates a venv named tf-env-backend (to avoid clashing with other venvs)
# and installs the backend requirements including tensorflow-cpu.

$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Definition
$venvPath = Join-Path $projectRoot "tf-env-backend"

Write-Output "Creating virtual environment at: $venvPath"
if (-Not (Test-Path $venvPath)) {
    py -3.10 -m venv $venvPath
} else {
    Write-Output "Virtual environment already exists at $venvPath"
}

Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope Process -Force

$activateScript = Join-Path $venvPath "Scripts\Activate.ps1"
if (-Not (Test-Path $activateScript)) {
    Write-Error "Activation script not found at $activateScript. Ensure Python 3.10 is installed and 'py' launcher is available."
    exit 1
}

& $activateScript

Write-Output "Upgrading pip..."
pip install --upgrade pip

Write-Output "Installing backend requirements (tensorflow-cpu)..."
pip install flask flask-cors requests pillow numpy tensorflow-cpu==2.19.0

Write-Output "Setup complete. To activate venv run:"
Write-Output "  & '$activateScript'"
Write-Output "Then start the prediction service:"
Write-Output "  python '$projectRoot\predict_service.py'"
