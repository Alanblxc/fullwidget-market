# FullWidget official plugin "fullwidget.perf". The work is in Perf.cs, compiled here by Windows
# PowerShell (nothing to install, nothing prebuilt: what runs is the source next to this file).
$ErrorActionPreference = 'Stop'
$src = Join-Path $PSScriptRoot 'Perf.cs'
Add-Type -Path $src -ReferencedAssemblies System.Web.Extensions
[FwPerf]::Run()
