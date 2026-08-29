// Windows-only containment host, .NET Framework 4.x. No shell and no elevation.
// Atomic JOB_LIST assignment closes the suspended-process orphan race.
using System;
using System.IO;
using System.Text;
using System.Linq;
using System.Security.Principal;
using System.Security.Cryptography;
using System.Runtime.InteropServices;

internal static class ProcessHost {
  [StructLayout(LayoutKind.Sequential)] struct BasicLimit {public long PerProcess,PerJob; public uint Flags; public UIntPtr Min,Max;public uint Active;public UIntPtr Affinity; public uint Priority,Scheduling;}
  [StructLayout(LayoutKind.Sequential)] struct Io {public ulong ReadOps,WriteOps,OtherOps,ReadBytes,WriteBytes,OtherBytes;}
  [StructLayout(LayoutKind.Sequential)] struct ExtendedLimit {public BasicLimit Basic;public Io Io;public UIntPtr ProcessMemory,JobMemory,PeakProcess,PeakJob;}
  [StructLayout(LayoutKind.Sequential,CharSet=CharSet.Unicode)] struct Startup {public uint cb;public string Reserved,Desktop,Title; public uint X,Y,XSize,YSize,XCount,YCount,Fill,Flags;public ushort Show,Reserved2;public IntPtr ReservedPtr,Input,Output,Error;}
  [StructLayout(LayoutKind.Sequential)] struct StartupEx {public Startup Startup;public IntPtr Attributes;}
  [StructLayout(LayoutKind.Sequential)] struct ProcessInfo {public IntPtr Process,Thread;public uint Pid,Tid;}
  [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern IntPtr CreateJobObject(IntPtr security,string name);
  [DllImport("kernel32.dll",SetLastError=true)] static extern bool SetInformationJobObject(IntPtr job,int kind,ref ExtendedLimit value,uint length);
  [DllImport("kernel32.dll",SetLastError=true)] static extern bool InitializeProcThreadAttributeList(IntPtr list,int count,int flags,ref IntPtr size);
  [DllImport("kernel32.dll",SetLastError=true)] static extern bool UpdateProcThreadAttribute(IntPtr list,uint flags,IntPtr attribute,IntPtr value,IntPtr size,IntPtr previous,IntPtr returned);
  [DllImport("kernel32.dll")] static extern void DeleteProcThreadAttributeList(IntPtr list);
  [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern bool CreateProcess(string app,StringBuilder args,IntPtr ps,IntPtr ts,bool inherit,uint flags,IntPtr environment,string cwd,ref StartupEx startup,out ProcessInfo info);
  [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr handle);
  [DllImport("kernel32.dll")] static extern IntPtr GetStdHandle(int id);
  [DllImport("kernel32.dll",SetLastError=true)] static extern bool SetHandleInformation(IntPtr handle,uint mask,uint flags);
  [DllImport("kernel32.dll",SetLastError=true)] static extern IntPtr OpenProcess(uint access,bool inherit,uint pid);
  [DllImport("kernel32.dll")] static extern uint WaitForMultipleObjects(uint count,IntPtr[] handles,bool all,uint timeout);
  [DllImport("kernel32.dll")] static extern bool GetExitCodeProcess(IntPtr process,out uint code);
  [DllImport("kernel32.dll")] static extern bool IsProcessInJob(IntPtr process,IntPtr job,out bool inside);
  static string Quote(string value){return "\""+value.Replace("\\\"","\\\\\"").Replace("\"","\\\"")+"\"";}
  static bool Reparse(string file){for(string p=Path.GetFullPath(file);!String.IsNullOrEmpty(p);p=Path.GetDirectoryName(p)){if((File.GetAttributes(p)&FileAttributes.ReparsePoint)!=0)return true;}return false;}
  static int Main(string[] args){
    if(new WindowsPrincipal(WindowsIdentity.GetCurrent()).IsInRole(WindowsBuiltInRole.Administrator))return 77;
    if(args.Length==1 && args[0]=="--check"){Console.WriteLine("{\"nonElevated\":true,\"containment\":\"WindowsJobObject\"}");return 0;}
    // engine, collector, hash, parent PID, timeout, action, optional event enums/count.
    if(args.Length!=6 && args.Length!=10)return 78;
    IntPtr job=IntPtr.Zero,attributes=IntPtr.Zero,jobValue=IntPtr.Zero,handlesValue=IntPtr.Zero,parent=IntPtr.Zero;
    ProcessInfo child=new ProcessInfo();
    try {
      string engine=Path.GetFullPath(args[0]),script=Path.GetFullPath(args[1]);
      string expected=Path.GetFullPath(Path.Combine(Environment.CurrentDirectory,"scripts","diagnostics","collect.ps1"));
      if(!String.Equals(script,expected,StringComparison.OrdinalIgnoreCase)||Reparse(script)||Reparse(engine))return 78;
      string engineName=Path.GetFileName(engine).ToLowerInvariant();if(engineName!="powershell.exe"&&engineName!="pwsh.exe")return 78;
      string[] actions={"windows.system.summary","windows.resource.usage","windows.services.important","windows.update.status","network.ip.configuration","network.gateway.validate","network.dns.validate","network.route.summary","eventlog.query"};
      if(!actions.Contains(args[5]))return 78;
      uint parentPid,timeout;if(!UInt32.TryParse(args[3],out parentPid)||!UInt32.TryParse(args[4],out timeout)||timeout<100||timeout>30000)return 78;
      if(args[5]=="eventlog.query") {int limit;if(args.Length!=10||!new[]{"System","Application"}.Contains(args[6])||!new[]{"Critical","Error","Warning","Information"}.Contains(args[7])||!new[]{"1h","6h","24h","7d"}.Contains(args[8])||!Int32.TryParse(args[9],out limit)||limit<1||limit>100)return 78;}
      else if(args.Length!=6)return 78;
      parent=OpenProcess(0x00100000,false,parentPid);if(parent==IntPtr.Zero)return 79;
      using(var lockedScript=new FileStream(script,FileMode.Open,FileAccess.Read,FileShare.Read)) {
        string hash;using(var sha=SHA256.Create()){hash=BitConverter.ToString(sha.ComputeHash(lockedScript)).Replace("-","").ToLowerInvariant();}
        if(!String.Equals(hash,args[2],StringComparison.Ordinal))return 76;
        job=CreateJobObject(IntPtr.Zero,null);if(job==IntPtr.Zero)return 79;
        var limits=new ExtendedLimit();limits.Basic.Flags=0x2000; // KILL_ON_JOB_CLOSE; no breakaway flags
        if(!SetInformationJobObject(job,9,ref limits,(uint)Marshal.SizeOf(limits)))return 79;
        IntPtr size=IntPtr.Zero;InitializeProcThreadAttributeList(IntPtr.Zero,2,0,ref size);
        attributes=Marshal.AllocHGlobal(size);if(!InitializeProcThreadAttributeList(attributes,2,0,ref size))return 79;
        jobValue=Marshal.AllocHGlobal(IntPtr.Size);Marshal.WriteIntPtr(jobValue,job);
        if(!UpdateProcThreadAttribute(attributes,0,new IntPtr(0x2000d),jobValue,new IntPtr(IntPtr.Size),IntPtr.Zero,IntPtr.Zero))return 79;
        var si=new StartupEx();si.Startup.cb=(uint)Marshal.SizeOf(si);si.Startup.Flags=0x100;si.Startup.Input=GetStdHandle(-10);si.Startup.Output=GetStdHandle(-11);si.Startup.Error=GetStdHandle(-12);si.Attributes=attributes;
        var inherited=new[]{si.Startup.Input,si.Startup.Output,si.Startup.Error};handlesValue=Marshal.AllocHGlobal(IntPtr.Size*3);
        for(int i=0;i<3;i++){if(!SetHandleInformation(inherited[i],1,1))return 79;Marshal.WriteIntPtr(handlesValue,i*IntPtr.Size,inherited[i]);}
        if(!UpdateProcThreadAttribute(attributes,0,new IntPtr(0x20002),handlesValue,new IntPtr(IntPtr.Size*3),IntPtr.Zero,IntPtr.Zero))return 79;
        var cmd=new StringBuilder(Quote(engine)+" -NoProfile -NonInteractive -File "+Quote(script)+" -ActionId "+Quote(args[5]));
        if(args.Length==10)cmd.Append(" -LogName "+Quote(args[6])+" -Level "+Quote(args[7])+" -TimeWindow "+Quote(args[8])+" -Limit "+args[9]);
        if(!CreateProcess(engine,cmd,IntPtr.Zero,IntPtr.Zero,true,0x08080000,IntPtr.Zero,Environment.CurrentDirectory,ref si,out child))return 79;
        bool inside;if(!IsProcessInJob(child.Process,job,out inside)||!inside)return 79;
        uint wait=WaitForMultipleObjects(2,new[]{child.Process,parent},false,timeout);
        if(wait==258)return 74; // hard deadline
        if(wait!=0)return 75; // parent exit or failure: close job, kill all descendants
        uint code;if(!GetExitCodeProcess(child.Process,out code))return 79;return (int)code;
      }
    } catch {return 79;} finally {
      if(job!=IntPtr.Zero)CloseHandle(job);
      if(child.Thread!=IntPtr.Zero)CloseHandle(child.Thread);if(child.Process!=IntPtr.Zero)CloseHandle(child.Process);if(parent!=IntPtr.Zero)CloseHandle(parent);
      if(attributes!=IntPtr.Zero){DeleteProcThreadAttributeList(attributes);Marshal.FreeHGlobal(attributes);}if(jobValue!=IntPtr.Zero)Marshal.FreeHGlobal(jobValue);if(handlesValue!=IntPtr.Zero)Marshal.FreeHGlobal(handlesValue);
    }
  }
}
