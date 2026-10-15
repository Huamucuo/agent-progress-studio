param([Parameter(Mandatory=$true)][int]$WindowProcessId,[Parameter(Mandatory=$true)][long]$WindowHandle,[Parameter(Mandatory=$true)][long]$OverlayHandle,[Parameter(Mandatory=$true)][int]$TargetX,[Parameter(Mandatory=$true)][int]$TargetY)
$ErrorActionPreference='Stop'
Add-Type @'
using System;using System.Runtime.InteropServices;
public class APSOwnedPointer {
 [StructLayout(LayoutKind.Sequential)] public struct POINT{public int X,Y;public POINT(int x,int y){X=x;Y=y;}}
 [DllImport("user32.dll")]public static extern bool SetProcessDpiAwarenessContext(IntPtr c);
 [DllImport("user32.dll")]public static extern uint GetWindowThreadProcessId(IntPtr h,out uint p);
 [DllImport("user32.dll")]public static extern bool SetForegroundWindow(IntPtr h);
 [DllImport("user32.dll")]public static extern bool SetWindowPos(IntPtr h,IntPtr after,int x,int y,int width,int height,uint flags);
 [DllImport("user32.dll")]public static extern IntPtr WindowFromPoint(POINT p);
 [DllImport("user32.dll")]public static extern IntPtr GetAncestor(IntPtr h,uint flags);
 [DllImport("user32.dll")]public static extern bool SetCursorPos(int x,int y);
}
'@
[void][APSOwnedPointer]::SetProcessDpiAwarenessContext([IntPtr](-4))
$task=Get-Process -Id $WindowProcessId
if($task.ProcessName -notin @('electron','AgentProgressStudio')){throw 'Only APS test windows may receive input.'}
foreach($handle in @($WindowHandle,$OverlayHandle)){$owner=0;[void][APSOwnedPointer]::GetWindowThreadProcessId([IntPtr]$handle,[ref]$owner);if($owner -ne $WindowProcessId){throw 'Unowned test window.'}}
[void][APSOwnedPointer]::SetForegroundWindow([IntPtr]$WindowHandle)
[void][APSOwnedPointer]::SetWindowPos([IntPtr]$OverlayHandle,[IntPtr](-1),0,0,0,0,0x13)
$hit=[APSOwnedPointer]::WindowFromPoint([APSOwnedPointer+POINT]::new($TargetX,$TargetY));$owner=0
[void][APSOwnedPointer]::GetWindowThreadProcessId($hit,[ref]$owner)
$root=[APSOwnedPointer]::GetAncestor($hit,2)
if($root -ne [IntPtr]$WindowHandle -and $root -ne [IntPtr]$OverlayHandle){throw 'The hover point belongs to another application; refusing input.'}
if(-not[APSOwnedPointer]::SetCursorPos($TargetX,$TargetY)){throw 'Pointer move failed.'}
