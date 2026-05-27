# Lightweight native PowerShell Web Server
$port = 8000
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$port/")

# Set console title
$host.UI.RawUI.WindowTitle = "Invoice Checker Local Server (Port $port)"

Write-Host "=========================================" -ForegroundColor Green
Write-Host "  INVOICE CHECKER LOCAL WEB SERVER  " -ForegroundColor Green -Bold
Write-Host "=========================================" -ForegroundColor Green
Write-Host "URL: http://localhost:$port/myntra/INVOICE/myntra.html" -ForegroundColor Yellow
Write-Host "Serving files from: $(Get-Location)"
Write-Host "Press Ctrl+C in this terminal to stop." -ForegroundColor Gray
Write-Host "========================================="

try {
    $listener.Start()
    while ($listener.IsListening) {
        try {
            $context = $listener.GetContext()
            $request = $context.Request
            $response = $context.Response
            
            $urlPath = $request.Url.LocalPath
            # Handle trailing slash or empty path
            if ($urlPath -eq "/" -or [string]::IsNullOrEmpty($urlPath)) {
                $urlPath = "/index.html"
            }
            
            # Clean urlPath for path join
            $cleanUrlPath = $urlPath.Replace("/", "\").TrimStart("\")
            $filePath = Join-Path (Get-Location) $cleanUrlPath
            
            if (Test-Path $filePath -PathType Leaf) {
                $bytes = [System.IO.File]::ReadAllBytes($filePath)
                $response.ContentLength64 = $bytes.Length
                
                # MIME Types
                $ext = [System.IO.Path]::GetExtension($filePath).ToLower()
                $contentType = "application/octet-stream"
                switch ($ext) {
                    ".html" { $contentType = "text/html; charset=utf-8" }
                    ".htm" { $contentType = "text/html; charset=utf-8" }
                    ".css" { $contentType = "text/css; charset=utf-8" }
                    ".js" { $contentType = "application/javascript; charset=utf-8" }
                    ".png" { $contentType = "image/png" }
                    ".jpg" { $contentType = "image/jpeg" }
                    ".jpeg" { $contentType = "image/jpeg" }
                    ".gif" { $contentType = "image/gif" }
                    ".svg" { $contentType = "image/svg+xml" }
                    ".json" { $contentType = "application/json; charset=utf-8" }
                    ".ico" { $contentType = "image/x-icon" }
                }
                
                $response.ContentType = $contentType
                $response.OutputStream.Write($bytes, 0, $bytes.Length)
                Write-Host "$(Get-Date -Format 'HH:mm:ss') - 200 OK: $urlPath" -ForegroundColor Gray
            } else {
                $response.StatusCode = 404
                $response.ContentType = "text/plain"
                $errBytes = [System.Text.Encoding]::UTF8.GetBytes("404 Not Found: $urlPath")
                $response.OutputStream.Write($errBytes, 0, $errBytes.Length)
                Write-Host "$(Get-Date -Format 'HH:mm:ss') - 404 NOT FOUND: $urlPath" -ForegroundColor Red
            }
            $response.Close()
        } catch {
            # Catch inner exceptions to keep server running
            Write-Host "Request handling error: $_" -ForegroundColor Yellow
        }
    }
} catch {
    Write-Error "Server startup failed: $_"
} finally {
    if ($listener) {
        $listener.Close()
    }
}
