using System;
using System.IO;
using System.Threading.Tasks;
using System.Windows;
using System.Diagnostics;

namespace DesktopInstaller;

public partial class MainWindow : Window
{
    private readonly InstallManager _installManager;
    private bool _shouldLaunchAppOnClose = false;

    public MainWindow()
    {
        InitializeComponent();
        _installManager = new InstallManager();
        
        if (_installManager.IsInstalled())
        {
            pnlManage.Visibility = Visibility.Visible;
        }
        else
        {
            pnlInstall.Visibility = Visibility.Visible;
            txtInstallPath.Text = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "OxygenLowsSoftware");
        }

        Loaded += MainWindow_Loaded;
    }

    private async void MainWindow_Loaded(object sender, RoutedEventArgs e)
    {
        var args = Environment.GetCommandLineArgs();
        bool autoUpdate = false;
        foreach (var arg in args)
        {
            if (arg.Equals("--update", StringComparison.OrdinalIgnoreCase))
            {
                autoUpdate = true;
                break;
            }
        }

        if (autoUpdate)
        {
            await RunTaskAsync(() => _installManager.Update(), "Updating...", isUninstall: false);
        }
    }

    private async void BtnInstall_Click(object sender, RoutedEventArgs e)
    {
        string installPath = txtInstallPath.Text;
        await RunTaskAsync(() => _installManager.Install(installPath), "Installing...", isUninstall: false);
    }

    private async void BtnUpdate_Click(object sender, RoutedEventArgs e)
    {
        await RunTaskAsync(() => _installManager.Update(), "Updating...", isUninstall: false);
    }

    private async void BtnRepair_Click(object sender, RoutedEventArgs e)
    {
        await RunTaskAsync(() => _installManager.Repair(), "Repairing...", isUninstall: false);
    }

    private async void BtnReinstall_Click(object sender, RoutedEventArgs e)
    {
        if (MessageBox.Show("This will delete all your user data. Are you sure?", "Warning", MessageBoxButton.YesNo, MessageBoxImage.Warning) == MessageBoxResult.Yes)
        {
            await RunTaskAsync(() => _installManager.Reinstall(), "Reinstalling...", isUninstall: false);
        }
    }

    private async void BtnUninstall_Click(object sender, RoutedEventArgs e)
    {
        if (MessageBox.Show("Are you sure you want to uninstall?", "Warning", MessageBoxButton.YesNo, MessageBoxImage.Warning) == MessageBoxResult.Yes)
        {
            await RunTaskAsync(() => _installManager.Uninstall(), "Uninstalling...", isUninstall: true);
        }
    }

    private async Task RunTaskAsync(Action action, string statusMessage, bool isUninstall)
    {
        pnlInstall.Visibility = Visibility.Collapsed;
        pnlManage.Visibility = Visibility.Collapsed;
        pnlStatus.Visibility = Visibility.Visible;
        txtStatus.Text = statusMessage;

        try
        {
            await Task.Run(action);
            txtStatus.Text = "Completed successfully!";
            if (!isUninstall)
            {
                _shouldLaunchAppOnClose = true;
            }
        }
        catch (Exception ex)
        {
            txtStatus.Text = $"Error: {ex.Message}";
        }

        btnClose.Visibility = Visibility.Visible;
    }

    private void BtnClose_Click(object sender, RoutedEventArgs e)
    {
        Application.Current.Shutdown();
    }

    protected override void OnClosed(EventArgs e)
    {
        base.OnClosed(e);
        if (_shouldLaunchAppOnClose)
        {
            try
            {
                var path = _installManager.GetInstallPath();
                var exePath = Path.Combine(path, "DesktopApp.exe");
                if (File.Exists(exePath))
                {
                    Process.Start(new ProcessStartInfo
                    {
                        FileName = exePath,
                        UseShellExecute = true
                    });
                }
            }
            catch (Exception ex)
            {
                MessageBox.Show($"Failed to launch application: {ex.Message}", "Error", MessageBoxButton.OK, MessageBoxImage.Error);
            }
        }
    }
}