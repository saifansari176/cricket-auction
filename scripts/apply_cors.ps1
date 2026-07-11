# apply_cors.ps1
# Usage: run from project root or execute this script directly.
# It reads `src\firebase.config.ts` to extract the bucket name and runs gsutil cors set cors.json gs://<bucket>

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$root = Resolve-Path (Join-Path $scriptDir "..")
$configPath = Join-Path $root "src\firebase.config.ts"
$corsFile = Join-Path $root "cors.json"

if (-not (Test-Path $corsFile)) {
    Write-Error "cors.json not found at $corsFile"
    exit 1
}

$bucket = ""
if (Test-Path $configPath) {
    $txt = Get-Content $configPath -Raw
    if ($txt -match 'storageBucket\s*:\s*"([^"]+)"') {
        $bucket = $Matches[1]
    }
}

if (-not $bucket) {
    Write-Warning "Could not read storageBucket from src/firebase.config.ts. Using default: saifcricketauction.appspot.com"
    $bucket = "saifcricketauction.appspot.com"
}

$gsBucket = "gs://$bucket"

# Check for gsutil
$gsutil = Get-Command gsutil -ErrorAction SilentlyContinue
if (-not $gsutil) {
    Write-Host "gsutil not found. Install Google Cloud SDK: https://cloud.google.com/sdk/docs/install"
    Write-Host "After installing, run:`n  gcloud auth login` then re-run this script.`nOr run this script from a shell where gsutil is available."
    exit 2
}

Write-Host "Applying CORS to $gsBucket using $corsFile"
& gsutil cors set $corsFile $gsBucket
if ($LASTEXITCODE -eq 0) {
    Write-Host "CORS set successfully."
} else {
    Write-Error "gsutil failed with exit code $LASTEXITCODE"
    exit $LASTEXITCODE
}
