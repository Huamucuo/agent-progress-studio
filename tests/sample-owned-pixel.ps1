param([Parameter(Mandatory=$true)][int]$WindowProcessId,[Parameter(Mandatory=$true)][long]$WindowHandle,[Parameter(Mandatory=$true)][int]$TargetX,[Parameter(Mandatory=$true)][int]$TargetY)
$ErrorActionPreference='Stop'
Add-Type @'
using System;using System.Runtime.InteropServices;
public class APSOwnedPixel {
 [StructLayout(LayoutKind.Sequential)] public struct POINT{public int X,Y;public POINT(int x,int y){X=x;Y=y;}}
 [DllImport("user32.dll")] public static extern bool SetProcessDpiAwarenessContext(IntPtr c);
 [DllImport("user32.dll")] public static extern IntPtr SetThreadDpiAwarenessContext(IntPtr c);
 [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h,out uint p);
 [DllImport("user32.dll")] public static extern IntPtr WindowFromPoint(POINT p);
 [DllImport("user32.dll")] public static extern IntPtr GetAncestor(IntPtr h,uint flags);
 [DllImport("user32.dll")] public static extern IntPtr GetDC(IntPtr h);
 [DllImport("user32.dll")] public static extern int ReleaseDC(IntPtr h,IntPtr dc);
 [DllImport("gdi32.dll")] public static extern uint GetPixel(IntPtr dc,int x,int y);
}
'@
$task=Get-Process -Id $WindowProcessId
if($task.ProcessName -notin @('electron','AgentProgressStudio')){throw 'Only APS synthetic test surfaces may be sampled.'}
$owner=0;[void][APSOwnedPixel]::GetWindowThreadProcessId([IntPtr]$WindowHandle,[ref]$owner)
if($owner -ne $WindowProcessId){throw 'Unowned background surface.'}
[void][APSOwnedPixel]::SetProcessDpiAwarenessContext([IntPtr](-4))
[void][APSOwnedPixel]::SetThreadDpiAwarenessContext([IntPtr](-4))
$hit=[APSOwnedPixel]::WindowFromPoint([APSOwnedPixel+POINT]::new($TargetX,$TargetY))
$root=[APSOwnedPixel]::GetAncestor($hit,2)
if($root -ne [IntPtr]$WindowHandle){$hitOwner=0;[void][APSOwnedPixel]::GetWindowThreadProcessId($root,[ref]$hitOwner);throw ('Underlying hit target is not the explicitly owned test surface. Expected '+$WindowHandle+'; actual root '+$root.ToInt64()+'; owner '+$hitOwner)}
$dc=[APSOwnedPixel]::GetDC([IntPtr]::Zero)
try{$pixel=[APSOwnedPixel]::GetPixel($dc,$TargetX,$TargetY);if($pixel -eq [uint32]::MaxValue){throw 'Screen pixel unavailable.'};@{color=$pixel;underlyingOwnedWindow=$true;x=$TargetX;y=$TargetY} | ConvertTo-Json -Compress}
finally{[void][APSOwnedPixel]::ReleaseDC([IntPtr]::Zero,$dc)}
