using System;
using System.Net.Http;
using System.Threading.Tasks;
using System.Windows;

namespace DesktopApp;

public partial class MainWindow : Window
{
    private readonly UpdateManager _updateManager;
    private string _targetUrl = "https://oxygen-lows-software.onrender.com/auth";
    
    public MainWindow()
    {
        InitializeComponent();
        _updateManager = new UpdateManager();
        Loaded += MainWindow_Loaded;
    }

    private async void MainWindow_Loaded(object sender, RoutedEventArgs e)
    {
        try
        {
            await InitializeWebViewAsync();
        }
        catch (Exception ex)
        {
            MessageBox.Show(
                $"Failed to initialize the web view:\n\n{ex.Message}\n\nThe WebView2 Runtime may not be installed.",
                "Startup Error",
                MessageBoxButton.OK,
                MessageBoxImage.Error);
        }
    }

    private async Task InitializeWebViewAsync()
    {
        // Check if a local server is running first
        try
        {
            using var client = new HttpClient { Timeout = TimeSpan.FromSeconds(2) };
            var response = await client.GetAsync("http://localhost:3000");
            if (response.IsSuccessStatusCode)
            {
                _targetUrl = "http://localhost:3000";
            }
        }
        catch
        {
            // Fallback to render URL — already set as default
        }

        await webView.EnsureCoreWebView2Async(null);
        webView.CoreWebView2.Navigate(_targetUrl);
    }

    private async void BtnCheckUpdate_Click(object sender, RoutedEventArgs e)
    {
        btnCheckUpdate.IsEnabled = false;
        txtUpdateStatus.Text = "Checking for updates...";
        progressBar.Visibility = Visibility.Collapsed;

        var (hasUpdate, downloadUrl, version) = await _updateManager.CheckForUpdatesAsync();

        if (hasUpdate && !string.IsNullOrEmpty(downloadUrl))
        {
            txtUpdateStatus.Text = $"Update {version} found. Downloading...";
            progressBar.Visibility = Visibility.Visible;
            progressBar.Value = 0;

            try
            {
                await _updateManager.DownloadAndRunInstallerAsync(downloadUrl, progress =>
                {
                    Dispatcher.Invoke(() => progressBar.Value = progress);
                });
            }
            catch (Exception ex)
            {
                txtUpdateStatus.Text = $"Error downloading update: {ex.Message}";
                btnCheckUpdate.IsEnabled = true;
            }
        }
        else
        {
            txtUpdateStatus.Text = "You are up to date.";
            btnCheckUpdate.IsEnabled = true;
        }
    }
}