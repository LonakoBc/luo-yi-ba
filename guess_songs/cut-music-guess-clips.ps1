param(
  [string]$InputDir = (Join-Path $PSScriptRoot 'luotianyi'),
  [string]$OutputDir = (Join-Path $PSScriptRoot 'assets'),
  [string]$CatalogPath = (Join-Path $PSScriptRoot 'catalogs\luotianyi-clips.json')
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

if (-not (Test-Path -LiteralPath $InputDir -PathType Container)) {
  throw "输入目录不存在：$InputDir"
}
New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null
New-Item -ItemType Directory -Force -Path (Split-Path -Parent $CatalogPath) | Out-Null

$files = @(Get-ChildItem -LiteralPath $InputDir -File -Filter '*.mp3' | Sort-Object Name)
if ($files.Count -eq 0) { throw "输入目录没有 MP3：$InputDir" }
Write-Host "准备裁切 $($files.Count) 首歌曲。"

$catalog = [System.Collections.Generic.List[object]]::new()
$index = 0
foreach ($file in $files) {
  $index += 1
  $startSeconds = if ($specialStarts.ContainsKey($file.Name)) { [int]$specialStarts[$file.Name] } else { 0 }
  $sourceHash = (Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash.ToLowerInvariant().Substring(0, 12)
  $clipFile = "asset-$sourceHash-$('{0:D2}' -f $startSeconds).mp3"
  $outputPath = Join-Path $OutputDir $clipFile

  & $ffmpeg -hide_banner -loglevel error -y -ss $startSeconds -i $file.FullName -t 15 -vn -map_metadata -1 -c:a libmp3lame -b:a 128k -ar 44100 -ac 2 $outputPath
  if ($LASTEXITCODE -ne 0) { throw "FFmpeg 裁切失败：$($file.Name)" }

  $durationText = (& $ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 $outputPath | Select-Object -First 1).Trim()
  $duration = [math]::Round([double]::Parse($durationText, [Globalization.CultureInfo]::InvariantCulture), 3)
  $catalog.Add([ordered]@{
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