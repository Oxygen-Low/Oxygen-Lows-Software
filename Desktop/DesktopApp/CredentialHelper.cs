using System;
using System.Runtime.InteropServices;

namespace DesktopApp;

public static class CredentialHelper
{
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    private struct CREDENTIAL
    {
        public int Flags;
        public int Type;
        public string TargetName;
        public string Comment;
        public System.Runtime.InteropServices.ComTypes.FILETIME LastWritten;
        public int CredentialBlobSize;
        public IntPtr CredentialBlob;
        public int Persist;
        public int AttributeCount;
        public IntPtr Attributes;
        public string TargetAlias;
        public string UserName;
    }

    [DllImport("Advapi32.dll", SetLastError = true, EntryPoint = "CredWriteW", CharSet = CharSet.Unicode)]
    private static extern bool CredWrite([In] ref CREDENTIAL userCredential, [In] uint flags);

    [DllImport("Advapi32.dll", SetLastError = true, EntryPoint = "CredDeleteW", CharSet = CharSet.Unicode)]
    private static extern bool CredDelete([In] string targetName, [In] int type, [In] int flags);

    public static bool WriteCredential(string target, string username, string password)
    {
        try
        {
            byte[] passBytes = System.Text.Encoding.Unicode.GetBytes(password);
            IntPtr passPtr = Marshal.AllocCoTaskMem(passBytes.Length);
            Marshal.Copy(passBytes, 0, passPtr, passBytes.Length);

            CREDENTIAL cred = new CREDENTIAL();
            cred.Flags = 0;
            cred.Type = 1; // CRED_TYPE_GENERIC
            cred.TargetName = target;
            cred.CredentialBlobSize = passBytes.Length;
            cred.CredentialBlob = passPtr;
            cred.Persist = 2; // CRED_PERSIST_LOCAL_MACHINE
            cred.UserName = username;

            bool result = CredWrite(ref cred, 0);
            Marshal.FreeCoTaskMem(passPtr);
            return result;
        }
        catch
        {
            return false;
        }
    }

    public static bool DeleteCredential(string target)
    {
        try
        {
            return CredDelete(target, 1, 0);
        }
        catch
        {
            return false;
        }
    }
}
