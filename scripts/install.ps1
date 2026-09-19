# DEIZA CODE — Official Windows Installer (PowerShell)
# https://deiza.org

$ErrorActionPreference = "Continue"

try {
    [System.Console]::OutputEncoding = [System.Text.Encoding]::UTF8
} catch {}

# Safe TLS 1.2 configuration without unsupported enum values in PS 5.1
try {
    [System.Net.ServicePointManager]::SecurityProtocol = [System.Net.SecurityProtocolType]::Tls12
} catch {}

function Pause-Console {
    param([int]$ExitCode = 0)
    Write-Host ""
    Write-Host "  Presiona Enter para cerrar esta ventana..." -ForegroundColor Gray
    try {
        if ([Environment]::UserInteractive) {
            $null = [Console]::ReadLine()
        }
    } catch {
        Start-Sleep -Seconds 3
    }
    if ($ExitCode -ne 0) {
        Exit $ExitCode
    }
}

try {
    Write-Host ""
    Write-Host "  ================================================================" -ForegroundColor DarkRed
    Write-Host "     DEIZA CODE — Autonomous Terminal Coding Agent (Windows)      " -ForegroundColor Yellow
    Write-Host "  ================================================================" -ForegroundColor DarkRed
    Write-Host ""
    Write-Host "  Iniciando instalador oficial de Deiza Code..." -ForegroundColor Gray
    Write-Host ""

    # 1. Comprobar Node.js
    $NodeCmd = Get-Command node -ErrorAction SilentlyContinue
    if (-not $NodeCmd) {
        Write-Host "  [!] Node.js no se ha encontrado en tu sistema." -ForegroundColor Yellow
        Write-Host "  Deiza Code requiere Node.js (>= 18) para funcionar." -ForegroundColor White
        Write-Host ""

        $installedNode = $false
        $WingetCmd = Get-Command winget -ErrorAction SilentlyContinue
        if ($WingetCmd) {
            Write-Host "  Se ha detectado 'winget' en tu equipo Windows." -ForegroundColor Cyan
            $choice = Read-Host "  ¿Deseas instalar Node.js LTS automáticamente con winget? [S/n]"
            if ($choice -eq "" -or $choice -match "^[sSyY]") {
                Write-Host "  ● Instalando Node.js LTS..." -ForegroundColor DarkYellow
                try {
                    & winget install OpenJS.NodeJS.LTS --accept-package-agreements --accept-source-agreements --silent
                    $MachinePath = [Environment]::GetEnvironmentVariable("Path", "Machine")
                    $UserPath = [Environment]::GetEnvironmentVariable("Path", "User")
                    $env:Path = "$MachinePath;$UserPath"
                    $NodeCmd = Get-Command node -ErrorAction SilentlyContinue
                    if ($NodeCmd) { $installedNode = $true }
                } catch {
                    Write-Host "  ✖ Error al instalar con winget." -ForegroundColor Red
                }
            }
        }

        # If still no node, offer direct MSI installer download
        if (-not $NodeCmd -and -not $installedNode) {
            Write-Host "  ¿Deseas descargar el instalador oficial de Node.js LTS (MSI)? [S/n]" -ForegroundColor Cyan
            $choiceMsi = Read-Host "  [S/n]"
            if ($choiceMsi -eq "" -or $choiceMsi -match "^[sSyY]") {
                $nodeMsiUrl = "https://nodejs.org/dist/v20.18.0/node-v20.18.0-x64.msi"
                $tempMsi = Join-Path $env:TEMP "nodejs-lts.msi"
                Write-Host "  ● Descargando instalador de Node.js..." -ForegroundColor DarkYellow
                Invoke-WebRequest -Uri $nodeMsiUrl -OutFile $tempMsi -UseBasicParsing
                Write-Host "  ● Ejecutando asistente de instalación de Node.js..." -ForegroundColor DarkYellow
                Start-Process msiexec.exe -ArgumentList "/i `"$tempMsi`"" -Wait
                $MachinePath = [Environment]::GetEnvironmentVariable("Path", "Machine")
                $UserPath = [Environment]::GetEnvironmentVariable("Path", "User")
                $env:Path = "$MachinePath;$UserPath"
                $NodeCmd = Get-Command node -ErrorAction SilentlyContinue
            }
        }

        if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
            Write-Host ""
            Write-Host "  ✖ ERROR: Node.js (>= 18) es necesario para ejecutar Deiza Code." -ForegroundColor Red
            Write-Host "  Por favor, descarga e instala Node.js gratis desde: https://nodejs.org" -ForegroundColor White
            Write-Host "  Una vez instalado, vuelve a ejecutar este instalador." -ForegroundColor Gray
            Write-Host ""
            Pause-Console 1
            return
        }
    }

    try {
        $nodeVerStr = & node -v
        Write-Host "  ✓ Node.js detectado: $nodeVerStr" -ForegroundColor Green
    } catch {}

    # 2. Configurar directorio de instalación
    $InstallDir = Join-Path $env:LOCALAPPDATA "DeizaCode"
    $BinDir = Join-Path $InstallDir "bin"

    if (-not (Test-Path $BinDir)) {
        New-Item -ItemType Directory -Path $BinDir -Force | Out-Null
    }

    $ScriptPath = Join-Path $BinDir "deiza-code.js"
    $CmdPath = Join-Path $BinDir "deiza.cmd"
    $CmdCodePath = Join-Path $BinDir "deiza-code.cmd"
    $Ps1Path = Join-Path $BinDir "deiza.ps1"

    # 3. Descarga del ejecutable oficial
    Write-Host "  ● Descargando el motor de Deiza Code..." -ForegroundColor DarkYellow -NoNewline
    Invoke-WebRequest -Uri "https://deiza.org/downloads/deiza-code.js" -OutFile $ScriptPath -UseBasicParsing
    Write-Host " [OK]" -ForegroundColor Green

    # 4. Configuración de wrappers ejecutables para CMD y PowerShell
    Write-Host "  ● Configurando ejecutables en $BinDir..." -ForegroundColor DarkYellow -NoNewline
    $CmdContent = "@echo off`r`nnode `"%~dp0deiza-code.js`" %*"
    Set-Content -Path $CmdPath -Value $CmdContent -Force
    Set-Content -Path $CmdCodePath -Value $CmdContent -Force

    $Ps1Content = "& node `"`$PSScriptRoot\deiza-code.js`" `$args"
    Set-Content -Path $Ps1Path -Value $Ps1Content -Force
    Write-Host " [OK]" -ForegroundColor Green

    # 5. Añadir al PATH de Usuario
    $UserPath = [Environment]::GetEnvironmentVariable("Path", "User")
    if ([string]::IsNullOrWhiteSpace($UserPath)) {
        [Environment]::SetEnvironmentVariable("Path", $BinDir, "User")
        $env:Path += ";$BinDir"
    } elseif ($UserPath -notlike "*$BinDir*") {
        [Environment]::SetEnvironmentVariable("Path", "$UserPath;$BinDir", "User")
        $env:Path += ";$BinDir"
    }

    # 6. Finalización
    Write-Host ""
    Write-Host "  ================================================================" -ForegroundColor Green
    Write-Host "     ✓ ¡Instalación de Deiza Code completada con éxito!            " -ForegroundColor Green
    Write-Host "  ================================================================" -ForegroundColor Green
    Write-Host ""
    Write-Host "  Puedes ejecutar el agente escribiendo:" -ForegroundColor Gray
    Write-Host "    deiza" -ForegroundColor Yellow -NoNewline
    Write-Host "   (en cualquier ventana de PowerShell, CMD o Terminal)" -ForegroundColor Gray
    Write-Host ""

    $launch = Read-Host "  ¿Deseas iniciar Deiza Code ahora mismo? [S/n]"
    if ($launch -eq "" -or $launch -match "^[sSyY]") {
        Write-Host ""
        & node $ScriptPath
    } else {
        Write-Host ""
        Write-Host "  ¡Listo! Abre una nueva terminal cuando quieras y escribe 'deiza'." -ForegroundColor Cyan
        Write-Host ""
        Pause-Console 0
    }
} catch {
    Write-Host ""
    Write-Host "  ✖ Ha ocurrido un error durante la instalación:" -ForegroundColor Red
    Write-Host "  $($_.Exception.Message)" -ForegroundColor Red
    Write-Host ""
    Pause-Console 1
}
