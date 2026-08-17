using System;
using System.Diagnostics;
using System.Runtime.InteropServices;

namespace DesktopApp;

public static class JobObjectHelper
{
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern IntPtr CreateJobObject(IntPtr lpJobAttributes, string? lpName);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool SetInformationJobObject(
        IntPtr hJob,
        int JobObjectInformationClass,
        IntPtr lpJobObjectInformation,
        uint cbJobObjectInformationLength);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool AssignProcessToJobObject(IntPtr hJob, IntPtr hProcess);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool CloseHandle(IntPtr hObject);

    private const int JobObjectExtendedLimitInformation = 9;
    private const uint JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE = 0x00002000;

    private static IntPtr _jobHandle = IntPtr.Zero;
    private static readonly object _lock = new();

    static JobObjectHelper()
    {
        InitializeJobObject();
    }

    private static void InitializeJobObject()
    {
        if (!OperatingSystem.IsWindows()) return;

        lock (_lock)
        {
            if (_jobHandle != IntPtr.Zero) return;

            _jobHandle = CreateJobObject(IntPtr.Zero, null);
            if (_jobHandle == IntPtr.Zero)
            {
                Debug.WriteLine($"Failed to create JobObject: {Marshal.GetLastWin32Error()}");
                return;
            }

            var basicInfo = new JOBOBJECT_BASIC_LIMIT_INFORMATION
            {
                LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE
            };

            var extendedInfo = new JOBOBJECT_EXTENDED_LIMIT_INFORMATION
            {
                BasicLimitInformation = basicInfo
            };

            int length = Marshal.SizeOf(typeof(JOBOBJECT_EXTENDED_LIMIT_INFORMATION));
            IntPtr extendedInfoPtr = Marshal.AllocHGlobal(length);
            try
            {
                Marshal.StructureToPtr(extendedInfo, extendedInfoPtr, false);
                if (!SetInformationJobObject(_jobHandle, JobObjectExtendedLimitInformation, extendedInfoPtr, (uint)length))
                {
                    Debug.WriteLine($"Failed to set JobObject limit: {Marshal.GetLastWin32Error()}");
                }
            }
            finally
            {
                Marshal.FreeHGlobal(extendedInfoPtr);
            }
        }
    }

    public static bool AddProcess(Process process)
    {
        if (!OperatingSystem.IsWindows()) return false;

        try
        {
            if (process == null || process.HasExited) return false;
            InitializeJobObject();
            if (_jobHandle == IntPtr.Zero) return false;

            return AssignProcessToJobObject(_jobHandle, process.Handle);
        }
        catch (Exception ex)
        {
            Debug.WriteLine($"Failed to assign process to JobObject: {ex.Message}");
            return false;
        }
    }
}

[StructLayout(LayoutKind.Sequential)]
internal struct IO_COUNTERS
{
    public ulong ReadOperationCount;
    public ulong WriteOperationCount;
    public ulong OtherOperationCount;
    public ulong ReadTransferCount;
    public ulong WriteTransferCount;
    public ulong OtherTransferCount;
}

[StructLayout(LayoutKind.Sequential)]
internal struct JOBOBJECT_BASIC_LIMIT_INFORMATION
{
    public long PerProcessUserTimeLimit;
    public long PerJobUserTimeLimit;
    public uint LimitFlags;
    public UIntPtr MinimumWorkingSetSize;
    public UIntPtr MaximumWorkingSetSize;
    public uint ActiveProcessLimit;
    public UIntPtr Affinity;
    public uint PriorityClass;
    public uint SchedulingClass;
}

[StructLayout(LayoutKind.Sequential)]
internal struct JOBOBJECT_EXTENDED_LIMIT_INFORMATION
{
    public JOBOBJECT_BASIC_LIMIT_INFORMATION BasicLimitInformation;
    public IO_COUNTERS IoInfo;
    public UIntPtr ProcessMemoryLimit;
    public UIntPtr JobMemoryLimit;
    public UIntPtr PeakProcessMemoryLimit;
    public UIntPtr PeakJobMemoryLimit;
}
