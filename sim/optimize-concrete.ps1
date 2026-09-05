# Run once after importing the original 2K JPG maps documented in SOURCE.md.
Add-Type -AssemblyName System.Drawing
$textureRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../public/textures/concrete'))
$codec = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq 'image/jpeg' }
$originalHashes = @{ albedo='3b9f88588c6fec0110f7e112163a8986'; normal='94895c9460504dc4e4a3275e9eb84aee'; roughness='de59a5a792ba784d4dbeb9cb2044ee2b' }
foreach ($entry in @(@('albedo',88),@('normal',94),@('roughness',88))) {
    $sourcePath = Join-Path $textureRoot ($entry[0] + '.jpg')
    if ((Get-FileHash -Algorithm MD5 -LiteralPath $sourcePath).Hash.ToLower() -ne $originalHashes[$entry[0]]) { throw 'Import the original verified JPGs first. Do not repeatedly recompress the optimized maps.' }
    $optimizedPath = Join-Path $textureRoot ($entry[0] + '.optimized.jpg')
    $source = [System.Drawing.Image]::FromFile($sourcePath)
    try {
        $parameters = New-Object System.Drawing.Imaging.EncoderParameters(1)
        $parameters.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter([System.Drawing.Imaging.Encoder]::Quality, [long]$entry[1])
        $source.Save($optimizedPath, $codec, $parameters)
        $parameters.Dispose()
    } finally { $source.Dispose() }
    # Both exact files are validated children of this project's texture directory.
    if ([System.IO.Path]::GetDirectoryName($sourcePath) -ne $textureRoot -or [System.IO.Path]::GetDirectoryName($optimizedPath) -ne $textureRoot) { throw 'Unexpected texture path' }
    Move-Item -LiteralPath $optimizedPath -Destination $sourcePath -Force
    Get-Item -LiteralPath $sourcePath | Select-Object Name, Length
}
