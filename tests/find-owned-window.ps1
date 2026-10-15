param([Parameter(Mandatory=$true)][int]$WindowProcessId,[ValidateSet('main','floating','notice')][string]$WindowKind='floating',[switch]$MaximizeMain)
$ErrorActionPreference='Stop'
Add-Type @'
using System;using System.Text;using System.Collections.Generic;using System.Runtime.InteropServices;
public class APSOwnedFinder {
 [StructLayout(LayoutKind.Sequential)] public struct RECT {public int Left,Top,Right,Bottom;}
 [StructLayout(LayoutKind.Sequential)] public struct POINT {public int X,Y;}
 public delegate bool Visitor(IntPtr h,IntPtr p);
 [DllImport("user32.dll")] public static extern bool EnumWindows(Visitor visit,IntPtr p);
 [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h,out uint p);
 [DllImport("user32.dll")] public static extern int GetWindowText(IntPtr h,StringBuilder s,int n);
 [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h,out RECT r);
 [DllImport("user32.dll")] public static extern uint GetDpiForWindow(IntPtr h);
 [DllImport("user32.dll")] public static extern bool GetCursorPos(out POINT p);
 [DllImport("user32.dll")] public static extern IntPtr SetThreadDpiAwarenessContext(IntPtr c);
 [DllImport("user32.dll")] public static extern bool SetProcessDpiAwarenessContext(IntPtr c);
 [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h,int state);
 [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
 [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr h,IntPtr after,int x,int y,int width,int height,uint flags);
 public static IntPtr Find(uint pid,string suffix) {
  var found=new List<IntPtr>();EnumWindows((h,p)=>{uint owner;GetWindowThreadProcessId(h,out owner);if(owner==pid){var title=new StringBuilder(512);GetWindowText(h,title,512);if(title.ToString().EndsWith(suffix,StringComparison.Ordinal))found.Add(h);}return true;},IntPtr.Zero);
  if(found.Count!=1)throw new Exception("Expected one explicitly owned APS window");return found[0];
 }
}
'@
$task=Get-Process -Id $WindowProcessId
if($task.ProcessName -notin @('electron','AgentProgressStudio')){throw 'Only owned APS test windows may be inspected.'}
[void][APSOwnedFinder]::SetProcessDpiAwarenessContext([IntPtr](-4))
[void][APSOwnedFinder]::SetThreadDpiAwarenessContext([IntPtr](-4))
$suffix=if($WindowKind -eq 'floating'){'Floating monitor'}elseif($WindowKind -eq 'notice'){'Notification'}else{'Agent Progress Studio'}
$handle=[APSOwnedFinder]::Find([uint32]$WindowProcessId,$suffix)
if($MaximizeMain){if($WindowKind -ne 'main'){throw 'Only the explicitly owned main test window can maximize.'};[void][APSOwnedFinder]::ShowWindow($handle,3);[void][APSOwnedFinder]::SetWindowPos($handle,[IntPtr](-1),0,0,0,0,0x13);[void][APSOwnedFinder]::SetForegroundWindow($handle)}
$rect=New-Object APSOwnedFinder+RECT
if(-not[APSOwnedFinder]::GetWindowRect($handle,[ref]$rect)){throw 'Owned window rectangle unavailable.'}
$cursor=New-Object APSOwnedFinder+POINT
if(-not[APSOwnedFinder]::GetCursorPos([ref]$cursor)){throw 'Cursor position unavailable.'}
@{handle=$handle.ToInt64().ToString();scale=([APSOwnedFinder]::GetDpiForWindow($handle)/96);x=$rect.Left;y=$rect.Top;width=($rect.Right-$rect.Left);height=($rect.Bottom-$rect.Top);cursor=@{x=$cursor.X;y=$cursor.Y}} | ConvertTo-Json -Compress
