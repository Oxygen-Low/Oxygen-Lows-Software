using System;
using System.IO;
using System.Net.Http;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Threading.Tasks;
using System.Windows;
using System.Windows.Controls;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.Wpf;

namespace DesktopApp;

public partial class MainWindow : Window
{
    private readonly UpdateManager _updateManager;
    private WebView2? _webView;
    private string _targetUrl = "https://oxygen-lows-software.onrender.com/auth";

    public MainWindow()
    {
        InitializeComponent();
        _updateManager = new UpdateManager();
        txtCurrentVersion.Text = $"Current Version: {_updateManager.Version}";
        Loaded += MainWindow_Loaded;
    }

    private async void MainWindow_Loaded(object sender, RoutedEventArgs e)
    {
        try
        {
            // Determine which URL to use
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

            // Create WebView2 programmatically
            _webView = new WebView2();
            webViewContainer.Child = _webView;
            txtLoading.Visibility = Visibility.Collapsed;

            await _webView.EnsureCoreWebView2Async(null);

            _webView.CoreWebView2.Navigate(_targetUrl);
        }
        catch (Exception ex)
        {
            txtLoading.Text = $"Could not load web view:\n{ex.Message}";
        }
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