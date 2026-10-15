param([Parameter(Mandatory=$true)][int]$WindowProcessId,[Parameter(Mandatory=$true)][string]$OutputPath)
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Drawing
Add-Type @'
using System;
using System.Runtime.InteropServices;
public class APSWindowCapture {
 [DllImport("user32.dll")] public static extern bool SetProcessDpiAwarenessContext(IntPtr context);
 [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left,Top,Right,Bottom; }
 [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h,out RECT r);
 [DllImport("user32.dll")] public static extern bool PrintWindow(IntPtr h,IntPtr dc,uint flags);
}
'@
[void][APSWindowCapture]::SetProcessDpiAwarenessContext([IntPtr](-4))
$process=Get-Process -Id $WindowProcessId
if($process.ProcessName -ne 'AgentProgressStudio'){throw 'Only the owned packaged application can be captured.'}
$handle=$process.MainWindowHandle
if($handle -eq [IntPtr]::Zero){throw 'Native window not available.'}
$rect=New-Object APSWindowCapture+RECT
if(-not[APSWindowCapture]::GetWindowRect($handle,[ref]$rect)){throw 'Cannot identify native window bounds.'}
$bitmap=New-Object System.Drawing.Bitmap (($rect.Right-$rect.Left),($rect.Bottom-$rect.Top))
$graphics=[Drawing.Graphics]::FromImage($bitmap)
$dc=$graphics.GetHdc()
try{if(-not[APSWindowCapture]::PrintWindow($handle,$dc,2)){throw 'Cannot render owned window.'}}finally{$graphics.ReleaseHdc($dc)}
try{$bitmap.Save($OutputPath,[Drawing.Imaging.ImageFormat]::Png)}finally{$graphics.Dispose();$bitmap.Dispose()}
