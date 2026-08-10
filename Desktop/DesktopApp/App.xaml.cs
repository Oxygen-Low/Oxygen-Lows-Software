using System;
using System.Windows;
using System.Windows.Threading;

namespace DesktopApp;

public partial class App : System.Windows.Application
{
    protected override async void OnStartup(StartupEventArgs e)
    {
        base.OnStartup(e);

        if (!SingleInstance.InitializeAsFirstInstance(e.Args))
        {
            // Exit if another instance is already running
            Shutdown();
            return;
        }
        
        DispatcherUnhandledException += App_DispatcherUnhandledException;
        AppDomain.CurrentDomain.UnhandledException += CurrentDomain_UnhandledException;

        // Keep the dispatcher alive while the update check runs before a window exists.
        ShutdownMode = ShutdownMode.OnExplicitShutdown;

        try
        {
            var updateManager = new UpdateManager();
            var (hasUpdate, downloadUrl, _) = await updateManager.CheckForUpdatesAsync();

            if (hasUpdate && !string.IsNullOrWhiteSpace(downloadUrl))
            {
                await updateManager.DownloadAndRunInstallerAsync(downloadUrl);
                return;
            }
        }
        catch
        {
            // An unavailable update service must not prevent the application from starting.
        }

        var mainWindow = new MainWindow();
        MainWindow = mainWindow;
        ShutdownMode = ShutdownMode.OnMainWindowClose;
        mainWindow.Show();
    }

    private void App_DispatcherUnhandledException(object sender, DispatcherUnhandledExceptionEventArgs e)
    {
        System.Windows.MessageBox.Show(
            $"An unexpected error occurred:\n\n{e.Exception.Message}\n\n{e.Exception.StackTrace}",
            "Error",
            MessageBoxButton.OK,
            MessageBoxImage.Error);
        e.Handled = true;
    }

    private void CurrentDomain_UnhandledException(object sender, UnhandledExceptionEventArgs e)
    {
        if (e.ExceptionObject is Exception ex)
        {
            System.Windows.MessageBox.Show(
                $"A fatal error occurred:\n\n{ex.Message}\n\n{ex.StackTrace}",
                "Fatal Error",
                MessageBoxButton.OK,
                MessageBoxImage.Error);
        }
    }
}
