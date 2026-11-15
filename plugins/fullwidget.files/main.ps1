# FullWidget official plugin "fullwidget.files". The work is in Files.cs, compiled here by Windows
# PowerShell (nothing to install, nothing prebuilt: what runs is the source next to this file).
$ErrorActionPreference = 'Stop'
$src = Join-Path $PSScriptRoot 'Files.cs'
Add-Type -Path $src -ReferencedAssemblies System.Web.Extensions, System.Windows.Forms, System.Drawing
[FwFiles]::Run()
