using System;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Net.Http;
using System.Net;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using System.Windows;
using System.Windows.Controls;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.Wpf;

namespace DesktopApp;

public partial class MainWindow : Window
{
    private const string OAuthCallbackUrl = "http://127.0.0.1:53682/oauth/callback/";
    private readonly UpdateManager _updateManager;
    private WebView2? _webView;
    private string _targetUrl = "https://oxygen-lows-software.onrender.com/auth";
    private CancellationTokenSource? _oauthCancellation;

    public MainWindow()
    {
        InitializeComponent();
        _updateManager = new UpdateManager();
        txtCurrentVersion.Text = $"Current Version: {_updateManager.Version}";
        Loaded += MainWindow_Loaded;
        Closing += MainWindow_Closing;
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
            _webView.CoreWebView2.NavigationStarting += WebView_NavigationStarting;
            _webView.CoreWebView2.Navigate(_targetUrl);
        }
        catch (Exception ex)
        {
            txtLoading.Text = $"Could not load web view:\n{ex.Message}";
        }
    }

    private void MainWindow_Closing(object? sender, System.ComponentModel.CancelEventArgs e)
    {
        _oauthCancellation?.Cancel();
    }

    private void WebView_NavigationStarting(object? sender, CoreWebView2NavigationStartingEventArgs e)
    {
        if (!IsGoogleOAuthRequest(e.Uri)) return;

        e.Cancel = true;
        _ = ContinueGoogleSignInInBrowserAsync(new Uri(e.Uri));
    }

    private static bool IsGoogleOAuthRequest(string url)
    {
        if (!Uri.TryCreate(url, UriKind.Absolute, out var uri) ||
            !uri.Host.EndsWith(".supabase.co", StringComparison.OrdinalIgnoreCase) ||
            !uri.AbsolutePath.StartsWith("/auth/v1/", StringComparison.OrdinalIgnoreCase))
        {
            return false;
        }

        return string.Equals(GetQueryParameter(uri, "provider"), "google", StringComparison.OrdinalIgnoreCase);
    }

    private async Task ContinueGoogleSignInInBrowserAsync(Uri authorizationUri)
    {
        _oauthCancellation?.Cancel();
        _oauthCancellation?.Dispose();
        _oauthCancellation = new CancellationTokenSource();
        var cancellationToken = _oauthCancellation.Token;

        var returnUrl = GetQueryParameter(authorizationUri, "redirect_to");
        if (!Uri.TryCreate(returnUrl, UriKind.Absolute, out var callbackReturnUri))
        {
            callbackReturnUri = new Uri(_targetUrl);
        }

        try
        {
            using var listener = new HttpListener();
            listener.Prefixes.Add(OAuthCallbackUrl);
            listener.Start();

            var browserUri = ReplaceQueryParameter(authorizationUri, "redirect_to", OAuthCallbackUrl);
            Process.Start(new ProcessStartInfo
            {
                FileName = browserUri.AbsoluteUri,
                UseShellExecute = true,
            });

            using var registration = cancellationToken.Register(() =>
            {
                if (listener.IsListening) listener.Stop();
            });

            var context = await listener.GetContextAsync();
            var code = GetQueryParameter(context.Request.Url, "code");
            var error = GetQueryParameter(context.Request.Url, "error_description")
                        ?? GetQueryParameter(context.Request.Url, "error");

            await WriteOAuthResponseAsync(context.Response, string.IsNullOrWhiteSpace(code), error);

            if (cancellationToken.IsCancellationRequested) return;

            if (!string.IsNullOrWhiteSpace(error))
            {
                throw new InvalidOperationException($"Google sign in failed: {error}");
            }

            if (string.IsNullOrWhiteSpace(code))
            {
                throw new InvalidOperationException("Google sign in did not return an authorization code.");
            }

            await Dispatcher.InvokeAsync(() =>
                _webView?.CoreWebView2.Navigate(AddQueryParameter(callbackReturnUri, "code", code).AbsoluteUri));
        }
        catch (HttpListenerException) when (cancellationToken.IsCancellationRequested)
        {
            // The app was closed or another sign-in attempt superseded this one.
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
        {
            // The app was closed or another sign-in attempt superseded this one.
        }
        catch (Exception ex)
        {
            await Dispatcher.InvokeAsync(() =>
                MessageBox.Show(
                    $"Google sign in could not continue in your browser.\n\n{ex.Message}",
                    "Google sign in",
                    MessageBoxButton.OK,
                    MessageBoxImage.Error));
        }
    }

    private static async Task WriteOAuthResponseAsync(HttpListenerResponse response, bool isError, string? error)
    {
        response.StatusCode = isError ? (int)HttpStatusCode.BadRequest : (int)HttpStatusCode.OK;
        response.ContentType = "text/html; charset=utf-8";
        var message = isError
            ? $"Google sign in could not be completed. {System.Net.WebUtility.HtmlEncode(error ?? "Please return to the app and try again.")}"
            : "Google sign in is complete. You can return to Oxygen Low's Software.";
        var body = $"<!doctype html><html><head><title>Oxygen Low's Software</title></head><body><p>{message}</p></body></html>";
        var bytes = Encoding.UTF8.GetBytes(body);
        response.ContentLength64 = bytes.Length;
        await response.OutputStream.WriteAsync(bytes, 0, bytes.Length);
        response.Close();
    }

    private static string? GetQueryParameter(Uri? uri, string parameterName)
    {
        if (uri is null) return null;

        foreach (var part in uri.Query.TrimStart('?').Split('&', StringSplitOptions.RemoveEmptyEntries))
        {
            var separatorIndex = part.IndexOf('=');
            var encodedName = separatorIndex >= 0 ? part[..separatorIndex] : part;
            if (!string.Equals(Uri.UnescapeDataString(encodedName), parameterName, StringComparison.OrdinalIgnoreCase)) continue;

            var encodedValue = separatorIndex >= 0 ? part[(separatorIndex + 1)..] : string.Empty;
            return Uri.UnescapeDataString(encodedValue.Replace("+", " "));
        }

        return null;
    }

    private static Uri ReplaceQueryParameter(Uri uri, string parameterName, string value)
    {
        var parameters = uri.Query.TrimStart('?')
            .Split('&', StringSplitOptions.RemoveEmptyEntries)
            .Where(part =>
            {
                var separatorIndex = part.IndexOf('=');
                var encodedName = separatorIndex >= 0 ? part[..separatorIndex] : part;
                return !string.Equals(Uri.UnescapeDataString(encodedName), parameterName, StringComparison.OrdinalIgnoreCase);
            })
            .ToList();
        parameters.Add($"{Uri.EscapeDataString(parameterName)}={Uri.EscapeDataString(value)}");

        var builder = new UriBuilder(uri) { Query = string.Join("&", parameters) };
        return builder.Uri;
    }

    private static Uri AddQueryParameter(Uri uri, string parameterName, string value)
    {
        var builder = new UriBuilder(uri);
        var separator = string.IsNullOrEmpty(builder.Query) ? string.Empty : "&";
        builder.Query = $"{builder.Query.TrimStart('?')}{separator}{Uri.EscapeDataString(parameterName)}={Uri.EscapeDataString(value)}";
        return builder.Uri;
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
