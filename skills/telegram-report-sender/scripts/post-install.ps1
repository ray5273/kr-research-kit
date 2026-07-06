param(
    [Parameter(Mandatory = $true)]
    [string]$TargetPath
)

$ErrorActionPreference = "Stop"

$sourcePath = $env:SKILL_INSTALL_SOURCE
if (-not $sourcePath) {
    throw "SKILL_INSTALL_SOURCE is required."
}

$repoRoot = (Resolve-Path (Join-Path $sourcePath "..\..")).Path
$targetScripts = Join-Path $TargetPath "scripts"
$targetLib = Join-Path $targetScripts "lib"

New-Item -ItemType Directory -Force $targetLib | Out-Null
Copy-Item (Join-Path $repoRoot "scripts\send-telegram.js") (Join-Path $targetScripts "send-telegram.js") -Force
Copy-Item (Join-Path $repoRoot "scripts\lib\telegram.js") (Join-Path $targetLib "telegram.js") -Force
