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

    private static readonly string AppDataFolder = Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
        "OxygenLowsSoftware"
    );
    private static readonly string CredentialsFilePath = Path.Combine(AppDataFolder, "user_credentials.dat");

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
            LoadCredentialsUI();

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

            // Listen to navigation completions to handle automatic login injection
            _webView.CoreWebView2.NavigationCompleted += CoreWebView2_NavigationCompleted;

            _webView.CoreWebView2.Navigate(_targetUrl);
        }
        catch (Exception ex)
        {
            txtLoading.Text = $"Could not load web view:\n{ex.Message}";
        }
    }

    private async void CoreWebView2_NavigationCompleted(object? sender, CoreWebView2NavigationCompletedEventArgs e)
    {
        if (e.IsSuccess)
        {
            await TryAutoLoginAsync();
        }
    }

    private void TabControl_SelectionChanged(object sender, SelectionChangedEventArgs e)
    {
        if (e.Source is TabControl && tabMain.SelectedItem is TabItem selectedTab)
        {
            if (selectedTab.Header?.ToString() == "Main")
            {
                _ = TryAutoLoginAsync();
            }
        }
    }

    private async Task TryAutoLoginAsync()
    {
        if (_webView == null || _webView.CoreWebView2 == null) return;

        // Only try automatic login if we are currently looking at the Main tab
        bool isMainTabActive = false;
        Dispatcher.Invoke(() =>
        {
            isMainTabActive = tabMain.SelectedItem is TabItem selectedTab && selectedTab.Header?.ToString() == "Main";
        });

        if (!isMainTabActive) return;

        var (email, username, password) = LoadCredentials();
        if (string.IsNullOrEmpty(email) || string.IsNullOrEmpty(password)) return;

        // Check current URL of the web view to see if it is the authentication page
        string currentUrl = _webView.CoreWebView2.Source;
        if (currentUrl.Contains("/auth"))
        {
            // Inject script to switch form mode to 'signin' if needed, fill credentials, and submit.
            // React handles input updates by intercepting setter actions, so we trigger native react change events.
            string script = $$"""
                (function() {
                    function findAndFill() {
                        const emailInput = document.getElementById('email');
                        const usernameInput = document.getElementById('username');
                        const passwordInput = document.getElementById('password');

                        if (!emailInput || !passwordInput) {
                            // Try switching to sign-in tab first if it exists and we're not already there.
                            const buttons = Array.from(document.querySelectorAll('button'));
                            const signInBtn = buttons.find(b => b.textContent && b.textContent.trim() === 'Sign In');
                            if (signInBtn && !signInBtn.classList.contains('bg-cyan-500/20')) {
                                signInBtn.click();
                            }
                            return false;
                        }

                        // Fill email
                        const emailProto = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value');
                        if (emailProto && emailProto.set) {
                            emailProto.set.call(emailInput, '{{email.Replace("'", "\\'")}}');
                            emailInput.dispatchEvent(new Event('input', { bubbles: true }));
                        } else {
                            emailInput.value = '{{email.Replace("'", "\\'")}}';
                            emailInput.dispatchEvent(new Event('change', { bubbles: true }));
                        }

                        // Fill username if input exists (e.g. on SignUp tab) and username is provided
                        if (usernameInput && '{{username.Replace("'", "\\'")}}' !== '') {
                            const usernameProto = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value');
                            if (usernameProto && usernameProto.set) {
                                usernameProto.set.call(usernameInput, '{{username.Replace("'", "\\'")}}');
                                usernameInput.dispatchEvent(new Event('input', { bubbles: true }));
                            } else {
                                usernameInput.value = '{{username.Replace("'", "\\'")}}';
                                usernameInput.dispatchEvent(new Event('change', { bubbles: true }));
                            }
                        }

                        // Fill password
                        const passwordProto = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value');
                        if (passwordProto && passwordProto.set) {
                            passwordProto.set.call(passwordInput, '{{password.Replace("'", "\\'")}}');
                            passwordInput.dispatchEvent(new Event('input', { bubbles: true }));
                        } else {
                            passwordInput.value = '{{password.Replace("'", "\\'")}}';
                            passwordInput.dispatchEvent(new Event('change', { bubbles: true }));
                        }

                        // Find the submit button and click it
                        const form = emailInput.closest('form');
                        if (form) {
                            const submitBtn = form.querySelector('button[type="submit"]');
                            if (submitBtn && !submitBtn.disabled) {
                                submitBtn.click();
                                return true;
                            }
                        }
                        return false;
                    }

                    // Attempt immediately, and then retry if elements take a moment to load
                    if (!findAndFill()) {
                        let attempts = 0;
                        const interval = setInterval(() => {
                            attempts++;
                            if (findAndFill() || attempts > 20) {
                                clearInterval(interval);
                            }
                        }, 250);
                    }
                })();
            """;

            await _webView.CoreWebView2.ExecuteScriptAsync(script);
        }
    }

    private void LoadCredentialsUI()
    {
        try
        {
            var (email, username, password) = LoadCredentials();
            if (!string.IsNullOrEmpty(email))
            {
                txtEmail.Text = email;
                txtUsername.Text = username;
                txtPassword.Password = password;
                txtAuthStatus.Text = "Credentials are saved and will auto-login on Main tab.";
                txtAuthStatus.Foreground = System.Windows.Media.Brushes.Green;
            }
            else
            {
                txtEmail.Text = string.Empty;
                txtUsername.Text = string.Empty;
                txtPassword.Password = string.Empty;
                txtAuthStatus.Text = "No saved credentials found.";
                txtAuthStatus.Foreground = System.Windows.Media.Brushes.Gray;
            }
        }
        catch (Exception ex)
        {
            txtAuthStatus.Text = $"Failed to load credentials: {ex.Message}";
            txtAuthStatus.Foreground = System.Windows.Media.Brushes.Red;
        }
    }

    private (string email, string username, string password) LoadCredentials()
    {
        try
        {
            if (!File.Exists(CredentialsFilePath))
            {
                return (string.Empty, string.Empty, string.Empty);
            }

            byte[] encryptedData = File.ReadAllBytes(CredentialsFilePath);
            byte[] decryptedData = ProtectedData.Unprotect(encryptedData, null, DataProtectionScope.CurrentUser);
            string json = Encoding.UTF8.GetString(decryptedData);

            var creds = JsonSerializer.Deserialize<UserCreds>(json);
            if (creds != null)
            {
                return (creds.Email ?? string.Empty, creds.Username ?? string.Empty, creds.Password ?? string.Empty);
            }
        }
        catch
        {
            // Ignore decryption or file errors and return empty
        }

        return (string.Empty, string.Empty, string.Empty);
    }

    private void SaveCredentials(string email, string username, string password)
    {
        if (string.IsNullOrWhiteSpace(email) || string.IsNullOrWhiteSpace(password))
        {
            throw new ArgumentException("Email and Password cannot be empty.");
        }

        if (!Directory.Exists(AppDataFolder))
        {
            Directory.CreateDirectory(AppDataFolder);
        }

        var creds = new UserCreds { Email = email, Username = username, Password = password };
        string json = JsonSerializer.Serialize(creds);
        byte[] rawData = Encoding.UTF8.GetBytes(json);
        byte[] encryptedData = ProtectedData.Protect(rawData, null, DataProtectionScope.CurrentUser);

        File.WriteAllBytes(CredentialsFilePath, encryptedData);
    }

    private void DeleteCredentials()
    {
        if (File.Exists(CredentialsFilePath))
        {
            File.Delete(CredentialsFilePath);
        }
    }

    private void BtnSaveCredentials_Click(object sender, RoutedEventArgs e)
    {
        try
        {
            string email = txtEmail.Text.Trim();
            string username = txtUsername.Text.Trim();
            string password = txtPassword.Password;

            if (string.IsNullOrEmpty(email) || string.IsNullOrEmpty(password))
            {
                MessageBox.Show("Please enter both Email and Password.", "Error", MessageBoxButton.OK, MessageBoxImage.Error);
                return;
            }

            SaveCredentials(email, username, password);
            txtAuthStatus.Text = "Credentials saved securely!";
            txtAuthStatus.Foreground = System.Windows.Media.Brushes.Green;

            MessageBox.Show("Credentials stored securely.", "Success", MessageBoxButton.OK, MessageBoxImage.Information);

            // Trigger auto-login if appropriate
            _ = TryAutoLoginAsync();
        }
        catch (Exception ex)
        {
            txtAuthStatus.Text = $"Failed to save credentials: {ex.Message}";
            txtAuthStatus.Foreground = System.Windows.Media.Brushes.Red;
            MessageBox.Show($"Failed to save credentials: {ex.Message}", "Error", MessageBoxButton.OK, MessageBoxImage.Error);
        }
    }

    private void BtnClearCredentials_Click(object sender, RoutedEventArgs e)
    {
        try
        {
            DeleteCredentials();
            txtEmail.Text = string.Empty;
            txtUsername.Text = string.Empty;
            txtPassword.Password = string.Empty;
            txtAuthStatus.Text = "Credentials cleared.";
            txtAuthStatus.Foreground = System.Windows.Media.Brushes.Gray;
            MessageBox.Show("Credentials cleared successfully.", "Success", MessageBoxButton.OK, MessageBoxImage.Information);
        }
        catch (Exception ex)
        {
            txtAuthStatus.Text = $"Failed to clear credentials: {ex.Message}";
            txtAuthStatus.Foreground = System.Windows.Media.Brushes.Red;
            MessageBox.Show($"Failed to clear credentials: {ex.Message}", "Error", MessageBoxButton.OK, MessageBoxImage.Error);
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

    private class UserCreds
    {
        public string? Email { get; set; }
        public string? Username { get; set; }
        public string? Password { get; set; }
    }
}