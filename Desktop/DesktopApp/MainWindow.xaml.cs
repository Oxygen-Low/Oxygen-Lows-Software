using System;
using System.Collections.Generic;
using System.Collections.ObjectModel;
using System.ComponentModel;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Net;
using System.Net.Http;
using System.Runtime.CompilerServices;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using System.Windows.Media;
using System.Windows.Media.Imaging;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.Wpf;

namespace DesktopApp;

public partial class MainWindow : Window
{
    private const string OAuthCallbackUrl = "http://127.0.0.1:53682/oauth/callback/";
    private readonly UpdateManager _updateManager;
    private WebView2? _webView;
    private CoreWebView2Environment? _webViewEnvironment;
    private string _targetUrl = "https://oxygen-lows-software.onrender.com";
    private CancellationTokenSource? _oauthCancellation;

    // Single shared long-lived HttpClient
    private static readonly HttpClient _httpClient = new HttpClient();

    // List of trusted OAuth hostnames to prevent command or process starting redirection exploits
    private static readonly HashSet<string> AllowedOAuthHosts = new(StringComparer.OrdinalIgnoreCase)
    {
        "vqmukrmpgvavscsyefqd.supabase.co"
    };

    // Static frozen SolidColorBrush fields for message UI to avoid Converter recreation
    private static readonly SolidColorBrush UserBgBrush = FreezeBrush(new SolidColorBrush((Color)ColorConverter.ConvertFromString("#0288D1")));
    private static readonly SolidColorBrush UserBorderBrush = FreezeBrush(new SolidColorBrush((Color)ColorConverter.ConvertFromString("#039BE5")));
    private static readonly SolidColorBrush AssistantBgBrush = FreezeBrush(new SolidColorBrush((Color)ColorConverter.ConvertFromString("#2D2D30")));
    private static readonly SolidColorBrush AssistantBorderBrush = FreezeBrush(new SolidColorBrush((Color)ColorConverter.ConvertFromString("#3E3E42")));

    private static SolidColorBrush FreezeBrush(SolidColorBrush brush)
    {
        brush.Freeze();
        return brush;
    }

    // Supabase Session State
    private string _accessToken = "";
    private string _userId = "";
    private string _masterKey = "";
    private bool _isEncryptionEnabled = false;
    private bool _isPreferencesLoaded = false;

    // Gate Apps Tab initialization on completion of WebView navigation to _targetUrl
    private bool _isNavigationCompleted = false;
    private bool _isAppsTabInitialized = false;

    // Data-Driven Categories and Apps selection Lists
    private List<CategoryDescriptor> _categories = new();
    private List<AppDescriptor> _apps = new();

    // Chatbot and File Compressor Collections
    private ObservableCollection<ChatItem> _chats = new();
    private ObservableCollection<MessageViewModel> _messagesList = new();
    private List<ModelItem> _models = new();
    private List<StyleItem> _styles = new();
    private List<CharacterItem> _characters = new();
    private ChatItem? _activeChat = null;
    private string _selectedCategory = "All";
    private string _currentLoadingChatId = "";

    // VPN Fields & State
    private WebView2? _vpnMapView;
    private ObservableCollection<VPNServerItem> _vpnServers = new();
    private VPNServerItem? _selectedVPNServer = null;
    private bool _isVPNConnected = false;
    private long _vpnTodayBytes = 0;
    private System.Windows.Threading.DispatcherTimer? _vpnTimer;
    private System.Windows.Threading.DispatcherTimer? _vpnDataTimer;
    private DateTime _vpnStartTime;
    private const long VPNDailyLimitBytes = 50 * 1024 * 1024; // 50MB limit

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

            _webViewEnvironment = await CreateSharedWebViewEnvironmentAsync();

            // Create the ordinary website view.
            _webView = new WebView2();
            webViewContainer.Child = _webView;
            txtLoading.Visibility = Visibility.Collapsed;

            await InitializeWebViewAsync(_webView);
            _webView.CoreWebView2.Navigate(_targetUrl);

            _webView.CoreWebView2.NavigationCompleted += WebView_NavigationCompleted;

            if (appsTab.IsSelected && _isNavigationCompleted)
            {
                await InitializeAppsTabAsync();
            }
        }
        catch (Exception ex)
        {
            txtLoading.Text = $"Could not load web view:\n{ex.Message}";
        }
    }

    private async void WebView_NavigationCompleted(object? sender, CoreWebView2NavigationCompletedEventArgs e)
    {
        _isNavigationCompleted = true;
        if (appsTab.IsSelected && !_isAppsTabInitialized)
        {
            await InitializeAppsTabAsync();
        }
    }

    private void MainWindow_Closing(object? sender, System.ComponentModel.CancelEventArgs e)
    {
        _oauthCancellation?.Cancel();
        try
        {
            if (_isVPNConnected && _selectedVPNServer != null)
            {
                var disconnectTask = VPNConnectionManager.DisconnectAsync(_selectedVPNServer.Name);
                disconnectTask.Wait(5000); // Wait synchronously up to 5s bounded timeout
            }
        }
        catch (Exception ex)
        {
            Debug.WriteLine($"Error disconnecting VPN on exit: {ex.Message}");
        }

        try
        {
            VPNKillswitchManager.CleanUpActiveRulesOnExit();
        }
        catch (Exception ex)
        {
            Debug.WriteLine($"Error cleaning up active rules on exit: {ex.Message}");
        }
    }

    private async void TabMain_SelectionChanged(object sender, SelectionChangedEventArgs e)
    {
        if (e.Source != tabMain || !appsTab.IsSelected) return;
        if (_isNavigationCompleted)
        {
            await InitializeAppsTabAsync();
        }
    }

    // --- SEAMLESS SUPABASE AUTHENTICATION SHARING ---

    private async Task<bool> RetrieveSessionAsync()
    {
        if (_webView?.CoreWebView2 == null) return false;

        try
        {
            // Retrieve combined auth token chunks (<key>.0, <key>.1, etc.)
            string rawToken = await _webView.CoreWebView2.ExecuteScriptAsync("window.localStorage.getItem('sb-vqmukrmpgvavscsyefqd-auth-token')");
            if (string.IsNullOrEmpty(rawToken) || rawToken == "null")
            {
                StringBuilder chunkedBuilder = new StringBuilder();
                int chunkIndex = 0;
                while (true)
                {
                    string chunk = await _webView.CoreWebView2.ExecuteScriptAsync($"window.localStorage.getItem('sb-vqmukrmpgvavscsyefqd-auth-token.{chunkIndex}')");
                    if (string.IsNullOrEmpty(chunk) || chunk == "null") break;
                    string? chunkVal = JsonSerializer.Deserialize<string>(chunk);
                    if (string.IsNullOrEmpty(chunkVal)) break;
                    chunkedBuilder.Append(chunkVal);
                    chunkIndex++;
                }
                if (chunkedBuilder.Length > 0)
                {
                    rawToken = JsonSerializer.Serialize(chunkedBuilder.ToString());
                }
            }

            if (string.IsNullOrEmpty(rawToken) || rawToken == "null") return false;

            string? tokenJson = JsonSerializer.Deserialize<string>(rawToken);
            if (string.IsNullOrEmpty(tokenJson)) return false;

            // Support base64-encoded session key format before deserializing
            if (!tokenJson.Trim().StartsWith("{") && IsBase64String(tokenJson))
            {
                try
                {
                    tokenJson = Encoding.UTF8.GetString(Convert.FromBase64String(tokenJson));
                }
                catch
                {
                    // Fallback to original token string if it failed to decode or was a false positive
                }
            }

            if (string.IsNullOrEmpty(tokenJson) || !tokenJson.Trim().StartsWith("{")) return false;

            using var doc = JsonDocument.Parse(tokenJson);
            if (doc.RootElement.TryGetProperty("access_token", out var accTokenProp))
            {
                _accessToken = accTokenProp.GetString() ?? "";
            }
            if (doc.RootElement.TryGetProperty("user", out var userProp) && userProp.TryGetProperty("id", out var idProp))
            {
                _userId = idProp.GetString() ?? "";
            }

            if (string.IsNullOrEmpty(_accessToken) || string.IsNullOrEmpty(_userId)) return false;

            // Parse and validate expires_at, rejecting expired sessions
            if (doc.RootElement.TryGetProperty("expires_at", out var expiresAtProp))
            {
                long expiresAtUnix = 0;
                if (expiresAtProp.ValueKind == JsonValueKind.Number)
                {
                    expiresAtUnix = expiresAtProp.GetInt64();
                }
                else if (expiresAtProp.ValueKind == JsonValueKind.String && long.TryParse(expiresAtProp.GetString(), out long parsedUnix))
                {
                    expiresAtUnix = parsedUnix;
                }

                if (expiresAtUnix > 0)
                {
                    long currentUnix = DateTimeOffset.UtcNow.ToUnixTimeSeconds();
                    if (currentUnix >= expiresAtUnix)
                    {
                        Debug.WriteLine("Session has expired based on expires_at.");
                        return false;
                    }
                }
            }

            // Fetch Master Key from SessionStorage using correct key matching client/lib/crypto.ts
            string rawKey = await _webView.CoreWebView2.ExecuteScriptAsync("window.sessionStorage.getItem('sb-vqmukrmpgvavscsyefqd-app-state-sync')");
            if (!string.IsNullOrEmpty(rawKey) && rawKey != "null")
            {
                _masterKey = JsonSerializer.Deserialize<string>(rawKey) ?? "";
            }

            return true;
        }
        catch
        {
            // return false on malformed or missing data without propagating JSON errors
            return false;
        }
    }

    private static bool IsBase64String(string base64)
    {
        Span<byte> buffer = new Span<byte>(new byte[base64.Length]);
        return Convert.TryFromBase64String(base64, buffer, out _);
    }

    private async Task FetchUserPreferencesAsync()
    {
        _isPreferencesLoaded = false;
        try
        {
            var request = CreateSupabaseRequest(HttpMethod.Get, $"https://vqmukrmpgvavscsyefqd.supabase.co/rest/v1/user_preferences?user_id=eq.{_userId}&select=encryption_settings");
            var response = await _httpClient.SendAsync(request);
            if (!response.IsSuccessStatusCode)
            {
                string err = await response.Content.ReadAsStringAsync();
                throw new Exception($"HTTP {response.StatusCode}: {err}");
            }

            string json = await response.Content.ReadAsStringAsync();
            using var doc = JsonDocument.Parse(json);
            if (doc.RootElement.ValueKind == JsonValueKind.Array && doc.RootElement.GetArrayLength() > 0)
            {
                var prefs = doc.RootElement[0];
                if (prefs.TryGetProperty("encryption_settings", out var encProp) && encProp.ValueKind == JsonValueKind.Object)
                {
                    if (encProp.TryGetProperty("enabled", out var enabledProp))
                    {
                        _isEncryptionEnabled = enabledProp.GetBoolean();
                    }
                }
            }
            _isPreferencesLoaded = true;
        }
        catch (Exception ex)
        {
            MessageBox.Show($"Security Check Failed: Could not load user preferences.\n\nDetails: {ex.Message}\n\nChatbot operations have been disabled for security reasons to prevent plain text writes.", "Preferences Loading Failure", MessageBoxButton.OK, MessageBoxImage.Error);
            _isPreferencesLoaded = false;

            // Hard disable chatbot input controls
            btnSendChat.IsEnabled = false;
            txtChatInput.IsEnabled = false;
        }
    }

    private async Task InitializeAppsTabAsync()
    {
        _isAppsTabInitialized = true;
        bool loggedIn = await RetrieveSessionAsync();
        if (loggedIn)
        {
            panelAuthWarning.Visibility = Visibility.Collapsed;
            panelCatalog.Visibility = Visibility.Visible;
            panelChatbot.Visibility = Visibility.Collapsed;
            panelCompressor.Visibility = Visibility.Collapsed;

            InitializeCatalog();
            await FetchUserPreferencesAsync();
        }
        else
        {
            panelAuthWarning.Visibility = Visibility.Visible;
            panelCatalog.Visibility = Visibility.Collapsed;
            panelChatbot.Visibility = Visibility.Collapsed;
            panelCompressor.Visibility = Visibility.Collapsed;
        }
    }

    private HttpRequestMessage CreateSupabaseRequest(HttpMethod method, string url)
    {
        var request = new HttpRequestMessage(method, url);
        request.Headers.Add("apikey", "sb_publishable_t2Nj_QmKvYBkmhQZvGkPAQ_a6YFGq4Q");
        if (!string.IsNullOrEmpty(_accessToken))
        {
            request.Headers.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", _accessToken);
        }
        return request;
    }

    // --- APP SELECTION CATALOG ---

    private void InitializeCatalog()
    {
        _categories = new List<CategoryDescriptor>
        {
            new CategoryDescriptor { Name = "All", Label = "All" },
            new CategoryDescriptor { Name = "Utility", Label = "Utility" },
            new CategoryDescriptor { Name = "LLM/AI", Label = "LLM/AI" },
            new CategoryDescriptor { Name = "Development", Label = "Development" },
            new CategoryDescriptor { Name = "Social", Label = "Social" },
            new CategoryDescriptor { Name = "Games", Label = "Games" }
        };
        itemsCategories.ItemsSource = _categories;

        _apps = new List<AppDescriptor>
        {
            new AppDescriptor
            {
                Id = "chatbot",
                DisplayName = "💬 Chatbot",
                Description = "Chat with LLMs in real-time. Native client supporting styles, characters and history.",
                Category = "LLM/AI",
                LaunchAction = async () => await LaunchChatbotAsync()
            },
            new AppDescriptor
            {
                Id = "compressor",
                DisplayName = "📦 File Compressor",
                Description = "Compress files and images seamlessly using native WPF compression and Supabase storage.",
                Category = "Utility",
                LaunchAction = async () => await LaunchCompressorAsync()
            },
            new AppDescriptor
            {
                Id = "vpn",
                DisplayName = "🌐 VPN Client",
                Description = "Fast, secure, and device-wide VPN with built-in map view, server locations, and auto-killswitch.",
                Category = "Utility",
                LaunchAction = async () => await LaunchVPNAsync()
            }
        };

        UpdateCatalogView();
    }

    private void UpdateCatalogView()
    {
        var filtered = _apps.Where(app => _selectedCategory == "All" || app.Category == _selectedCategory).ToList();
        itemsAppsList.ItemsSource = filtered;

        if (filtered.Count == 0)
        {
            txtNoAppsMessage.Visibility = Visibility.Visible;
            itemsAppsList.Visibility = Visibility.Collapsed;
        }
        else
        {
            txtNoAppsMessage.Visibility = Visibility.Collapsed;
            itemsAppsList.Visibility = Visibility.Visible;
        }
    }

    private void Category_Click(object sender, RoutedEventArgs e)
    {
        var btn = sender as Button;
        if (btn == null) return;

        _selectedCategory = btn.Tag as string ?? "All";
        txtCategoryHeader.Text = $"{_selectedCategory} Apps";
        UpdateCatalogView();
    }

    private async void AppCard_Click(object sender, RoutedEventArgs e)
    {
        try
        {
            var btn = sender as Button;
            if (btn?.Tag is string appId)
            {
                var app = _apps.FirstOrDefault(a => a.Id == appId);
                if (app != null)
                {
                    app.LaunchAction?.Invoke();
                }
            }
        }
        catch (Exception ex)
        {
            MessageBox.Show($"Error launching app: {ex.Message}", "Launch Error", MessageBoxButton.OK, MessageBoxImage.Error);
        }
    }

    private async Task LaunchChatbotAsync()
    {
        panelCatalog.Visibility = Visibility.Collapsed;
        panelChatbot.Visibility = Visibility.Visible;

        // Ensure preferences were re-checked or loaded
        if (!_isPreferencesLoaded)
        {
            await FetchUserPreferencesAsync();
        }

        if (_isPreferencesLoaded)
        {
            btnSendChat.IsEnabled = true;
            txtChatInput.IsEnabled = true;
        }

        await LoadChatbotMetadataAsync();
        await LoadChatsAsync();
    }

    private async Task LaunchCompressorAsync()
    {
        panelCatalog.Visibility = Visibility.Collapsed;
        panelCompressor.Visibility = Visibility.Visible;

        panelCompressorIdle.Visibility = Visibility.Visible;
        panelCompressorRunning.Visibility = Visibility.Collapsed;
        panelCompressorSuccess.Visibility = Visibility.Collapsed;

        await LoadStorageFilesAsync();
    }

    private void BtnBackToCatalog_Click(object sender, RoutedEventArgs e)
    {
        panelChatbot.Visibility = Visibility.Collapsed;
        panelCompressor.Visibility = Visibility.Collapsed;
        panelVPN.Visibility = Visibility.Collapsed;
        panelCatalog.Visibility = Visibility.Visible;
    }

    // --- NATIVE VPN CLIENT IMPLEMENTATION ---

    private async Task LaunchVPNAsync()
    {
        panelCatalog.Visibility = Visibility.Collapsed;
        panelVPN.Visibility = Visibility.Visible;

        // Initialize embedded Leaflet map in WebView2
        if (_vpnMapView == null)
        {
            try
            {
                _vpnMapView = new WebView2();
                vpnMapContainer.Children.Clear();
                vpnMapContainer.Children.Add(_vpnMapView);

                await _vpnMapView.EnsureCoreWebView2Async(_webViewEnvironment);
                _vpnMapView.CoreWebView2.WebMessageReceived += VpnMapView_WebMessageReceived;

                string htmlPath = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "leaflet.html");
                if (File.Exists(htmlPath))
                {
                    _vpnMapView.CoreWebView2.Navigate(new Uri(htmlPath).AbsoluteUri);
                }
                else
                {
                    MessageBox.Show("Leaflet map resources (leaflet.html) are missing.", "Initialization Warning", MessageBoxButton.OK, MessageBoxImage.Warning);
                }
            }
            catch (Exception ex)
            {
                _vpnMapView = null;
                vpnMapContainer.Children.Clear();
                MessageBox.Show($"Failed to initialize Map Viewer: {ex.Message}", "Map Load Error", MessageBoxButton.OK, MessageBoxImage.Error);
            }
        }

        // Initialize vpn servers collection
        InitVPNServersList();

        // Load daily limit tracking status
        await LoadVPNDailyUsageAsync();

        // Ping and query servers to display active IP and status
        await QueryVPNServersAsync();
    }

    private void InitVPNServersList()
    {
        if (_vpnServers.Count > 0) return;

        _vpnServers.Add(new VPNServerItem { Id = "va", Name = "🇺🇸 US East (Virginia)", BaseUrl = "https://oxygen-lows-software-vpn-virginia.onrender.com", Latitude = 37.4316, Longitude = -78.6569 });
        _vpnServers.Add(new VPNServerItem { Id = "sg", Name = "🇸🇬 Singapore", BaseUrl = "https://oxygen-lows-software-vpn-singapore.onrender.com", Latitude = 1.3521, Longitude = 103.8198 });
        _vpnServers.Add(new VPNServerItem { Id = "oh", Name = "🇺🇸 US East (Ohio)", BaseUrl = "https://oxygen-lows-software-vpn-ohio.onrender.com", Latitude = 40.4173, Longitude = -82.9071 });
        _vpnServers.Add(new VPNServerItem { Id = "or", Name = "🇺🇸 US West (Oregon)", BaseUrl = "https://oxygen-lows-software-vpn-oregon.onrender.com", Latitude = 43.8041, Longitude = -120.5542 });
        _vpnServers.Add(new VPNServerItem { Id = "fr", Name = "🇩🇪 Germany (Frankfurt)", BaseUrl = "https://oxygen-lows-software-vpn-frankfurt.onrender.com", Latitude = 50.1109, Longitude = 8.6821 });

        itemsVPNServers.ItemsSource = _vpnServers;
    }

    private async Task LoadVPNDailyUsageAsync()
    {
        try
        {
            var request = CreateSupabaseRequest(HttpMethod.Get, $"https://vqmukrmpgvavscsyefqd.supabase.co/rest/v1/user_preferences?user_id=eq.{_userId}&select=vpn_usage_bytes,vpn_usage_last_date");
            var response = await _httpClient.SendAsync(request);
            if (response.IsSuccessStatusCode)
            {
                string json = await response.Content.ReadAsStringAsync();
                using var doc = JsonDocument.Parse(json);
                if (doc.RootElement.ValueKind == JsonValueKind.Array && doc.RootElement.GetArrayLength() > 0)
                {
                    var prefs = doc.RootElement[0];
                    string lastDate = "";
                    if (prefs.TryGetProperty("vpn_usage_last_date", out var dateProp)) lastDate = dateProp.GetString() ?? "";

                    string todayStr = DateTime.UtcNow.ToString("yyyy-MM-dd");
                    if (lastDate == todayStr && prefs.TryGetProperty("vpn_usage_bytes", out var bytesProp))
                    {
                        _vpnTodayBytes = bytesProp.GetInt64();
                    }
                    else
                    {
                        _vpnTodayBytes = 0;
                        await UpdateVPNDailyUsageAsync(0);
                    }
                }
            }
            UpdateVPNRemainingDataUI();
        }
        catch (Exception ex)
        {
            Debug.WriteLine($"Error loading VPN usage: {ex.Message}");
        }
    }

    private async Task UpdateVPNDailyUsageAsync(long bytes)
    {
        _vpnTodayBytes = bytes;
        UpdateVPNRemainingDataUI();

        try
        {
            string todayStr = DateTime.UtcNow.ToString("yyyy-MM-dd");
            var fullPayload = new
            {
                p_user_id = _userId,
                p_vpn_usage_bytes = _vpnTodayBytes,
                p_vpn_usage_last_date = todayStr
            };

            // Call upsert preference stored procedure RPC/rest
            var request = CreateSupabaseRequest(HttpMethod.Post, "https://vqmukrmpgvavscsyefqd.supabase.co/rest/v1/rpc/upsert_user_preferences");
            request.Content = new StringContent(JsonSerializer.Serialize(fullPayload), Encoding.UTF8, "application/json");
            var response = await _httpClient.SendAsync(request);
            if (!response.IsSuccessStatusCode)
            {
                string respDetails = await response.Content.ReadAsStringAsync();
                Debug.WriteLine($"Failed to persist daily usage RPC: {response.StatusCode} - {respDetails}");
            }
        }
        catch (Exception ex)
        {
            Debug.WriteLine($"Error updating VPN usage: {ex.Message}");
        }
    }

    private void UpdateVPNRemainingDataUI()
    {
        long remaining = Math.Max(0, VPNDailyLimitBytes - _vpnTodayBytes);
        double mbRemaining = (double)remaining / (1024 * 1024);
        txtVPNRemainingData.Text = $"{mbRemaining:0.00} MB";

        if (mbRemaining < 5.0)
        {
            txtVPNRemainingData.Foreground = Brushes.Red;
        }
        else if (mbRemaining < 15.0)
        {
            txtVPNRemainingData.Foreground = Brushes.Orange;
        }
        else
        {
            txtVPNRemainingData.Foreground = Brushes.LimeGreen;
        }
    }

    private async Task QueryVPNServersAsync()
    {
        var probeTasks = new List<Task>();

        foreach (var server in _vpnServers)
        {
            server.Status = "loading";
            UpdateServerMarkerOnMap(server);

            var probeTask = Task.Run(async () =>
            {
                Stopwatch sw = Stopwatch.StartNew();
                try
                {
                    var response = await _httpClient.GetAsync(server.BaseUrl);
                    sw.Stop();

                    string ip = "";
                    if (response.IsSuccessStatusCode)
                    {
                        string body = await response.Content.ReadAsStringAsync();
                        using var doc = JsonDocument.Parse(body);
                        if (doc.RootElement.TryGetProperty("ip", out var ipProp)) ip = ipProp.GetString() ?? "";
                    }

                    try
                    {
                        await Dispatcher.InvokeAsync(() =>
                        {
                            server.Status = "offline";
                            server.IP = string.IsNullOrEmpty(ip) ? EstimateIPByName(server.Name) : ip;
                            server.LatencyText = response.IsSuccessStatusCode ? $"{sw.ElapsedMilliseconds} ms" : "Offline";
                            UpdateServerMarkerOnMap(server);
                        });
                    }
                    catch (TaskCanceledException) { }
                }
                catch
                {
                    try
                    {
                        await Dispatcher.InvokeAsync(() =>
                        {
                            server.Status = "offline";
                            server.IP = EstimateIPByName(server.Name);
                            server.LatencyText = "Offline";
                            UpdateServerMarkerOnMap(server);
                        });
                    }
                    catch (TaskCanceledException) { }
                }
            });

            probeTasks.Add(probeTask);
        }

        try
        {
            await Task.WhenAll(probeTasks);
        }
        catch (Exception ex)
        {
            Debug.WriteLine($"VPN Server Probing tasks failure: {ex.Message}");
        }
    }

    private string EstimateIPByName(string name)
    {
        return "Unavailable";
    }

    private void UpdateServerMarkerOnMap(VPNServerItem server)
    {
        if (_vpnMapView?.CoreWebView2 == null) return;
        string argsJson = JsonSerializer.Serialize(new object[] { server.Id, server.Name, server.Latitude, server.Longitude, server.IP, server.Status });
        string script = $"window.addServerMarker.apply(null, {argsJson})";
        _vpnMapView.CoreWebView2.ExecuteScriptAsync(script);
    }

    private void VpnMapView_WebMessageReceived(object? sender, CoreWebView2WebMessageReceivedEventArgs e)
    {
        try
        {
            if (_isVPNConnected) return; // Prevent map interactions while connected

            string raw = e.TryGetWebMessageAsString();
            using var doc = JsonDocument.Parse(raw);
            if (doc.RootElement.TryGetProperty("type", out var typeProp) && typeProp.GetString() == "select_server")
            {
                string id = doc.RootElement.GetProperty("id").GetString() ?? "";
                var server = _vpnServers.FirstOrDefault(s => s.Id == id);
                if (server != null)
                {
                    SelectVPNServer(server);
                }
            }
        }
        catch (Exception ex)
        {
            Debug.WriteLine($"WebMessage Exception: {ex.Message}");
        }
    }

    private void SelectVPNServer(VPNServerItem server)
    {
        if (_isVPNConnected) return; // Prevent reselection while VPN is connected

        _selectedVPNServer = server;
        txtVPNSelectedServer.Text = server.Name;
        txtVPNServerIP.Text = $"IP: {server.IP}";

        // Center map view on selected server
        if (_vpnMapView?.CoreWebView2 != null)
        {
            string latStr = server.Latitude.ToString(System.Globalization.CultureInfo.InvariantCulture);
            string lngStr = server.Longitude.ToString(System.Globalization.CultureInfo.InvariantCulture);
            string centerScript = $"window.centerMap({latStr}, {lngStr}, 6)";
            _vpnMapView.CoreWebView2.ExecuteScriptAsync(centerScript);
        }
    }

    private void BtnVPNServerSelect_Click(object sender, RoutedEventArgs e)
    {
        if (_isVPNConnected)
        {
            MessageBox.Show("Please disconnect from the active VPN server before changing locations.", "VPN Connected", MessageBoxButton.OK, MessageBoxImage.Information);
            return;
        }

        var btn = sender as Button;
        if (btn?.Tag is string serverId)
        {
            var server = _vpnServers.FirstOrDefault(s => s.Id == serverId);
            if (server != null)
            {
                SelectVPNServer(server);
            }
        }
    }

    private async void BtnVPNToggleConnection_Click(object sender, RoutedEventArgs e)
    {
        if (_selectedVPNServer == null)
        {
            MessageBox.Show("Please select a VPN server location first.", "No Location Selected", MessageBoxButton.OK, MessageBoxImage.Warning);
            return;
        }

        if (_vpnTodayBytes >= VPNDailyLimitBytes && chkVPNLimit.IsChecked == true)
        {
            MessageBox.Show("You have exhausted your daily experimental VPN data limit of 50MB.", "Data Limit Reached", MessageBoxButton.OK, MessageBoxImage.Error);
            return;
        }

        btnVPNToggleConnection.IsEnabled = false;

        try
        {
            if (_isVPNConnected)
            {
                btnVPNToggleConnection.Content = "Disconnecting...";
                bool success = await VPNConnectionManager.DisconnectAsync(_selectedVPNServer.Name);

                _selectedVPNServer.Status = "offline";
                UpdateServerMarkerOnMap(_selectedVPNServer);

                _isVPNConnected = false;
                btnVPNToggleConnection.Content = "Connect";
                btnVPNToggleConnection.Background = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#2196F3"));

                StopVPNTimers();
                VPNKillswitchManager.SetKillswitchActive(false);
            }
            else
            {
                btnVPNToggleConnection.Content = "Connecting...";
                _selectedVPNServer.Status = "loading";
                UpdateServerMarkerOnMap(_selectedVPNServer);

                VPNConnectionManager.CreateOrUpdateVPNProfile(_selectedVPNServer.Name, _selectedVPNServer.BaseUrl);
                bool success = await VPNConnectionManager.ConnectAsync(_selectedVPNServer.Name, _userId, _accessToken);

                if (success)
                {
                    _selectedVPNServer.Status = "connected";
                    UpdateServerMarkerOnMap(_selectedVPNServer);

                    _isVPNConnected = true;
                    btnVPNToggleConnection.Content = "Disconnect";
                    btnVPNToggleConnection.Background = Brushes.Crimson;

                    if (chkVPNKillswitch.IsChecked == true)
                    {
                        VPNKillswitchManager.SetKillswitchActive(true);
                    }

                    StartVPNTimers();
                }
                else
                {
                    _selectedVPNServer.Status = "offline";
                    UpdateServerMarkerOnMap(_selectedVPNServer);
                    MessageBox.Show("Failed to establish device-wide VPN connection. Server may be sleeping, please try again in a few moments.", "Connection Failed", MessageBoxButton.OK, MessageBoxImage.Error);

                    if (chkVPNKillswitch.IsChecked == true)
                    {
                        VPNKillswitchManager.SetKillswitchActive(true);
                    }
                    else
                    {
                        VPNKillswitchManager.SetKillswitchActive(false);
                    }

                    btnVPNToggleConnection.Content = "Connect";
                }
            }
        }
        catch (Exception ex)
        {
            MessageBox.Show($"VPN State Toggle Error: {ex.Message}", "Tunnel Operation Failure", MessageBoxButton.OK, MessageBoxImage.Error);
            if (chkVPNKillswitch.IsChecked == true)
            {
                VPNKillswitchManager.SetKillswitchActive(true);
            }
            else
            {
                VPNKillswitchManager.SetKillswitchActive(false);
            }
            btnVPNToggleConnection.Content = _isVPNConnected ? "Disconnect" : "Connect";
        }
        finally
        {
            btnVPNToggleConnection.IsEnabled = true;
        }
    }

    private void StartVPNTimers()
    {
        _vpnStartTime = DateTime.Now;
        _vpnTimer = new System.Windows.Threading.DispatcherTimer();
        _vpnTimer.Interval = TimeSpan.FromSeconds(1);
        _vpnTimer.Tick += VPNTimer_Tick;
        _vpnTimer.Start();

        _vpnDataTimer = new System.Windows.Threading.DispatcherTimer();
        _vpnDataTimer.Interval = TimeSpan.FromSeconds(3);
        _vpnDataTimer.Tick += VPNDataTimer_Tick;
        _vpnDataTimer.Start();
    }

    private void StopVPNTimers()
    {
        _vpnTimer?.Stop();
        _vpnTimer = null;
        _vpnDataTimer?.Stop();
        _vpnDataTimer = null;

        txtVPNConnectionDuration.Text = "Uptime: 00:00:00";
    }

    private void VPNTimer_Tick(object? sender, EventArgs e)
    {
        TimeSpan duration = DateTime.Now - _vpnStartTime;
        txtVPNConnectionDuration.Text = $"Uptime: {duration.Hours:00}:{duration.Minutes:00}:{duration.Seconds:00}";
    }

    private long _vpnBaselineBytes = -1;
    private int _vpnTicksSinceFlush = 0;

    private async void VPNDataTimer_Tick(object? sender, EventArgs e)
    {
        if (_selectedVPNServer == null) return;

        long currentBytes = 0;
        bool resolved = false;
        try
        {
            var interfaces = System.Net.NetworkInformation.NetworkInterface.GetAllNetworkInterfaces();
            foreach (var ni in interfaces)
            {
                if (ni.Name == _selectedVPNServer.Name || ni.Description == _selectedVPNServer.Name)
                {
                    var stats = ni.GetIPStatistics();
                    currentBytes += stats.BytesReceived + stats.BytesSent;
                    resolved = true;
                }
            }
        }
        catch (Exception ex)
        {
            Debug.WriteLine($"Error querying network stats: {ex.Message}");
        }

        if (!resolved)
        {
            return;
        }

        if (_vpnBaselineBytes == -1)
        {
            _vpnBaselineBytes = currentBytes;
        }

        long delta = Math.Max(0, currentBytes - _vpnBaselineBytes);
        _vpnBaselineBytes = currentBytes;
        _vpnTodayBytes += delta;

        _vpnTicksSinceFlush++;
        if (_vpnTicksSinceFlush >= 10) // Flush every 10 ticks (~30s)
        {
            _vpnTicksSinceFlush = 0;
            await UpdateVPNDailyUsageAsync(_vpnTodayBytes);
        }
        else
        {
            UpdateVPNRemainingDataUI();
        }

        if (_vpnTodayBytes >= VPNDailyLimitBytes && chkVPNLimit.IsChecked == true)
        {
            StopVPNTimers();

            try
            {
                if (_selectedVPNServer != null)
                {
                    bool success = await VPNConnectionManager.DisconnectAsync(_selectedVPNServer.Name);
                    if (success)
                    {
                        _selectedVPNServer.Status = "offline";
                        UpdateServerMarkerOnMap(_selectedVPNServer);

                        _isVPNConnected = false;
                        btnVPNToggleConnection.Content = "Connect";
                        btnVPNToggleConnection.Background = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#2196F3"));

                        if (chkVPNKillswitch.IsChecked == true)
                        {
                            VPNKillswitchManager.SetKillswitchActive(true);
                        }

                        MessageBox.Show("You have hit your daily VPN data usage limit of 50MB. Disconnecting device-wide tunnel.", "Limit Exceeded", MessageBoxButton.OK, MessageBoxImage.Warning);
                    }
                    else
                    {
                        // Explicitly reconcile and report failure
                        _selectedVPNServer.Status = "offline";
                        UpdateServerMarkerOnMap(_selectedVPNServer);
                        _isVPNConnected = false;
                        btnVPNToggleConnection.Content = "Connect";
                        btnVPNToggleConnection.Background = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#2196F3"));

                        if (chkVPNKillswitch.IsChecked == true)
                        {
                            VPNKillswitchManager.SetKillswitchActive(true);
                        }

                        MessageBox.Show("Limit reached but disconnection failed. System VPN tunnel remains connected, but limit settings have been activated.", "Disconnect Error", MessageBoxButton.OK, MessageBoxImage.Error);
                    }
                }
            }
            catch (Exception ex)
            {
                Debug.WriteLine($"Limit teardown failure: {ex.Message}");
            }
        }
    }

    private void ChkVPNKillswitchChanged(object sender, RoutedEventArgs e)
    {
        if (!IsLoaded) return; // Prevent early triggers before component layout load completion
        if (chkVPNKillswitch == null) return;

        try
        {
            if (chkVPNKillswitch.IsChecked == true && (_selectedVPNServer == null || _selectedVPNServer.Status != "connected"))
            {
                VPNKillswitchManager.SetKillswitchActive(true);
            }
            else
            {
                VPNKillswitchManager.SetKillswitchActive(false);
            }
        }
        catch (Exception ex)
        {
            Debug.WriteLine($"Killswitch configuration state error: {ex.Message}");
        }
    }

    private void ChkVPNLimitChanged(object sender, RoutedEventArgs e)
    {
        if (!IsLoaded) return;
        // Limit checkboxes specifically configured without firewall killswitch side effects
        Debug.WriteLine($"Limit configuration changed to: {chkVPNLimit.IsChecked}");
    }

    private async void BtnRetryAuth_Click(object sender, RoutedEventArgs e)
    {
        try
        {
            btnRetryAuth.IsEnabled = false;
            await InitializeAppsTabAsync();
        }
        catch (Exception ex)
        {
            MessageBox.Show($"Retry failed: {ex.Message}", "Retry Failed", MessageBoxButton.OK, MessageBoxImage.Error);
        }
        finally
        {
            btnRetryAuth.IsEnabled = true;
        }
    }

    // --- NATIVE CHATBOT IMPLEMENTATION ---

    private async Task LoadChatbotMetadataAsync()
    {
        try
        {
            // Fetch configs concurrently using shared Client and separate requests
            var modelsReq = CreateSupabaseRequest(HttpMethod.Get, "https://vqmukrmpgvavscsyefqd.supabase.co/rest/v1/user_models?select=provider,model_id&order=provider");
            var stylesReq = CreateSupabaseRequest(HttpMethod.Get, $"{_targetUrl}/api/ai/styles");
            var charsReq = CreateSupabaseRequest(HttpMethod.Get, "https://vqmukrmpgvavscsyefqd.supabase.co/rest/v1/characters?select=id,name,display_name,is_encrypted");
            var localModelsReq = CreateSupabaseRequest(HttpMethod.Get, $"{_targetUrl}/api/ai/local-providers");

            var modelsTask = _httpClient.SendAsync(modelsReq);
            var stylesTask = _httpClient.SendAsync(stylesReq);
            var charsTask = _httpClient.SendAsync(charsReq);
            var localModelsTask = _httpClient.SendAsync(localModelsReq);

            await Task.WhenAll(modelsTask, stylesTask, charsTask, localModelsTask);

            // Parse Models
            var listModels = new List<ModelItem>();
            if (modelsTask.Result.IsSuccessStatusCode)
            {
                string json = await modelsTask.Result.Content.ReadAsStringAsync();
                var items = JsonSerializer.Deserialize<List<ModelItem>>(json);
                if (items != null) listModels.AddRange(items);
            }
            if (localModelsTask.Result.IsSuccessStatusCode)
            {
                string json = await localModelsTask.Result.Content.ReadAsStringAsync();
                var items = JsonSerializer.Deserialize<List<ModelItem>>(json);
                if (items != null) listModels.AddRange(items);
            }
            _models = listModels.GroupBy(m => $"{m.provider}:{m.model_id}").Select(g => g.First()).ToList();
            cmbModels.ItemsSource = _models;
            if (_models.Count > 0) cmbModels.SelectedIndex = 0;

            // Parse Styles
            if (stylesTask.Result.IsSuccessStatusCode)
            {
                string json = await stylesTask.Result.Content.ReadAsStringAsync();
                _styles = JsonSerializer.Deserialize<List<StyleItem>>(json) ?? new();
                cmbStyles.ItemsSource = _styles;
                if (_styles.Count > 0) cmbStyles.SelectedIndex = 0;
            }

            // Parse Characters with individual try-catch blocks and error dialogs for decryption failures
            if (charsTask.Result.IsSuccessStatusCode)
            {
                string json = await charsTask.Result.Content.ReadAsStringAsync();
                var rawChars = JsonSerializer.Deserialize<List<CharacterItem>>(json) ?? new();
                _characters = new List<CharacterItem>();

                foreach (var c in rawChars)
                {
                    try
                    {
                        if (c.is_encrypted && !string.IsNullOrEmpty(_masterKey))
                        {
                            c.name = CryptoHelper.Decrypt(c.name, _masterKey);
                            if (c.display_name != null)
                            {
                                c.display_name = CryptoHelper.Decrypt(c.display_name, _masterKey);
                            }
                        }
                        _characters.Add(c);
                    }
                    catch (Exception ex)
                    {
                        MessageBox.Show($"Failed to decrypt profile for character '{c.name}'. {ex.Message}", "Character Decryption Error", MessageBoxButton.OK, MessageBoxImage.Error);
                        _characters.Add(new CharacterItem { id = c.id, name = "[Undecryptable character]", display_name = "[Undecryptable character]" });
                    }
                }

                // Decouple Character sources for LLM and User Characters via separate collections
                var withNoneLlm = new List<CharacterItem> { new CharacterItem { id = "", name = "None" } };
                withNoneLlm.AddRange(_characters);

                var withNoneUser = new List<CharacterItem> { new CharacterItem { id = "", name = "None" } };
                withNoneUser.AddRange(_characters);

                cmbLlmCharacters.ItemsSource = withNoneLlm;
                cmbUserCharacters.ItemsSource = withNoneUser;

                cmbLlmCharacters.SelectedIndex = 0;
                cmbUserCharacters.SelectedIndex = 0;
            }
        }
        catch (Exception ex)
        {
            Debug.WriteLine($"Failed to load metadata: {ex.Message}");
        }
    }

    private async Task LoadChatsAsync()
    {
        try
        {
            var request = CreateSupabaseRequest(HttpMethod.Get, "https://vqmukrmpgvavscsyefqd.supabase.co/rest/v1/chats?select=*&order=updated_at.desc");
            var response = await _httpClient.SendAsync(request);
            if (response.IsSuccessStatusCode)
            {
                string json = await response.Content.ReadAsStringAsync();
                var list = JsonSerializer.Deserialize<List<ChatItem>>(json) ?? new();

                foreach (var chat in list)
                {
                    chat.Title = chat.is_encrypted && !string.IsNullOrEmpty(_masterKey)
                        ? CryptoHelper.Decrypt(chat.title, _masterKey)
                        : chat.title;
                }

                _chats = new ObservableCollection<ChatItem>(list);
                lstChats.ItemsSource = _chats;
            }
        }
        catch (Exception ex)
        {
            MessageBox.Show($"Failed to load chats: {ex.Message}", "Load Chats Failed", MessageBoxButton.OK, MessageBoxImage.Error);
        }
    }

    private async Task LoadChatMessagesAsync(string chatId)
    {
        _currentLoadingChatId = chatId;
        try
        {
            var request = CreateSupabaseRequest(HttpMethod.Get, $"https://vqmukrmpgvavscsyefqd.supabase.co/rest/v1/chat_messages?chat_id=eq.{chatId}&order=created_at.asc");
            var response = await _httpClient.SendAsync(request);
            if (response.IsSuccessStatusCode)
            {
                // Prevent stale async loads from overwriting currently selected chat
                if (_currentLoadingChatId != chatId) return;

                string json = await response.Content.ReadAsStringAsync();
                var items = JsonSerializer.Deserialize<List<ChatMessageItem>>(json) ?? new();

                _messagesList.Clear();
                foreach (var m in items)
                {
                    string content = m.content;
                    if (m.is_encrypted && !string.IsNullOrEmpty(_masterKey))
                    {
                        content = CryptoHelper.Decrypt(content, _masterKey);
                    }

                    bool isUser = m.role == "user";
                    _messagesList.Add(new MessageViewModel
                    {
                        RoleHeader = isUser ? "You" : "Assistant",
                        Content = content,
                        Alignment = isUser ? HorizontalAlignment.Right : HorizontalAlignment.Left,
                        BackgroundBrush = isUser ? UserBgBrush : AssistantBgBrush,
                        BorderBrush = isUser ? UserBorderBrush : AssistantBorderBrush
                    });
                }

                itemsMessages.ItemsSource = _messagesList;
                ScrollMessagesToEnd();
            }
        }
        catch (Exception ex)
        {
            MessageBox.Show($"Failed to load messages: {ex.Message}", "Load Messages Failed", MessageBoxButton.OK, MessageBoxImage.Error);
        }
    }

    private async Task CreateNewChatAsync()
    {
        try
        {
            string rawTitle = "New Chat (Desktop)";
            bool useEncryption = _isEncryptionEnabled && !string.IsNullOrEmpty(_masterKey);
            string encryptedTitle = useEncryption
                ? CryptoHelper.Encrypt(rawTitle, _masterKey)
                : rawTitle;

            var payload = new
            {
                user_id = _userId,
                title = encryptedTitle,
                style = "GeneralAssistant",
                is_encrypted = useEncryption // Derive is_encrypted properly from the encryption conditions
            };

            var request = CreateSupabaseRequest(HttpMethod.Post, "https://vqmukrmpgvavscsyefqd.supabase.co/rest/v1/chats");
            request.Headers.Add("Prefer", "return=representation");
            request.Content = new StringContent(JsonSerializer.Serialize(payload), Encoding.UTF8, "application/json");

            var response = await _httpClient.SendAsync(request);
            if (response.IsSuccessStatusCode)
            {
                string json = await response.Content.ReadAsStringAsync();
                var createdList = JsonSerializer.Deserialize<List<ChatItem>>(json);
                if (createdList != null && createdList.Count > 0)
                {
                    var newChat = createdList[0];
                    newChat.Title = rawTitle;
                    _chats.Insert(0, newChat);
                    lstChats.SelectedItem = newChat;
                }
            }
            else
            {
                // Surface response status code and body on chat creation failure
                string errBody = await response.Content.ReadAsStringAsync();
                MessageBox.Show($"Failed to create chat. Status: {response.StatusCode}\nError Details: {errBody}", "Chat Creation Failed", MessageBoxButton.OK, MessageBoxImage.Error);
            }
        }
        catch (Exception ex)
        {
            MessageBox.Show($"Failed to create chat: {ex.Message}", "Error", MessageBoxButton.OK, MessageBoxImage.Error);
        }
    }

    private async Task DeleteChatAsync(string chatId)
    {
        try
        {
            var request = CreateSupabaseRequest(HttpMethod.Delete, $"https://vqmukrmpgvavscsyefqd.supabase.co/rest/v1/chats?id=eq.{chatId}");
            var response = await _httpClient.SendAsync(request);
            if (response.IsSuccessStatusCode)
            {
                var removed = _chats.FirstOrDefault(c => c.id == chatId);
                if (removed != null) _chats.Remove(removed);
                if (_activeChat?.id == chatId)
                {
                    _activeChat = null;
                    _messagesList.Clear();
                }
            }
        }
        catch (Exception ex)
        {
            MessageBox.Show($"Failed to delete chat: {ex.Message}", "Error", MessageBoxButton.OK, MessageBoxImage.Error);
        }
    }

    private async Task SendMessageAsync()
    {
        string text = txtChatInput.Text.Trim();
        if (string.IsNullOrEmpty(text) || _activeChat == null) return;

        string originalInput = text;
        txtChatInput.Text = "";
        btnSendChat.IsEnabled = false;

        // Add optimistic user message to local UI list
        var optimisticUserMsg = new MessageViewModel
        {
            RoleHeader = "You",
            Content = text,
            Alignment = HorizontalAlignment.Right,
            BackgroundBrush = UserBgBrush,
            BorderBrush = UserBorderBrush
        };
        _messagesList.Add(optimisticUserMsg);
        ScrollMessagesToEnd();

        try
        {
            // Save user message to Supabase
            bool useEncryption = _isEncryptionEnabled && !string.IsNullOrEmpty(_masterKey);
            string encryptedUserText = useEncryption
                ? CryptoHelper.Encrypt(text, _masterKey)
                : text;

            var msgPayload = new
            {
                chat_id = _activeChat.id,
                role = "user",
                content = encryptedUserText,
                is_encrypted = useEncryption
            };

            var msgRequest = CreateSupabaseRequest(HttpMethod.Post, "https://vqmukrmpgvavscsyefqd.supabase.co/rest/v1/chat_messages");
            msgRequest.Content = new StringContent(JsonSerializer.Serialize(msgPayload), Encoding.UTF8, "application/json");

            var msgResponse = await _httpClient.SendAsync(msgRequest);
            if (!msgResponse.IsSuccessStatusCode)
            {
                // Rollback optimistic user entry and restore input on user insert fail
                _messagesList.Remove(optimisticUserMsg);
                txtChatInput.Text = originalInput;
                throw new Exception($"Failed to save message: {await msgResponse.Content.ReadAsStringAsync()}");
            }

            // Call proxy
            var modelSelection = cmbModels.SelectedItem as ModelItem;
            var styleSelection = cmbStyles.SelectedItem as StyleItem;

            if (modelSelection == null)
            {
                throw new Exception("Please select a valid model.");
            }

            var messagesPayload = _messagesList.Select(m => new
            {
                role = m.RoleHeader == "You" ? "user" : "assistant",
                content = m.Content
            }).ToList();

            var proxyPayload = new
            {
                provider = modelSelection.provider,
                model = modelSelection.model_id,
                messages = messagesPayload,
                stream = true,
                style = styleSelection?.id
            };

            // Use InfiniteTimeSpan with per-request CancellationTokenSource to keep SSE stream open
            using var cts = new CancellationTokenSource();
            var proxyRequest = CreateSupabaseRequest(HttpMethod.Post, $"{_targetUrl}/api/ai/proxy");
            proxyRequest.Content = new StringContent(JsonSerializer.Serialize(proxyPayload), Encoding.UTF8, "application/json");

            var assistantMsg = new MessageViewModel
            {
                RoleHeader = "Assistant",
                Content = "...",
                Alignment = HorizontalAlignment.Left,
                BackgroundBrush = AssistantBgBrush,
                BorderBrush = AssistantBorderBrush
            };
            _messagesList.Add(assistantMsg);
            ScrollMessagesToEnd();

            var proxyResponse = await _httpClient.SendAsync(proxyRequest, HttpCompletionOption.ResponseHeadersRead, cts.Token);
            if (!proxyResponse.IsSuccessStatusCode)
            {
                // Rollback optimistic entries on proxy error
                _messagesList.Remove(optimisticUserMsg);
                _messagesList.Remove(assistantMsg);
                txtChatInput.Text = originalInput;

                string errText = await proxyResponse.Content.ReadAsStringAsync();
                MessageBox.Show($"Error calling proxy: {errText}", "Proxy Error", MessageBoxButton.OK, MessageBoxImage.Error);
                return;
            }

            using var stream = await proxyResponse.Content.ReadAsStreamAsync();
            using var reader = new StreamReader(stream);

            StringBuilder fullResponse = new StringBuilder();
            assistantMsg.Content = "";

            // Repeatedly await ReadLineAsync and continue processing non-null lines
            while (true)
            {
                string? line = await reader.ReadLineAsync();
                if (line == null) break; // Terminate when returns null

                if (string.IsNullOrEmpty(line)) continue;
                if (!line.StartsWith("data: ")) continue;

                string dataStr = line.Substring(6).Trim();
                if (dataStr == "[DONE]") break;

                try
                {
                    using var doc = JsonDocument.Parse(dataStr);
                    string delta = "";
                    if (doc.RootElement.TryGetProperty("choices", out var choices) && choices.GetArrayLength() > 0)
                    {
                        var firstChoice = choices[0];
                        if (firstChoice.TryGetProperty("delta", out var deltaObj) && deltaObj.TryGetProperty("content", out var contentProp))
                        {
                            delta = contentProp.GetString() ?? "";
                        }
                    }
                    else if (doc.RootElement.TryGetProperty("delta", out var deltaObj) && deltaObj.TryGetProperty("text", out var textProp))
                    {
                        delta = textProp.GetString() ?? "";
                    }

                    if (!string.IsNullOrEmpty(delta))
                    {
                        fullResponse.Append(delta);
                        assistantMsg.Content = fullResponse.ToString();
                        ScrollMessagesToEnd();
                    }
                }
                catch
                {
                    // Ignore parsing error for intermediate chunks
                }
            }

            // Save assistant message to Supabase
            string encryptedAssistantText = useEncryption
                ? CryptoHelper.Encrypt(fullResponse.ToString(), _masterKey)
                : fullResponse.ToString();

            var assistantSavePayload = new
            {
                chat_id = _activeChat.id,
                role = "assistant",
                content = encryptedAssistantText,
                is_encrypted = useEncryption
            };

            var saveRequest = CreateSupabaseRequest(HttpMethod.Post, "https://vqmukrmpgvavscsyefqd.supabase.co/rest/v1/chat_messages");
            saveRequest.Content = new StringContent(JsonSerializer.Serialize(assistantSavePayload), Encoding.UTF8, "application/json");
            var saveResponse = await _httpClient.SendAsync(saveRequest);
            if (!saveResponse.IsSuccessStatusCode)
            {
                // Trigger rollback if assistant save fails
                _messagesList.Remove(optimisticUserMsg);
                _messagesList.Remove(assistantMsg);
                txtChatInput.Text = originalInput;
                throw new Exception($"Failed to persist assistant message: {await saveResponse.Content.ReadAsStringAsync()}");
            }

            // Update chat updated_at
            var updatePayload = new
            {
                updated_at = DateTime.UtcNow.ToString("o")
            };
            var updateRequest = CreateSupabaseRequest(HttpMethod.Patch, $"https://vqmukrmpgvavscsyefqd.supabase.co/rest/v1/chats?id=eq.{_activeChat.id}");
            updateRequest.Content = new StringContent(JsonSerializer.Serialize(updatePayload), Encoding.UTF8, "application/json");
            await _httpClient.SendAsync(updateRequest);
        }
        catch (Exception ex)
        {
            MessageBox.Show($"Error: {ex.Message}", "Message Flow Error", MessageBoxButton.OK, MessageBoxImage.Error);
        }
        finally
        {
            btnSendChat.IsEnabled = true;
            txtChatInput.Focus();
        }
    }

    private void ScrollMessagesToEnd()
    {
        // Scroll via Background priority so it executes after layout engine updates
        Dispatcher.BeginInvoke(new Action(() => scrollerMessages.ScrollToEnd()), System.Windows.Threading.DispatcherPriority.Background);
    }

    private async Task UpdateChatConfigurationAsync(object patchPayload)
    {
        if (_activeChat == null) return;
        try
        {
            var request = CreateSupabaseRequest(HttpMethod.Patch, $"https://vqmukrmpgvavscsyefqd.supabase.co/rest/v1/chats?id=eq.{_activeChat.id}");
            request.Content = new StringContent(JsonSerializer.Serialize(patchPayload), Encoding.UTF8, "application/json");
            await _httpClient.SendAsync(request);
        }
        catch (Exception ex)
        {
            Debug.WriteLine($"Failed to update chat config: {ex.Message}");
        }
    }

    private void LstChats_SelectionChanged(object sender, SelectionChangedEventArgs e)
    {
        try
        {
            _activeChat = lstChats.SelectedItem as ChatItem;
            if (_activeChat != null)
            {
                _ = LoadChatMessagesAsync(_activeChat.id);

                // When style, LLM character, or user character lookup returns null, explicitly reset to index-0/None
                var s = _styles.FirstOrDefault(st => st.id == _activeChat.style);
                if (s != null) cmbStyles.SelectedItem = s;
                else cmbStyles.SelectedIndex = 0;

                var llmChar = cmbLlmCharacters.Items.Cast<CharacterItem>().FirstOrDefault(c => c.id == _activeChat.llm_character_id);
                if (llmChar != null) cmbLlmCharacters.SelectedItem = llmChar;
                else cmbLlmCharacters.SelectedIndex = 0;

                var userChar = cmbUserCharacters.Items.Cast<CharacterItem>().FirstOrDefault(c => c.id == _activeChat.user_character_id);
                if (userChar != null) cmbUserCharacters.SelectedItem = userChar;
                else cmbUserCharacters.SelectedIndex = 0;
            }
            else
            {
                _messagesList.Clear();
            }
        }
        catch (Exception ex)
        {
            MessageBox.Show($"Selection error: {ex.Message}");
        }
    }

    private void BtnDeleteChat_Click(object sender, RoutedEventArgs e)
    {
        try
        {
            var btn = sender as Button;
            if (btn?.Tag is string chatId)
            {
                e.Handled = true;
                var result = MessageBox.Show("Are you sure you want to delete this chat?", "Confirm Delete", MessageBoxButton.YesNo, MessageBoxImage.Warning);
                if (result == MessageBoxResult.Yes)
                {
                    _ = DeleteChatAsync(chatId);
                }
            }
        }
        catch (Exception ex)
        {
            MessageBox.Show($"Delete chat failed: {ex.Message}");
        }
    }

    private void BtnNewChat_Click(object sender, RoutedEventArgs e)
    {
        try
        {
            _ = CreateNewChatAsync();
        }
        catch (Exception ex)
        {
            MessageBox.Show($"New Chat trigger failed: {ex.Message}");
        }
    }

    private void TxtChatInput_KeyDown(object sender, KeyEventArgs e)
    {
        if (e.Key == Key.Enter)
        {
            try
            {
                _ = SendMessageAsync();
            }
            catch (Exception ex)
            {
                MessageBox.Show($"Send message failed: {ex.Message}");
            }
        }
    }

    private void BtnSendChat_Click(object sender, RoutedEventArgs e)
    {
        try
        {
            _ = SendMessageAsync();
        }
        catch (Exception ex)
        {
            MessageBox.Show($"Send failed: {ex.Message}");
        }
    }

    private void CmbModels_SelectionChanged(object sender, SelectionChangedEventArgs e) { }

    private async void CmbStyles_SelectionChanged(object sender, SelectionChangedEventArgs e)
    {
        try
        {
            var item = cmbStyles.SelectedItem as StyleItem;
            if (item != null && _activeChat != null && _activeChat.style != item.id)
            {
                _activeChat.style = item.id;
                await UpdateChatConfigurationAsync(new { style = item.id });
            }
        }
        catch (Exception ex)
        {
            MessageBox.Show($"Style update failed: {ex.Message}");
        }
    }

    private async void CmbLlmCharacters_SelectionChanged(object sender, SelectionChangedEventArgs e)
    {
        try
        {
            var item = cmbLlmCharacters.SelectedItem as CharacterItem;
            if (item != null && _activeChat != null && _activeChat.llm_character_id != item.id)
            {
                _activeChat.llm_character_id = string.IsNullOrEmpty(item.id) ? null : item.id;
                await UpdateChatConfigurationAsync(new { llm_character_id = _activeChat.llm_character_id });
            }
        }
        catch (Exception ex)
        {
            MessageBox.Show($"LLM character update failed: {ex.Message}");
        }
    }

    private async void CmbUserCharacters_SelectionChanged(object sender, SelectionChangedEventArgs e)
    {
        try
        {
            var item = cmbUserCharacters.SelectedItem as CharacterItem;
            if (item != null && _activeChat != null && _activeChat.user_character_id != item.id)
            {
                _activeChat.user_character_id = string.IsNullOrEmpty(item.id) ? null : item.id;
                await UpdateChatConfigurationAsync(new { user_character_id = _activeChat.user_character_id });
            }
        }
        catch (Exception ex)
        {
            MessageBox.Show($"User character update failed: {ex.Message}");
        }
    }

    // --- NATIVE FILE COMPRESSOR IMPLEMENTATION ---

    private async Task LoadStorageFilesAsync()
    {
        try
        {
            var allFiles = new List<StorageFileItem>();
            int limit = 100;
            int offset = 0;

            // Paginate through all available objects before applying filters
            while (true)
            {
                var payload = new
                {
                    prefix = "",
                    limit = limit,
                    offset = offset,
                    sortBy = new { column = "name", order = "asc" }
                };

                var content = new StringContent(JsonSerializer.Serialize(payload), Encoding.UTF8, "application/json");
                var request = CreateSupabaseRequest(HttpMethod.Post, "https://vqmukrmpgvavscsyefqd.supabase.co/storage/v1/object/list/Storage");
                request.Content = content;

                var response = await _httpClient.SendAsync(request);
                if (!response.IsSuccessStatusCode)
                {
                    string errBody = await response.Content.ReadAsStringAsync();
                    throw new Exception($"Failed to list files. Status: {response.StatusCode}\nDetails: {errBody}");
                }

                string json = await response.Content.ReadAsStringAsync();
                var files = JsonSerializer.Deserialize<List<StorageFileItem>>(json) ?? new();
                if (files.Count == 0) break;

                allFiles.AddRange(files);
                if (files.Count < limit) break;

                offset += limit;
            }

            var imageFiles = allFiles.Where(f => f.metadata?.mimetype?.StartsWith("image/") == true).ToList();
            cmbStorageFiles.ItemsSource = imageFiles;

            if (imageFiles.Count > 0)
            {
                cmbStorageFiles.SelectedIndex = 0;
            }
            else
            {
                // Show clear "no images found" state when completed image list is empty
                MessageBox.Show("No image files found in your storage bucket.", "No Images Found", MessageBoxButton.OK, MessageBoxImage.Information);
            }
        }
        catch (Exception ex)
        {
            MessageBox.Show($"Failed to load storage files: {ex.Message}", "Error Loading Files", MessageBoxButton.OK, MessageBoxImage.Error);
        }
    }

    private async Task CompressAndUploadFileAsync()
    {
        var selectedFile = cmbStorageFiles.SelectedItem as StorageFileItem;
        if (selectedFile == null)
        {
            MessageBox.Show("Please select a file to compress.");
            return;
        }

        double quality = sliderQuality.Value;
        double targetSizeMB = 0;
        bool hasTargetSize = !string.IsNullOrEmpty(txtTargetSizeMB.Text.Trim()) && double.TryParse(txtTargetSizeMB.Text.Trim(), out targetSizeMB) && targetSizeMB > 0;

        panelCompressorIdle.Visibility = Visibility.Collapsed;
        panelCompressorSuccess.Visibility = Visibility.Collapsed;
        panelCompressorRunning.Visibility = Visibility.Visible;
        btnStartCompression.IsEnabled = false;

        try
        {
            // 1. Download
            txtCompressorStatus.Text = "Downloading file...";
            var downloadReq = CreateSupabaseRequest(HttpMethod.Get, $"https://vqmukrmpgvavscsyefqd.supabase.co/storage/v1/object/Storage/{Uri.EscapeDataString(selectedFile.name)}");
            var downloadResponse = await _httpClient.SendAsync(downloadReq);
            if (!downloadResponse.IsSuccessStatusCode)
            {
                throw new Exception($"Download failed: {await downloadResponse.Content.ReadAsStringAsync()}");
            }

            byte[] originalBytes = await downloadResponse.Content.ReadAsByteArrayAsync();

            // 2. Compress locally on background worker thread to keep UI responsive
            txtCompressorStatus.Text = "Compressing image locally...";
            byte[] compressedBytes = await Task.Run(() =>
            {
                using (var inStream = new MemoryStream(originalBytes))
                {
                    var decoder = BitmapDecoder.Create(inStream, BitmapCreateOptions.None, BitmapCacheOption.OnLoad);
                    var frame = decoder.Frames[0];
                    frame.Freeze(); // Freeze frame to make it thread-safe before thread handoff

                    if (hasTargetSize)
                    {
                        double targetSizeBytes = targetSizeMB * 1024 * 1024;
                        byte[] currentCompressed = originalBytes;
                        bool success = false;

                        // Iteratively reduce JPEG quality and re-encode until output fits or q reaches 5
                        for (int q = (int)quality; q >= 5; q -= 5)
                        {
                            using (var outStream = new MemoryStream())
                            {
                                var encoder = new JpegBitmapEncoder();
                                encoder.QualityLevel = q;
                                encoder.Frames.Add(BitmapFrame.Create(frame));
                                encoder.Save(outStream);
                                byte[] temp = outStream.ToArray();
                                if (temp.Length <= targetSizeBytes)
                                {
                                    currentCompressed = temp;
                                    success = true;
                                    break;
                                }
                                currentCompressed = temp; // Best effort
                            }
                        }

                        if (!success)
                        {
                            Dispatcher.Invoke(() =>
                            {
                                MessageBox.Show($"Warning: Could not compress file to fit within target size of {targetSizeMB} MB. Best effort compression was applied.", "Target Size Warning", MessageBoxButton.OK, MessageBoxImage.Warning);
                            });
                        }

                        return currentCompressed;
                    }
                    else
                    {
                        using (var outStream = new MemoryStream())
                        {
                            var encoder = new JpegBitmapEncoder();
                            encoder.QualityLevel = (int)quality;
                            encoder.Frames.Add(BitmapFrame.Create(frame));
                            encoder.Save(outStream);
                            return outStream.ToArray();
                        }
                    }
                }
            });

            // 3. Upload
            txtCompressorStatus.Text = "Uploading compressed file...";
            string baseName = Path.GetFileNameWithoutExtension(selectedFile.name);
            string newFileName = $"{baseName}_compressed.jpg"; // Always use .jpg extension

            var uploadContent = new ByteArrayContent(compressedBytes);
            uploadContent.Headers.ContentType = new System.Net.Http.Headers.MediaTypeHeaderValue("image/jpeg");

            var uploadRequest = CreateSupabaseRequest(HttpMethod.Post, $"https://vqmukrmpgvavscsyefqd.supabase.co/storage/v1/object/Storage/{Uri.EscapeDataString(newFileName)}");
            uploadRequest.Content = uploadContent;
            uploadRequest.Headers.Add("x-upsert", "true");

            var uploadResponse = await _httpClient.SendAsync(uploadRequest);
            if (!uploadResponse.IsSuccessStatusCode)
            {
                throw new Exception($"Upload failed: {await uploadResponse.Content.ReadAsStringAsync()}");
            }

            txtOrigSize.Text = FormatSize(originalBytes.Length);
            txtNewSize.Text = FormatSize(compressedBytes.Length);

            double savings = (1.0 - (double)compressedBytes.Length / originalBytes.Length) * 100.0;
            if (savings < 0)
            {
                // Clamp or relabel negative savings as size increase
                txtSavings.Text = $"Size increased by {Math.Abs(savings):0}%";
            }
            else
            {
                txtSavings.Text = $"Saved {savings:0}%";
            }

            panelCompressorRunning.Visibility = Visibility.Collapsed;
            panelCompressorSuccess.Visibility = Visibility.Visible;
        }
        catch (Exception ex)
        {
            MessageBox.Show($"Compression failed: {ex.Message}", "Compression Error", MessageBoxButton.OK, MessageBoxImage.Error);
            panelCompressorRunning.Visibility = Visibility.Collapsed;
            panelCompressorIdle.Visibility = Visibility.Visible;
        }
        finally
        {
            btnStartCompression.IsEnabled = true;
        }
    }

    private string FormatSize(long bytes)
    {
        if (bytes == 0) return "0 B";
        string[] sizes = { "B", "KB", "MB", "GB" };
        int order = 0;
        double len = bytes;
        while (len >= 1024 && order < sizes.Length - 1)
        {
            order++;
            len /= 1024;
        }
        return $"{len:0.##} {sizes[order]}";
    }

    private void BtnQualityPreset_Click(object sender, RoutedEventArgs e)
    {
        try
        {
            var btn = sender as Button;
            if (btn?.Tag is string valStr && double.TryParse(valStr, out double val))
            {
                sliderQuality.Value = val;
            }
        }
        catch (Exception ex)
        {
            MessageBox.Show($"Error setting quality preset: {ex.Message}");
        }
    }

    private void BtnStartCompression_Click(object sender, RoutedEventArgs e)
    {
        try
        {
            _ = CompressAndUploadFileAsync();
        }
        catch (Exception ex)
        {
            MessageBox.Show($"Error during compression: {ex.Message}");
        }
    }

    private void BtnCompressAnother_Click(object sender, RoutedEventArgs e)
    {
        panelCompressorSuccess.Visibility = Visibility.Collapsed;
        panelCompressorRunning.Visibility = Visibility.Collapsed;
        panelCompressorIdle.Visibility = Visibility.Visible;
    }

    private void BtnRefreshStorageFiles_Click(object sender, RoutedEventArgs e)
    {
        try
        {
            _ = LoadStorageFilesAsync();
        }
        catch (Exception ex)
        {
            MessageBox.Show($"Refresh failed: {ex.Message}");
        }
    }

    // --- OTHER WEBVIEW & HELPER LOGIC ---

    private async Task<CoreWebView2Environment> CreateSharedWebViewEnvironmentAsync()
    {
        var userDataFolder = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "OxygenLowsSoftware",
            "WebView2");
        Directory.CreateDirectory(userDataFolder);
        return await CoreWebView2Environment.CreateAsync(null, userDataFolder);
    }

    private async Task InitializeWebViewAsync(WebView2 webView)
    {
        await webView.EnsureCoreWebView2Async(_webViewEnvironment);
        webView.CoreWebView2.NavigationStarting += (_, e) => WebView_NavigationStarting(webView, e);
    }

    private void WebView_NavigationStarting(WebView2 sourceWebView, CoreWebView2NavigationStartingEventArgs e)
    {
        if (!IsGoogleOAuthRequest(e.Uri)) return;

        e.Cancel = true;
        _ = ContinueGoogleSignInInBrowserAsync(sourceWebView, new Uri(e.Uri));
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

    private async Task ContinueGoogleSignInInBrowserAsync(WebView2 sourceWebView, Uri authorizationUri)
    {
        _oauthCancellation?.Cancel();
        _oauthCancellation?.Dispose();
        _oauthCancellation = new CancellationTokenSource();
        var cancellationToken = _oauthCancellation.Token;

        try
        {
            var returnUrl = GetQueryParameter(authorizationUri, "redirect_to");
            if (!Uri.TryCreate(returnUrl, UriKind.Absolute, out var callbackReturnUri) ||
                !IsAllowedReturnUri(callbackReturnUri))
            {
                throw new InvalidOperationException("Google sign in returned an untrusted application redirect URL.");
            }

            using var listener = new HttpListener();
            listener.Prefixes.Add(OAuthCallbackUrl);
            listener.Start();

            var browserUri = ReplaceQueryParameter(authorizationUri, "redirect_to", OAuthCallbackUrl);

            // Strict URL validation to prevent potential Process.Start OS command or process injection exploits
            if (!string.Equals(browserUri.Scheme, Uri.UriSchemeHttps, StringComparison.OrdinalIgnoreCase))
            {
                throw new InvalidOperationException("Invalid OAuth URL scheme. Only HTTPS is allowed.");
            }

            if (!AllowedOAuthHosts.Contains(browserUri.Host))
            {
                throw new InvalidOperationException("Untrusted host for OAuth redirection.");
            }

            if (!browserUri.AbsolutePath.StartsWith("/auth/v1/", StringComparison.OrdinalIgnoreCase))
            {
                throw new InvalidOperationException("Invalid OAuth path.");
            }

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
                sourceWebView.CoreWebView2.Navigate(AddQueryParameter(callbackReturnUri, "code", code).AbsoluteUri));
        }
        catch (HttpListenerException) when (cancellationToken.IsCancellationRequested)
        {
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
        {
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

    private bool IsAllowedReturnUri(Uri returnUri)
    {
        var targetUri = new Uri(_targetUrl);
        return string.Equals(returnUri.Scheme, targetUri.Scheme, StringComparison.OrdinalIgnoreCase) &&
               string.Equals(returnUri.Host, targetUri.Host, StringComparison.OrdinalIgnoreCase) &&
               returnUri.Port == targetUri.Port;
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

// --- VIEW MODEL AND DTO CLASSES ---

public class CategoryDescriptor
{
    public string Name { get; set; } = "";
    public string Label { get; set; } = "";
}

public class AppDescriptor
{
    public string Id { get; set; } = "";
    public string DisplayName { get; set; } = "";
    public string Description { get; set; } = "";
    public string Category { get; set; } = "";
    public Action LaunchAction { get; set; } = () => { };
}

public class ChatItem : INotifyPropertyChanged
{
    private string _title = "";
    public string id { get; set; } = "";
    public string title { get; set; } = "";
    public string style { get; set; } = "GeneralAssistant";
    public string? llm_character_id { get; set; }
    public string? user_character_id { get; set; }
    public bool is_encrypted { get; set; }
    public string updated_at { get; set; } = "";

    public string Title
    {
        get => _title;
        set { _title = value; OnPropertyChanged(); }
    }

    public event PropertyChangedEventHandler? PropertyChanged;
    protected void OnPropertyChanged([CallerMemberName] string? name = null)
    {
        PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(name));
    }
}

public class ChatMessageItem
{
    public string id { get; set; } = "";
    public string chat_id { get; set; } = "";
    public string role { get; set; } = "";
    public string content { get; set; } = "";
    public bool is_encrypted { get; set; }
    public string created_at { get; set; } = "";
}

public class CharacterItem
{
    public string id { get; set; } = "";
    public string name { get; set; } = "";
    public string? display_name { get; set; }
    public bool is_encrypted { get; set; }
    public string DisplayName => !string.IsNullOrEmpty(display_name) ? display_name : name;
}

public class StyleItem
{
    public string id { get; set; } = "";
    public string title { get; set; } = "";
    public string description { get; set; } = "";
}

public class ModelItem
{
    public string provider { get; set; } = "";
    public string model_id { get; set; } = "";
    public string DisplayName => $"[{provider}] {model_id}";
}

public class StorageFileItem
{
    public string name { get; set; } = "";
    public string id { get; set; } = "";
    public StorageMetadata? metadata { get; set; }
}

public class StorageMetadata
{
    public long size { get; set; }
    public string mimetype { get; set; } = "";
}

public class MessageViewModel : INotifyPropertyChanged
{
    private string _roleHeader = "";
    private string _content = "";
    private HorizontalAlignment _alignment;
    private System.Windows.Media.Brush _backgroundBrush = System.Windows.Media.Brushes.Transparent;
    private System.Windows.Media.Brush _borderBrush = System.Windows.Media.Brushes.Transparent;

    public string RoleHeader
    {
        get => _roleHeader;
        set { _roleHeader = value; OnPropertyChanged(); }
    }

    public string Content
    {
        get => _content;
        set { _content = value; OnPropertyChanged(); }
    }

    public HorizontalAlignment Alignment
    {
        get => _alignment;
        set { _alignment = value; OnPropertyChanged(); }
    }

    public System.Windows.Media.Brush BackgroundBrush
    {
        get => _backgroundBrush;
        set { _backgroundBrush = value; OnPropertyChanged(); }
    }

    public System.Windows.Media.Brush BorderBrush
    {
        get => _borderBrush;
        set { _borderBrush = value; OnPropertyChanged(); }
    }

    public event PropertyChangedEventHandler? PropertyChanged;

    protected void OnPropertyChanged([CallerMemberName] string? name = null)
    {
        PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(name));
    }
}
