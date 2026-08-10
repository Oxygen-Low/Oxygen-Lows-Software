using System;
using System.IO;
using System.IO.Pipes;
using System.Threading;
using System.Threading.Tasks;
using System.Windows;
using Microsoft.Win32;

namespace DesktopApp;

public static class SingleInstance
{
    private const string MutexName = "OxygenLowsDesktopApp_Mutex";
    private const string PipeName = "OxygenLowsDesktopApp_Pipe";
    private static Mutex? _mutex;

    public static event Action<string>? OnMessageReceived;

    public static bool InitializeAsFirstInstance(string[] args)
    {
        _mutex = new Mutex(true, MutexName, out bool isFirstInstance);

        if (!isFirstInstance)
        {
            // Another instance is already running. Send args via Named Pipe.
            string message = args.Length > 0 ? args[0] : "WAKEUP";
            SendToFirstInstance(message);
            return false;
        }

        // We are the first instance. Start the pipe server.
        StartPipeServer();
        RegisterCustomUriScheme();

        return true;
    }

    private static void SendToFirstInstance(string message)
    {
        try
        {
            using var client = new NamedPipeClientStream(".", PipeName, PipeDirection.Out);
            client.Connect(1000);
            using var writer = new StreamWriter(client);
            writer.WriteLine(message);
            writer.Flush();
        }
        catch { }
    }

    private static void StartPipeServer()
    {
        Task.Run(() =>
        {
            while (true)
            {
                try
                {
                    using var server = new NamedPipeServerStream(PipeName, PipeDirection.In);
                    server.WaitForConnection();
                    using var reader = new StreamReader(server);
                    var message = reader.ReadLine();
                    if (!string.IsNullOrEmpty(message))
                    {
                        System.Windows.Application.Current.Dispatcher.Invoke(() =>
                        {
                            OnMessageReceived?.Invoke(message);
                        });
                    }
                }
                catch { }
            }
        });
    }

    private static void RegisterCustomUriScheme()
    {
        try
        {
            string protocol = "oxygenlows";
            var appPath = System.Diagnostics.Process.GetCurrentProcess().MainModule?.FileName;
            if (string.IsNullOrEmpty(appPath)) return;

            using var key = Registry.CurrentUser.CreateSubKey($@"Software\Classes\{protocol}");
            key.SetValue(string.Empty, "Oxygen Lows Software Desktop");
            key.SetValue("URL Protocol", string.Empty);

            using var commandKey = key.CreateSubKey(@"shell\open\command");
            commandKey.SetValue(string.Empty, $"\"{appPath}\" \"%1\"");
        }
        catch { }
    }
}
