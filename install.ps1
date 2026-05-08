$ErrorActionPreference = "Stop"

$source = Join-Path $PSScriptRoot "extension\extension.mjs"
$destinationDirectory = Join-Path $HOME ".copilot\extensions\cost-meter"
$destination = Join-Path $destinationDirectory "extension.mjs"

if (-not (Test-Path $source)) {
    throw "Extension source not found: $source"
}

New-Item -ItemType Directory -Force -Path $destinationDirectory | Out-Null
Copy-Item -Force -Path $source -Destination $destination

Write-Host "Installed Copilot Cost Meter to $destination"
Write-Host "Restart Copilot CLI, then run /cost."

