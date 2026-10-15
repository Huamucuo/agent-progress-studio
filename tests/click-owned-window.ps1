param([Parameter(Mandatory=$true)][int]$WindowProcessId,[Parameter(Mandatory=$true)][long]$TargetHandle,[Parameter(Mandatory=$true)][long]$OverlayHandle,[Parameter(Mandatory=$true)][int]$TargetX,[Parameter(Mandatory=$true)][int]$TargetY,[switch]$ApproachFirst,[switch]$ApproachOnly,[int]$EntryX,[int]$EntryY)
$ErrorActionPreference='Stop'
Add-Type @'
using System;using System.Runtime.InteropServices;using System.Threading;
public class APSOwnedClick {
 [StructLayout(LayoutKind.Sequential)] public struct POINT{public int X,Y;public POINT(int x,int y){X=x;Y=y;}}
 [StructLayout(LayoutKind.Sequential)] public struct RECT{public int Left,Top,Right,Bottom;}
 [DllImport("user32.dll")]public static extern bool SetProcessDpiAwarenessContext(IntPtr c);
 [DllImport("user32.dll")]public static extern IntPtr SetThreadDpiAwarenessContext(IntPtr c);
 [DllImport("user32.dll")]public static extern bool GetWindowRect(IntPtr h,out RECT r);
 [DllImport("user32.dll")]public static extern int GetWindowRgn(IntPtr h,IntPtr r);
 [DllImport("gdi32.dll")]public static extern IntPtr CreateRectRgn(int a,int b,int c,int d);
 [DllImport("gdi32.dll")]public static extern int GetRgnBox(IntPtr h,out RECT r);
 [DllImport("gdi32.dll")]public static extern bool DeleteObject(IntPtr h);
 [DllImport("user32.dll")]public static extern uint GetWindowThreadProcessId(IntPtr h,out uint p);
 [DllImport("user32.dll")]public static extern bool SetForegroundWindow(IntPtr h);
 [DllImport("user32.dll")]public static extern bool SetWindowPos(IntPtr h,IntPtr after,int x,int y,int width,int height,uint flags);
 [DllImport("user32.dll")]public static extern IntPtr WindowFromPoint(POINT p);
 [DllImport("user32.dll")]public static extern IntPtr GetAncestor(IntPtr h,uint flags);
 [DllImport("user32.dll")]public static extern bool SetCursorPos(int x,int y);
 [DllImport("user32.dll")]public static extern void mouse_event(uint flags,uint x,uint y,uint data,UIntPtr extra);
}
'@
[void][APSOwnedClick]::SetProcessDpiAwarenessContext([IntPtr](-4))
[void][APSOwnedClick]::SetThreadDpiAwarenessContext([IntPtr](-4))
$process=Get-Process -Id $WindowProcessId
if($process.ProcessName -notin @('electron','AgentProgressStudio')){throw 'Only APS test windows may be clicked.'}
foreach($handle in @($TargetHandle,$OverlayHandle)){$owner=0;[void][APSOwnedClick]::GetWindowThreadProcessId([IntPtr]$handle,[ref]$owner);if($owner -ne $WindowProcessId){throw 'Unowned test window.'}}
[void][APSOwnedClick]::SetForegroundWindow([IntPtr]$TargetHandle)
if($ApproachFirst){
 [void][APSOwnedClick]::SetWindowPos([IntPtr]$OverlayHandle,[IntPtr](-1),0,0,0,0,0x13)
 $visibleRegion=[APSOwnedClick]::CreateRectRgn(0,0,0,0)
 try{
  if([APSOwnedClick]::GetWindowRgn([IntPtr]$OverlayHandle,$visibleRegion) -le 1){throw 'No visible native cue region.'}
  $regionBox=New-Object APSOwnedClick+RECT;$windowBox=New-Object APSOwnedClick+RECT
  [void][APSOwnedClick]::GetRgnBox($visibleRegion,[ref]$regionBox)
  [void][APSOwnedClick]::GetWindowRect([IntPtr]$OverlayHandle,[ref]$windowBox)
  $EntryX=$windowBox.Left+$regionBox.Left+[Math]::Floor(($regionBox.Right-$regionBox.Left)/2)
  $EntryY=$windowBox.Top+$regionBox.Top+[Math]::Floor(($regionBox.Bottom-$regionBox.Top)/2)
  # Approach from inside the work area, not the display's last rounded pixel.
  # The native proximity observer reveals the cue before any click occurs.
  if(($regionBox.Right-$regionBox.Left) -lt ($regionBox.Bottom-$regionBox.Top)){$EntryX=if($regionBox.Left -eq 0){$windowBox.Left+12}else{$windowBox.Left+$regionBox.Right-12}}
  else{$EntryY=if($regionBox.Top -eq 0){$windowBox.Top+12}else{$windowBox.Top+$regionBox.Bottom-12}}
 }finally{[void][APSOwnedClick]::DeleteObject($visibleRegion)}
 $entryHit=[APSOwnedClick]::WindowFromPoint([APSOwnedClick+POINT]::new($EntryX,$EntryY));$owner=0
 [void][APSOwnedClick]::GetWindowThreadProcessId($entryHit,[ref]$owner)
 $entryRoot=[APSOwnedClick]::GetAncestor($entryHit,2)
 if($entryRoot -ne [IntPtr]$TargetHandle -and $entryRoot -ne [IntPtr]$OverlayHandle){throw 'The entry point is outside the explicitly owned test windows; refusing input.'}
 [void][APSOwnedClick]::SetCursorPos($EntryX,$EntryY);[Threading.Thread]::Sleep(450)
 if($ApproachOnly){exit 0}
}
# When clicking the tag itself, place that verified owned HWND above the
# isolated test background. Keep click-through notice/underlay order unchanged.
if($TargetHandle -eq $OverlayHandle){[void][APSOwnedClick]::SetWindowPos([IntPtr]$TargetHandle,[IntPtr](-1),0,0,0,0,0x13)}
[void][APSOwnedClick]::SetCursorPos($TargetX,$TargetY);[Threading.Thread]::Sleep(150)
$hit=[APSOwnedClick]::WindowFromPoint([APSOwnedClick+POINT]::new($TargetX,$TargetY));$owner=0
[void][APSOwnedClick]::GetWindowThreadProcessId($hit,[ref]$owner)
$hitRoot=[APSOwnedClick]::GetAncestor($hit,2)
# Chromium may own a child HWND in its sandboxed renderer process. Its native
# root must still be one of the two handles verified against the test PID.
if($hitRoot -ne [IntPtr]$TargetHandle -and $hitRoot -ne [IntPtr]$OverlayHandle){throw 'The click point is outside the explicitly owned test windows; refusing input.'}
[APSOwnedClick]::mouse_event(2,0,0,0,[UIntPtr]::Zero)
try{[Threading.Thread]::Sleep(60)}finally{[APSOwnedClick]::mouse_event(4,0,0,0,[UIntPtr]::Zero)}
