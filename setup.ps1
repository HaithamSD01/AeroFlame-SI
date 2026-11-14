$ErrorActionPreference = "Continue"
Set-Location $PSScriptRoot
$log = Join-Path $PSScriptRoot "setup.log"
"== setup started $(Get-Date) ==" | Out-File $log -Encoding utf8
function Say($m) { Write-Host $m -ForegroundColor Cyan; $m | Out-File $log -Append -Encoding utf8 }

# Use the official Windows Python (not MSYS2/MinGW, which can't install torch)
$cand = @("$env:LOCALAPPDATA\Programs\Python\Python314\python.exe","$env:LOCALAPPDATA\Programs\Python\Python313\python.exe","$env:LOCALAPPDATA\Programs\Python\Python312\python.exe","$env:LOCALAPPDATA\Programs\Python\Python311\python.exe")
$base = $cand | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $base -and (Get-Command py -ErrorAction SilentlyContinue)) { $base = (& py -3 -c "import sys;print(sys.executable)") }
if (-not $base -or $base -like "*msys*") { Say "ERROR: official Python not found. Install from https://www.python.org/downloads/"; exit 1 }
Say "Using Python: $base"

if (!(Test-Path ".\venv\Scripts\python.exe")) { & $base -m venv venv 2>&1 | Tee-Object -FilePath $log -Append }
$vpy = ".\venv\Scripts\python.exe"
Say "== Installing packages (a few minutes) =="
& $vpy -m pip install --upgrade pip 2>&1 | Tee-Object -FilePath $log -Append
& $vpy -m pip install -r requirements-full.txt 2>&1 | Tee-Object -FilePath $log -Append
if ($LASTEXITCODE -ne 0) { Say "ERROR: pip install failed (see setup.log)"; exit 1 }
Say "== Pre-downloading the embedding model (~90 MB) =="
& $vpy -c "from sentence_transformers import SentenceTransformer; SentenceTransformer('all-MiniLM-L6-v2'); print('model ready')" 2>&1 | Tee-Object -FilePath $log -Append
if (!(Test-Path ".env")) { Copy-Item ".env.example" ".env"; Say "Created .env - paste your GEMINI_API_KEY in it." }
Say "== SETUP DONE. Double-click run.bat to start the dashboard. =="
