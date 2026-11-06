# Run on an x64 Windows host with MSVC and the Windows SDK installed.
$ErrorActionPreference = 'Stop'
$PSNativeCommandUseErrorActionPreference = $true
$version = $env:RELEASE_VERSION
if ($version -notmatch '^\d+\.\d+\.\d+$') { throw 'Expected RELEASE_VERSION=x.y.z' }
$name = "idle-control-lab-$version-windows-x64"
$stage = New-Item -Path "dist/package/$name" -ItemType Directory -Force
$rc = Get-ChildItem "${env:ProgramFiles(x86)}/Windows Kits/10/bin/*/x64/rc.exe" |
    Sort-Object { [Version]$_.Directory.Parent.Name } -Descending | Select-Object -First 1
if (!$rc) { throw 'Windows SDK resource compiler is missing' }
$icon = (Resolve-Path 'desktop/icons/IdleControlLab.ico').Path.Replace('\','/')
$quad = $version.Replace('.',',') + ',0'
@"
1 ICON "$icon"
1 VERSIONINFO
FILEVERSION $quad
PRODUCTVERSION $quad
FILEOS 0x40004L
FILETYPE 1
BEGIN
 BLOCK "StringFileInfo"
 BEGIN
  BLOCK "040904b0"
  BEGIN
   VALUE "FileDescription", "Idle Control Lab\0"
   VALUE "ProductName", "Idle Control Lab\0"
   VALUE "ProductVersion", "$version\0"
   VALUE "FileVersion", "$version\0"
  END
 END
 BLOCK "VarFileInfo"
 BEGIN
  VALUE "Translation", 0x0409, 1200
 END
END
"@ | Set-Content dist/package/lab.rc -Encoding ascii
& $rc.FullName /nologo /fo dist/package/lab.res dist/package/lab.rc
$resource = (Resolve-Path dist/package/lab.res).Path
python script/release-build.py -p idle-control-lab -- -C "link-arg=$resource"
Copy-Item target/release/idle-control-lab.exe, LICENSE, NOTICE, packaging/Windows-README.txt $stage
python packaging/notices.py "$stage/third-party" x86_64-pc-windows-msvc
$zip = "dist/$name.zip"
Compress-Archive -Path $stage.FullName -DestinationPath $zip -Force
Expand-Archive $zip dist/package/extracted -Force
$exe = (Get-Item "dist/package/extracted/$name/idle-control-lab.exe")
if ($exe.VersionInfo.ProductVersion -ne $version) { throw 'Incorrect executable version' }
& ./script/windows-smoke.ps1 -Executable $exe.FullName
