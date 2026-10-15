param([Parameter(Mandatory=$true)][int]$WindowProcessId,[Parameter(Mandatory=$true)][long]$WindowHandle)
$ErrorActionPreference='Stop'
Add-Type @'
using System;using System.Runtime.InteropServices;
public class APSOwnedRegion {
 [StructLayout(LayoutKind.Sequential)] public struct RECT {public int Left,Top,Right,Bottom;}
 [DllImport("user32.dll")] public static extern bool SetProcessDpiAwarenessContext(IntPtr c);
 [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h,out uint p);
 [DllImport("user32.dll")] public static extern int GetWindowRgn(IntPtr h,IntPtr r);
 [DllImport("gdi32.dll")] public static extern IntPtr CreateRectRgn(int a,int b,int c,int d);
 [DllImport("gdi32.dll")] public static extern int GetRgnBox(IntPtr h,out RECT r);
 [DllImport("gdi32.dll")] public static extern bool DeleteObject(IntPtr h);
}
'@
[void][APSOwnedRegion]::SetProcessDpiAwarenessContext([IntPtr](-4))
$task=Get-Process -Id $WindowProcessId
if($task.ProcessName -notin @('electron','AgentProgressStudio')){throw 'Only APS test windows may be inspected.'}
$owner=0;[void][APSOwnedRegion]::GetWindowThreadProcessId([IntPtr]$WindowHandle,[ref]$owner)
if($owner -ne $WindowProcessId){throw 'Unowned window.'}
$region=[APSOwnedRegion]::CreateRectRgn(0,0,0,0)
try{
 $result=[APSOwnedRegion]::GetWindowRgn([IntPtr]$WindowHandle,$region)
 $box=New-Object APSOwnedRegion+RECT
 [void][APSOwnedRegion]::GetRgnBox($region,[ref]$box)
 @{kind=$result;x=$box.Left;y=$box.Top;width=($box.Right-$box.Left);height=($box.Bottom-$box.Top)} | ConvertTo-Json -Compress
}finally{[void][APSOwnedRegion]::DeleteObject($region)}
