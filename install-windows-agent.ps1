param(
    [Parameter(Mandatory = $true)]
    [string]$ServerUrl,

    [Parameter(Mandatory = $true)]
    [string]$EnrollmentToken,

    [string]$InstallerPath,

    [string]$ReleaseTag = 'latest',

    [switch]$Quiet,

    [switch]$NoLaunch
)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

function Normalize-ServerUrl([string]$Value) {
    $uri = $null
    if (-not [Uri]::TryCreate($Value.Trim(), [UriKind]::Absolute, [ref]$uri)) {
        throw 'ServerUrl must be an absolute URL, for example http://192.168.0.249:8081'
    }
    if ($uri.Scheme -notin @('http', 'https')) {
        throw 'ServerUrl must use http or https.'
    }
    return $uri.AbsoluteUri.TrimEnd('/')
}

function Get-ReleaseInstaller([string]$Tag) {
    $headers = @{
        'Accept' = 'application/vnd.github+json'
        'User-Agent' = 'ActiLens-Windows-Installer'
        'X-GitHub-Api-Version' = '2022-11-28'
    }

    if ($Tag -eq 'latest') {
        $releaseUrl = 'https://api.github.com/repos/0xDive/actilens/releases/latest'
    } else {
        $escaped = [Uri]::EscapeDataString($Tag)
        $releaseUrl = "https://api.github.com/repos/0xDive/actilens/releases/tags/$escaped"
    }

    Write-Host "Resolving ActiLens release: $Tag"
    $release = Invoke-RestMethod -UseBasicParsing -Headers $headers -Uri $releaseUrl

    $asset = $release.assets |
        Where-Object { $_.name -eq 'ActiLens-x64.msi' } |
        Select-Object -First 1

    if (-not $asset) {
        $asset = $release.assets |
            Where-Object { $_.name -match '(?i)\.msi$' -and $_.name -match '(?i)(x64|x86_64|amd64|ActiLens)' } |
            Select-Object -First 1
    }
    if (-not $asset) {
        $asset = $release.assets |
            Where-Object { $_.name -match '(?i)\.msi$' } |
            Select-Object -First 1
    }
    if (-not $asset) {
        throw "No MSI installer was found in GitHub release '$Tag'."
    }

    $dest = Join-Path $env:TEMP 'ActiLens-x64.msi'
    Write-Host "Downloading $($asset.name)..."
    Invoke-WebRequest -UseBasicParsing -Headers $headers -Uri $asset.browser_download_url -OutFile $dest
    return $dest
}

function Find-ActiLensExe {
    $candidates = @(
        (Join-Path $env:LOCALAPPDATA 'Programs\ActiLens\ActiLens.exe'),
        (Join-Path $env:LOCALAPPDATA 'ActiLens\ActiLens.exe'),
        (Join-Path $env:ProgramFiles 'ActiLens\ActiLens.exe')
    )
    if (${env:ProgramFiles(x86)}) {
        $candidates += (Join-Path ${env:ProgramFiles(x86)} 'ActiLens\ActiLens.exe')
    }

    foreach ($candidate in $candidates) {
        if ($candidate -and (Test-Path -LiteralPath $candidate)) {
            return (Resolve-Path -LiteralPath $candidate).Path
        }
    }

    $roots = @(
        'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*',
        'HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*',
        'HKLM:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*'
    )
    foreach ($root in $roots) {
        $app = Get-ItemProperty $root -ErrorAction SilentlyContinue |
            Where-Object { $_.DisplayName -like 'ActiLens*' } |
            Select-Object -First 1
        if (-not $app) { continue }

        if ($app.InstallLocation) {
            $candidate = Join-Path $app.InstallLocation 'ActiLens.exe'
            if (Test-Path -LiteralPath $candidate) {
                return (Resolve-Path -LiteralPath $candidate).Path
            }
        }

        if ($app.DisplayIcon) {
            $iconPath = ([string]$app.DisplayIcon).Trim('"') -replace ',\d+$', ''
            if ($iconPath -and (Test-Path -LiteralPath $iconPath) -and $iconPath.EndsWith('.exe', [StringComparison]::OrdinalIgnoreCase)) {
                return (Resolve-Path -LiteralPath $iconPath).Path
            }
        }
    }

    return $null
}

$server = Normalize-ServerUrl $ServerUrl

Write-Host "Checking ActiLens server: $server/healthz"
try {
    $health = Invoke-WebRequest -UseBasicParsing -Uri "$server/healthz" -TimeoutSec 10
    if ($health.StatusCode -ne 200) {
        throw "HTTP $($health.StatusCode)"
    }
} catch {
    throw "ActiLens server health check failed for $server : $($_.Exception.Message)"
}

$token = $EnrollmentToken.Trim()
if (-not $token.StartsWith('atl_enroll_', [StringComparison]::Ordinal)) {
    throw 'EnrollmentToken is not an ActiLens enrollment code.'
}
if ($token.Length -lt 32) {
    throw 'EnrollmentToken is too short.'
}

# Make provisioning available both to this process and to the next interactive
# ActiLens launch. The agent consumes and removes ACTILENS_ENROLL_TOKEN after a
# successful one-time enrollment.
$env:ACTILENS_BACKEND_URL = $server
$env:ACTILENS_ENROLL_TOKEN = $token
[Environment]::SetEnvironmentVariable('ACTILENS_BACKEND_URL', $server, 'User')
[Environment]::SetEnvironmentVariable('ACTILENS_ENROLL_TOKEN', $token, 'User')

if ($InstallerPath) {
    $installer = (Resolve-Path -LiteralPath $InstallerPath).Path
} else {
    $installer = Get-ReleaseInstaller $ReleaseTag
}

if ([IO.Path]::GetExtension($installer) -ne '.msi') {
    throw 'InstallerPath must point to an MSI installer.'
}

# Close an older interactive agent before replacing its files. This is ordinary
# application maintenance; the installed agent remains visible in the tray.
Get-Process -Name 'ActiLens' -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue

$args = @('/i', "`"$installer`"", '/norestart')
if ($Quiet) {
    $args += '/qn'
} else {
    $args += '/passive'
}

Write-Host "Installing ActiLens for backend $server ..."
$proc = Start-Process -FilePath 'msiexec.exe' -ArgumentList $args -Wait -PassThru
if ($proc.ExitCode -notin @(0, 3010)) {
    throw "ActiLens MSI failed with exit code $($proc.ExitCode)."
}

if (-not $NoLaunch) {
    $exe = Find-ActiLensExe
    if (-not $exe) {
        Write-Warning 'ActiLens installed, but the executable path could not be resolved automatically. Launch ActiLens once from the Start menu to complete enrollment.'
    } else {
        Write-Host 'Launching ActiLens to redeem the one-time enrollment code...'
        Start-Process -FilePath $exe
    }
}

Write-Host ''
Write-Host 'ActiLens provisioning completed.'
Write-Host "Server: $server"
Write-Host 'The enrollment code is one-time and will be removed from the user environment after successful redemption.'
if ($proc.ExitCode -eq 3010) {
    Write-Warning 'Windows reported that a reboot is recommended to complete installation.'
}
