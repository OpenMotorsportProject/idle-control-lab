# Run from the repository root after building the MSVC desktop executable.
param([string]$Executable = 'target/release/idle-control-lab.exe')
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
$env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS = '--force-renderer-accessibility'
$app = Start-Process -FilePath (Resolve-Path $Executable) -PassThru
try {
    $name = [System.Windows.Automation.AutomationElement]::NameProperty
    $heading = [System.Windows.Automation.PropertyCondition]::new($name, 'Loss landscape')
    $deadline = (Get-Date).AddSeconds(60)
    do {
        Start-Sleep -Milliseconds 750
        $app.Refresh()
        if ($app.HasExited) { throw "Idle Control Lab exited with code $($app.ExitCode)" }
        if ($app.MainWindowHandle -eq [IntPtr]::Zero) { continue }
        $window = [System.Windows.Automation.AutomationElement]::FromHandle($app.MainWindowHandle)
        $found = $window.FindFirst([System.Windows.Automation.TreeScope]::Descendants, $heading)
        if ($null -ne $found) {
            $layout = [System.Windows.Automation.PropertyCondition]::new($name, 'Network layout')
            if ($window.FindFirst([System.Windows.Automation.TreeScope]::Descendants, $layout)) {
                Write-Output 'WebView2 rendered the neural lab and network layout.'
                return
            }
        }
    } while ((Get-Date) -lt $deadline)
    throw 'WebView2 did not expose the running neural lab within 60 seconds.'
} finally {
    if (!$app.HasExited) { Stop-Process -Id $app.Id }
    $app.Dispose()
}
