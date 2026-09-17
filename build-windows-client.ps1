param(
    [Parameter(Mandatory = $true)]
    [string]$ServerUrl,

    [string]$OutputDir = "dist-windows"
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest
Set-Location $PSScriptRoot

$uri = $null
if (-not [Uri]::TryCreate($ServerUrl, [UriKind]::Absolute, [ref]$uri)) {
    throw "ServerUrl must be an absolute URL, e.g. http://192.168.0.249:8081"
}
if ($uri.Scheme -notin @("http", "https")) {
    throw "ServerUrl must use http or https"
}
$ServerUrl = $uri.AbsoluteUri.TrimEnd("/")

foreach ($cmd in @("node", "cargo")) {
    if (-not (Get-Command $cmd -ErrorAction SilentlyContinue)) {
        throw "$cmd is required and was not found in PATH"
    }
}

if (-not (Get-Command pnpm -ErrorAction SilentlyContinue)) {
    if (-not (Get-Command corepack -ErrorAction SilentlyContinue)) {
        throw "pnpm/corepack is required. Install Node.js 20+ first."
    }
    corepack enable
    corepack prepare pnpm@10.30.1 --activate
}

$env:ACTILENS_BUILD_SERVER_URL = $ServerUrl
Write-Host "ActiLens backend: $ServerUrl"
Write-Host "Installing dependencies..."
pnpm install --frozen-lockfile
if ($LASTEXITCODE -ne 0) { throw "pnpm install failed" }

Write-Host "Building Windows MSI/EXE..."
pnpm --filter @actilens/desktop tauri build --target x86_64-pc-windows-msvc
if ($LASTEXITCODE -ne 0) { throw "Tauri build failed" }

$out = Join-Path $PSScriptRoot $OutputDir
New-Item -ItemType Directory -Force -Path $out | Out-Null

$bundleRoot = Join-Path $PSScriptRoot "apps\desktop\src-tauri\target\x86_64-pc-windows-msvc\release\bundle"
$files = @()
$files += Get-ChildItem -Path (Join-Path $bundleRoot "nsis") -Filter "*.exe" -File -ErrorAction SilentlyContinue
$files += Get-ChildItem -Path (Join-Path $bundleRoot "msi") -Filter "*.msi" -File -ErrorAction SilentlyContinue

if ($files.Count -eq 0) {
    throw "Build completed but no MSI/EXE was found under $bundleRoot"
}

foreach ($file in $files) {
    Copy-Item $file.FullName -Destination $out -Force
}

Write-Host ""
Write-Host "Build complete."
Write-Host "Backend: $ServerUrl"
Write-Host "Installers: $out"
Get-ChildItem $out | Select-Object Name, Length
