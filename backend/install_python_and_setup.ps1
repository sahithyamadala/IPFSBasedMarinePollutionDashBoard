# Run as Administrator from: C:\Users\Lenovo\Desktop\marine_db\backend
# This script downloads Python 3.10 installer, runs a silent install (adds to PATH),
# creates a venv named tf-env-backend, activates it in the current session, and installs required packages.
# IMPORTANT: Review before running. Admin rights required to install Python system-wide.

$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Definition
$venvPath = Join-Path $projectRoot "tf-env-backend"

Write-Host "1) Checking for existing Python 3.10..."

# Try py launcher to check for a 3.10 interpreter
$py310 = $null
try {
    $out = & py -3.10 -c "import sys; print(sys.executable)" 2>$null
    if ($LASTEXITCODE -eq 0) {
        $py310 = "py -3.10"
    }
} catch {}

# If not found, download installer and run silent install
if (-not $py310) {
    Write-Host "Python 3.10 not found. Downloading installer..."
    $installerUrl = "https://www.python.org/ftp/python/3.10.12/python-3.10.12-amd64.exe"
    $installerPath = Join-Path $env:TEMP "python-3.10.12-amd64.exe"

    if (-Not (Test-Path $installerPath)) {
        Write-Host "Downloading Python 3.10.12..."
        Invoke-WebRequest -Uri $installerUrl -OutFile $installerPath -UseBasicParsing
    } else {
        Write-Host "Installer already downloaded at $installerPath"
    }

    Write-Host "Running Python installer silently (will add to PATH)..."
    # Install for all users, add to PATH
    & $installerPath /quiet InstallAllUsers=1 PrependPath=1 Include_launcher=1
    if ($LASTEXITCODE -ne 0) {
        Write-Error "Python installer returned code $LASTEXITCODE. Please install Python 3.10 manually from https://www.python.org/downloads/release/python-31012/ and re-run this script."
        exit 1
    }

    # ensure py -3.10 is available
    Start-Sleep -Seconds 3
    try {
        $out = & py -3.10 -c "import sys; print(sys.executable)" 2>$null
        if ($LASTEXITCODE -eq 0) {
            $py310 = "py -3.10"
            Write-Host "Python 3.10 installed."
        }
    } catch {}
}

if (-not $py310) {
    Write-Error "Python 3.10 executable not found after install. Install Python 3.10 manually and re-run."
    exit 1
}

# Create venv if missing
if (-Not (Test-Path $venvPath)) {
    Write-Host "Creating virtual environment at: $venvPath"
    & $py310 -m venv $venvPath
} else {
    Write-Host "Virtual environment already exists at: $venvPath"
}

# Activate venv for this script session
Write-Host "Activating virtual environment..."
Set-ExecutionPolicy -Scope Process -ExecutionPolicy RemoteSigned -Force
$activateScript = Join-Path $venvPath "Scripts\Activate.ps1"
if (-Not (Test-Path $activateScript)) {
    Write-Error "Activation script not found at $activateScript"
    exit 1
}
& $activateScript

# Upgrade pip and install packages
Write-Host "Upgrading pip..."
python -m pip install --upgrade pip

Write-Host "Installing backend dependencies (tensorflow-cpu, etc.)..."
python -m pip install --upgrade pip
python -m pip install flask flask-cors requests pillow numpy tensorflow-cpu==2.19.0

Write-Host "Setup complete."
Write-Host "To activate the venv in a new session run:"
Write-Host "  & '$activateScript'"
Write-Host "Then start the prediction service:"
Write-Host "  python '$projectRoot\predict_service.py'"
