param([Parameter(Mandatory=$true)][int]$WindowProcessId,[Parameter(Mandatory=$true)][long]$WindowHandle,[Parameter(Mandatory=$true)][int]$TargetX,[Parameter(Mandatory=$true)][int]$TargetY,[switch]$ResizeGrip,[int]$StartX,[int]$StartY)
$ErrorActionPreference='Stop'
Add-Type @'
using System;using System.Runtime.InteropServices;using System.Threading;
public class APSOwnedDrag {
 [StructLayout(LayoutKind.Sequential)] public struct RECT{public int L,T,R,B;}
 [StructLayout(LayoutKind.Sequential)] public struct POINT{public int X,Y;}
 [DllImport("user32.dll")]public static extern bool SetProcessDpiAwarenessContext(IntPtr c);
 [DllImport("user32.dll")]public static extern IntPtr SetThreadDpiAwarenessContext(IntPtr c);
 [DllImport("user32.dll")]public static extern uint GetWindowThreadProcessId(IntPtr h,out uint p);
 [DllImport("user32.dll")]public static extern bool GetWindowRect(IntPtr h,out RECT r);
 [DllImport("user32.dll")]public static extern bool SetForegroundWindow(IntPtr h);
 [DllImport("user32.dll")]public static extern bool SetCursorPos(int x,int y);
 [DllImport("user32.dll")]public static extern IntPtr WindowFromPoint(POINT p);
 [DllImport("user32.dll")]public static extern IntPtr GetAncestor(IntPtr h,uint flags);
 [DllImport("user32.dll")]public static extern void mouse_event(uint flags,uint x,uint y,uint data,UIntPtr extra);
}
'@
[void][APSOwnedDrag]::SetProcessDpiAwarenessContext([IntPtr](-4));$h=[IntPtr]$WindowHandle;$owner=0
[void][APSOwnedDrag]::SetThreadDpiAwarenessContext([IntPtr](-4))
[void][APSOwnedDrag]::GetWindowThreadProcessId($h,[ref]$owner)
if($owner -ne $WindowProcessId){throw 'Handle is not owned by test application.'}
$process=Get-Process -Id $WindowProcessId
if($process.ProcessName -notin @('electron','AgentProgressStudio')){throw 'Only APS test application windows may be moved.'}
$rect=New-Object APSOwnedDrag+RECT;if(-not[APSOwnedDrag]::GetWindowRect($h,[ref]$rect)){throw 'Window missing.'}
[void][APSOwnedDrag]::SetForegroundWindow($h)
$sx=$rect.L+60;$sy=$rect.T+18
if($ResizeGrip){$sx=$StartX;$sy=$StartY}
[void][APSOwnedDrag]::SetCursorPos($sx,$sy);[Threading.Thread]::Sleep(100)
$point=New-Object APSOwnedDrag+POINT;$point.X=$sx;$point.Y=$sy
if([APSOwnedDrag]::GetAncestor([APSOwnedDrag]::WindowFromPoint($point),2) -ne $h){throw 'Drag start is not on the owned floating window.'}
[APSOwnedDrag]::mouse_event(2,0,0,0,[UIntPtr]::Zero)
try{for($i=1;$i -le 20;$i++){[void][APSOwnedDrag]::SetCursorPos([int]($sx+($TargetX-$rect.L)*$i/20),[int]($sy+($TargetY-$rect.T)*$i/20));[Threading.Thread]::Sleep(35)};[Threading.Thread]::Sleep(300)}finally{[APSOwnedDrag]::mouse_event(4,0,0,0,[UIntPtr]::Zero)}
[Threading.Thread]::Sleep(300)
