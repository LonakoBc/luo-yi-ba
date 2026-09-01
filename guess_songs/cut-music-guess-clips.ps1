param(
  [string]$InputDir = (Join-Path $PSScriptRoot 'luotianyi'),
  [string]$OutputDir = (Join-Path $PSScriptRoot 'assets'),
  [string]$CatalogPath = (Join-Path $PSScriptRoot 'catalogs\song-clips.json')
)

$ErrorActionPreference = 'Stop'
$ffmpeg = (Get-Command ffmpeg -ErrorAction Stop).Source
$ffprobe = (Get-Command ffprobe -ErrorAction Stop).Source
$specialStarts = @{
  '黑凤梨.mp3' = 14
  '保卫罗德岛.mp3' = 14
  '再一杯！.mp3' = 24
  'Rainy Bunny.mp3' = 5
}

function Get-SourceKey([string]$value) {
  $key = [string]$value
  $key = $key.Normalize([System.Text.NormalizationForm]::FormKC)
  $key = [regex]::Replace($key, '\.mp3$', '', [System.Text.RegularExpressions.RegexOptions]::IgnoreCase)
  $key = $key -replace '蜀黍', '叔叔'
  $key = [regex]::Replace($key, '\([^)]*\)|（[^）]*）|【[^】]*】|\[[^\]]*\]', '')
  $key = [regex]::Replace($key, '^\d+[.、]*', '')
  $key = $key.ToLowerInvariant()
  return [regex]::Replace($key, '[\s\p{P}\p{S}]+', '')
}

if (-not (Test-Path -LiteralPath $InputDir -PathType Container)) {
  throw "输入目录不存在：$InputDir"
}
New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null
New-Item -ItemType Directory -Force -Path (Split-Path -Parent $CatalogPath) | Out-Null

$files = @(Get-ChildItem -LiteralPath $InputDir -File -Filter '*.mp3' | Sort-Object Name)
if ($files.Count -eq 0) { throw "输入目录没有 MP3：$InputDir" }

$existingDocument = $null
$existingTracks = @()
if (Test-Path -LiteralPath $CatalogPath -PathType Leaf) {
  $existingDocument = Get-Content -LiteralPath $CatalogPath -Raw -Encoding UTF8 | ConvertFrom-Json
  $existingTracks = @($existingDocument.tracks)
}

$existingBySourceKey = @{}
$existingByHash = @{}
foreach ($track in $existingTracks) {
  if (-not $track.sourceKey) {
    $fallbackTitle = if ($track.sourceTitle) { $track.sourceTitle } else { $track.sourceFile }
    $track | Add-Member -NotePropertyName sourceKey -NotePropertyValue (Get-SourceKey $fallbackTitle) -Force
  }
  if ($track.sourceKey -and -not $existingBySourceKey.ContainsKey($track.sourceKey)) { $existingBySourceKey[$track.sourceKey] = $track }
  if ($track.sourceSha256 -and -not $existingByHash.ContainsKey($track.sourceSha256)) { $existingByHash[$track.sourceSha256] = $track }
}

Write-Host "准备检查 $($files.Count) 首源歌曲，已有 $($existingTracks.Count) 条裁切记录。"

$catalog = [System.Collections.Generic.List[object]]::new()
$selectedKeys = [System.Collections.Generic.HashSet[string]]::new()
$index = 0
foreach ($file in $files) {
  $index += 1
  $startSeconds = if ($specialStarts.ContainsKey($file.Name)) { [int]$specialStarts[$file.Name] } else { 0 }
  $sourceKey = Get-SourceKey $file.BaseName
  $sourceHash = (Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash.ToLowerInvariant().Substring(0, 12)
  $clipFile = "asset-$sourceHash-$('{0:D2}' -f $startSeconds).mp3"
  $outputPath = Join-Path $OutputDir $clipFile

  $existing = if ($existingBySourceKey.ContainsKey($sourceKey)) { $existingBySourceKey[$sourceKey] } else { $null }
  if (-not $existing -and $existingByHash.ContainsKey($sourceHash)) { $existing = $existingByHash[$sourceHash] }
  if ($existing -and $existing.sourceKey -eq $sourceKey -and $existing.sourceSha256 -ne $sourceHash) {
    throw "sourceKey 冲突：$($file.Name) 与已有记录 $($existing.sourceFile) 的音频内容不同，请先人工确认。"
  }
  if ($existing -and $existing.clipPath -and (Test-Path -LiteralPath (Join-Path $OutputDir (Split-Path $existing.clipPath -Leaf)))) {
    if ($existing.sourceSha256 -eq $sourceHash) {
      if ($selectedKeys.Add([string]$existing.sourceKey)) { $catalog.Add($existing) }
      Write-Host "复用已有片段：$($file.Name) -> $($existing.clipPath)"
      continue
    }
  }

  & $ffmpeg -hide_banner -loglevel error -y -ss $startSeconds -i $file.FullName -t 15 -vn -map_metadata -1 -c:a libmp3lame -b:a 128k -ar 44100 -ac 2 $outputPath
  if ($LASTEXITCODE -ne 0) { throw "FFmpeg 裁切失败：$($file.Name)" }

  $durationText = (& $ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 $outputPath | Select-Object -First 1).Trim()
  $duration = [math]::Round([double]::Parse($durationText, [Globalization.CultureInfo]::InvariantCulture), 3)
  $catalog.Add([ordered]@{
    sourceKey = $sourceKey
    sourceFile = $file.Name
    sourceTitle = $file.BaseName.Trim()
    sourceSha256 = $sourceHash
    startSeconds = $startSeconds
    durationSeconds = $duration
    clipFile = $clipFile
    clipPath = "assets/$clipFile"
    fullFifteenSeconds = ($duration -ge 14.9)
  })
  if ($index % 10 -eq 0 -or $index -eq $files.Count) { Write-Host "[$index/$($files.Count)] $($file.Name) -> $clipFile ($startSeconds`s-$([int]($startSeconds + 15))s)" }
}

foreach ($track in $existingTracks) {
  if (-not $track.sourceKey) {
    $fallbackTitle = if ($track.sourceTitle) { $track.sourceTitle } else { $track.sourceFile }
    $track | Add-Member -NotePropertyName sourceKey -NotePropertyValue (Get-SourceKey $fallbackTitle) -Force
  }
  if ($selectedKeys.Add([string]$track.sourceKey)) { $catalog.Add($track) }
}

$catalogDocument = [ordered]@{
  playlist = 'luotianyi'
  sourceDirectory = 'guess_songs/luotianyi'
  clipDirectory = 'guess_songs/assets'
  clipLengthSeconds = 15
  generatedAt = (Get-Date).ToString('o')
  count = $catalog.Count
  specialStarts = $specialStarts
  tracks = $catalog
}
$catalogDocument | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $CatalogPath -Encoding UTF8
$short = @($catalog | Where-Object { -not $_.fullFifteenSeconds })
Write-Host "完成：$($catalog.Count) 个片段。"
Write-Host "目录清单：$CatalogPath"
if ($short.Count) { Write-Warning "不足 15 秒的片段：$($short.Count) 个" }
