using System;
using System.IO;
using System.Threading.Tasks;
using System.Windows;

namespace DesktopInstaller;

public partial class MainWindow : Window
{
    private readonly InstallManager _installManager;

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
    }

    private async void BtnInstall_Click(object sender, RoutedEventArgs e)
    {
        string installPath = txtInstallPath.Text;
        await RunTaskAsync(() => _installManager.Install(installPath), "Installing...");
    }

    private async void BtnUpdate_Click(object sender, RoutedEventArgs e)
    {
        await RunTaskAsync(() => _installManager.Update(), "Updating...");
    }

    private async void BtnRepair_Click(object sender, RoutedEventArgs e)
    {
        await RunTaskAsync(() => _installManager.Repair(), "Repairing...");
    }

    private async void BtnReinstall_Click(object sender, RoutedEventArgs e)
    {
        if (MessageBox.Show("This will delete all your user data. Are you sure?", "Warning", MessageBoxButton.YesNo, MessageBoxImage.Warning) == MessageBoxResult.Yes)
        {
            await RunTaskAsync(() => _installManager.Reinstall(), "Reinstalling...");
        }
    }

    private async void BtnUninstall_Click(object sender, RoutedEventArgs e)
    {
        if (MessageBox.Show("Are you sure you want to uninstall?", "Warning", MessageBoxButton.YesNo, MessageBoxImage.Warning) == MessageBoxResult.Yes)
        {
            await RunTaskAsync(() => _installManager.Uninstall(), "Uninstalling...");
        }
    }

    private async Task RunTaskAsync(Action action, string statusMessage)
    {
        pnlInstall.Visibility = Visibility.Collapsed;
        pnlManage.Visibility = Visibility.Collapsed;
        pnlStatus.Visibility = Visibility.Visible;
        txtStatus.Text = statusMessage;

        try
        {
            await Task.Run(action);
            txtStatus.Text = "Completed successfully!";
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
}