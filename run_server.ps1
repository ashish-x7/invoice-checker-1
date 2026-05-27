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
            
            # PDF Download Proxy Endpoint
            if ($urlPath -eq "/download-pdf") {
                $query = $request.QueryString
                $targetUrl = $query["url"]
                $filename = $query["filename"]
                
                if (-not [string]::IsNullOrEmpty($targetUrl)) {
                    Write-Host "Proxying download for: $targetUrl" -ForegroundColor Yellow
                    try {
                        $webClient = New-Object System.Net.WebClient
                        $webClient.Headers.Add("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64)")
                        $pdfBytes = $webClient.DownloadData($targetUrl)
                        
                        $response.StatusCode = 200
                        $response.ContentType = "application/pdf"
                        $response.Headers.Add("Access-Control-Allow-Origin", "*")
                        
                        if (-not [string]::IsNullOrEmpty($filename)) {
                            $response.Headers.Add("Content-Disposition", "attachment; filename=`"$filename`"")
                        } else {
                            $response.Headers.Add("Content-Disposition", "attachment")
                        }
                        
                        $response.ContentLength64 = $pdfBytes.Length
                        $response.OutputStream.Write($pdfBytes, 0, $pdfBytes.Length)
                        Write-Host "$(Get-Date -Format 'HH:mm:ss') - 200 OK (Proxy Download): $filename" -ForegroundColor Green
                    } catch {
                        Write-Host "Proxy download failed: $_" -ForegroundColor Red
                        $response.StatusCode = 500
                        $response.ContentType = "text/plain"
                        $errBytes = [System.Text.Encoding]::UTF8.GetBytes("Error fetching PDF: $_")
                        $response.OutputStream.Write($errBytes, 0, $errBytes.Length)
                    }
                } else {
                    $response.StatusCode = 400
                    $response.ContentType = "text/plain"
                    $errBytes = [System.Text.Encoding]::UTF8.GetBytes("Missing 'url' parameter")
                    $response.OutputStream.Write($errBytes, 0, $errBytes.Length)
                }
                $response.Close()
                continue
            }
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
