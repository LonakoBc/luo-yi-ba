param(
  [string]$OutputPath
)

$ErrorActionPreference = 'Stop'
$repositoryRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
if (-not $OutputPath) {
  $OutputPath = Join-Path $repositoryRoot 'aliyun-multiplayer-release.tar.gz'
} elseif (-not [System.IO.Path]::IsPathRooted($OutputPath)) {
  $OutputPath = Join-Path $repositoryRoot $OutputPath
}
$OutputPath = [System.IO.Path]::GetFullPath($OutputPath)
$outputDirectory = Split-Path -Parent $OutputPath
New-Item -ItemType Directory -Force -Path $outputDirectory | Out-Null

$releasePaths = @(
  'server/package.json',
  'server/package-lock.json',
  'server/src',
  'server/deploy',
  'server/scripts',
  'web/src/data/songs.generated.json',
  'web/src/data/presets.generated.json',
  'web/src/services/gameService.js',
  'web/src/services/libraryService.js',
  'web/src/services/multiplayerRules.js'
)

foreach ($relativePath in $releasePaths) {
  if (-not (Test-Path -LiteralPath (Join-Path $repositoryRoot $relativePath))) {
    throw "Release file is missing: $relativePath"
  }
}

Push-Location $repositoryRoot
try {
  & tar.exe -czf $OutputPath @releasePaths
  if ($LASTEXITCODE -ne 0) { throw "tar failed with exit code $LASTEXITCODE" }
} finally {
  Pop-Location
}

$archive = Get-Item -LiteralPath $OutputPath
$sizeMegabytes = [Math]::Round($archive.Length / 1MB, 2)
Write-Host "Aliyun release archive created: $($archive.FullName)"
Write-Host ("Archive size: {0} MB" -f $sizeMegabytes)
