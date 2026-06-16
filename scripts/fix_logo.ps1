Add-Type -AssemblyName System.Drawing

$bgHex = "#0a1b2f"
$bgColor = [System.Drawing.ColorTranslator]::FromHtml($bgHex)

function Process-Icon($inputFile, $outputFile, $size) {
    if (-Not (Test-Path $inputFile)) {
        Write-Host "File $inputFile not found"
        return
    }

    $img = [System.Drawing.Image]::FromFile($inputFile)
    
    $bmp = New-Object System.Drawing.Bitmap($size, $size)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    
    # High quality
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality

    # Fill background
    $brush = New-Object System.Drawing.SolidBrush($bgColor)
    $g.FillRectangle($brush, 0, 0, $size, $size)
    
    # We want to scale the image so it fits within the safe zone of maskable icon (center 60-70%)
    # Actually, if the logo should just have no gaps, let's scale it so it takes about 70% of the size
    $scale = 0.7
    $newW = [int]($size * $scale)
    $newH = [int]($size * $scale)
    
    # If the image aspect ratio is not 1:1, keep it
    if ($img.Width -gt $img.Height) {
        $newH = [int]($newW * ($img.Height / $img.Width))
    } else {
        $newW = [int]($newH * ($img.Width / $img.Height))
    }
    
    $posX = [int](($size - $newW) / 2)
    $posY = [int](($size - $newH) / 2)
    
    $g.DrawImage($img, $posX, $posY, $newW, $newH)
    
    $bmp.Save($outputFile, [System.Drawing.Imaging.ImageFormat]::Png)
    
    $g.Dispose()
    $bmp.Dispose()
    $img.Dispose()
    $brush.Dispose()
    
    Write-Host "Created $outputFile"
}

$workspace = "c:\Users\user\Desktop\New folder\scheduler"
Process-Icon "$workspace\public\logo.png" "$workspace\public\logo_maskable_192.png" 192
Process-Icon "$workspace\public\splash.png" "$workspace\public\logo_maskable_512.png" 512
