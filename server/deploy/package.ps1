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
  'web/src/services/multiplayerRules.js',
  'web/src/services/multiplayerEmotes.js',
  'guess_songs/assets'
)

foreach ($relativePath in $releasePaths) {
  if (-not (Test-Path -LiteralPath (Join-Path $repositoryRoot $relativePath))) {
    throw "Release file is missing: $relativePath"
  }
}

Push-Location $repositoryRoot
try {
  # Keep the staging copy on the repository drive. This avoids failing when
  # the Windows system temp drive is low on space during a release build.
  $stagingRoot = Join-Path $repositoryRoot (Join-Path '.cache' ("luoyiba-release-" + [Guid]::NewGuid().ToString('N')))
  New-Item -ItemType Directory -Force -Path $stagingRoot | Out-Null
  try {
    foreach ($relativePath in $releasePaths) {
      $source = Join-Path $repositoryRoot $relativePath
      $target = Join-Path $stagingRoot $relativePath
      New-Item -ItemType Directory -Force -Path (Split-Path -Parent $target) | Out-Null
      Copy-Item -LiteralPath $source -Destination $target -Recurse -Force
    }
    Get-ChildItem -LiteralPath $stagingRoot -Recurse -Filter '*.sh' | ForEach-Object {
      $content = [System.IO.File]::ReadAllText($_.FullName).Replace("`r`n", "`n").Replace("`r", "`n")
      [System.IO.File]::WriteAllText($_.FullName, $content, [System.Text.UTF8Encoding]::new($false))
    }
    Push-Location $stagingRoot
    try {
      & tar.exe -czf $OutputPath @releasePaths
      if ($LASTEXITCODE -ne 0) { throw "tar failed with exit code $LASTEXITCODE" }
    } finally {
      Pop-Location
    }
  } finally {
    Remove-Item -LiteralPath $stagingRoot -Recurse -Force -ErrorAction SilentlyContinue
  }
} finally {
  Pop-Location
}

$archive = Get-Item -LiteralPath $OutputPath
$sizeMegabytes = [Math]::Round($archive.Length / 1MB, 2)
Write-Host "Aliyun release archive created: $($archive.FullName)"
Write-Host ("Archive size: {0} MB" -f $sizeMegabytes)
