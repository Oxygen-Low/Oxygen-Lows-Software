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

    // Supabase Session State
    private string _accessToken = "";
    private string _userId = "";
    private string _masterKey = "";
    private bool _isEncryptionEnabled = false;

    // Chatbot and File Compressor Collections
    private ObservableCollection<ChatItem> _chats = new();
    private ObservableCollection<MessageViewModel> _messagesList = new();
    private List<ModelItem> _models = new();
    private List<StyleItem> _styles = new();
    private List<CharacterItem> _characters = new();
    private ChatItem? _activeChat = null;
    private string _selectedCategory = "All";

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

            if (appsTab.IsSelected)
            {
                await InitializeAppsTabAsync();
            }
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

    private async void TabMain_SelectionChanged(object sender, SelectionChangedEventArgs e)
    {
        if (e.Source != tabMain || !appsTab.IsSelected) return;
        await InitializeAppsTabAsync();
    }

    // --- SEAMLESS SUPABASE AUTHENTICATION SHARING ---

    private async Task<bool> RetrieveSessionAsync()
    {
        if (_webView?.CoreWebView2 == null) return false;

        try
        {
            string rawToken = await _webView.CoreWebView2.ExecuteScriptAsync("window.localStorage.getItem('sb-vqmukrmpgvavscsyefqd-auth-token')");
            if (string.IsNullOrEmpty(rawToken) || rawToken == "null") return false;

            string? tokenJson = JsonSerializer.Deserialize<string>(rawToken);
            if (string.IsNullOrEmpty(tokenJson)) return false;

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

            // Fetch Master Key from SessionStorage
            string rawKey = await _webView.CoreWebView2.ExecuteScriptAsync("window.sessionStorage.getItem('sb-vqmukrmpgvavscsyefqd-app-state-sync')");
            if (!string.IsNullOrEmpty(rawKey) && rawKey != "null")
            {
                _masterKey = JsonSerializer.Deserialize<string>(rawKey) ?? "";
            }

            return true;
        }
        catch (Exception ex)
        {
            Debug.WriteLine($"Error retrieving session: {ex.Message}");
            return false;
        }
    }

    private async Task FetchUserPreferencesAsync()
    {
        try
        {
            using var client = CreateSupabaseClient();
            var response = await client.GetAsync($"https://vqmukrmpgvavscsyefqd.supabase.co/rest/v1/user_preferences?user_id=eq.{_userId}&select=encryption_settings");
            if (response.IsSuccessStatusCode)
            {
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
            }
        }
        catch (Exception ex)
        {
            Debug.WriteLine($"Failed to fetch user preferences: {ex.Message}");
        }
    }

    private async Task InitializeAppsTabAsync()
    {
        bool loggedIn = await RetrieveSessionAsync();
        if (loggedIn)
        {
            panelAuthWarning.Visibility = Visibility.Collapsed;
            panelCatalog.Visibility = Visibility.Visible;
            panelChatbot.Visibility = Visibility.Collapsed;
            panelCompressor.Visibility = Visibility.Collapsed;

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

    private HttpClient CreateSupabaseClient()
    {
        var client = new HttpClient();
        client.DefaultRequestHeaders.Add("apikey", "sb_publishable_t2Nj_QmKvYBkmhQZvGkPAQ_a6YFGq4Q");
        if (!string.IsNullOrEmpty(_accessToken))
        {
            client.DefaultRequestHeaders.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", _accessToken);
        }
        return client;
    }

    // --- APP SELECTION CATALOG ---

    private void Category_Click(object sender, RoutedEventArgs e)
    {
        var btn = sender as Button;
        if (btn == null) return;

        _selectedCategory = btn.Tag as string ?? "All";
        txtCategoryHeader.Text = $"{_selectedCategory} Apps";

        if (_selectedCategory == "All")
        {
            cardChatbot.Visibility = Visibility.Visible;
            cardCompressor.Visibility = Visibility.Visible;
        }
        else if (_selectedCategory == "Utility")
        {
            cardChatbot.Visibility = Visibility.Collapsed;
            cardCompressor.Visibility = Visibility.Visible;
        }
        else if (_selectedCategory == "LLM/AI")
        {
            cardChatbot.Visibility = Visibility.Visible;
            cardCompressor.Visibility = Visibility.Collapsed;
        }
        else
        {
            cardChatbot.Visibility = Visibility.Collapsed;
            cardCompressor.Visibility = Visibility.Collapsed;
        }
    }

    private async void CardChatbot_Click(object sender, RoutedEventArgs e)
    {
        panelCatalog.Visibility = Visibility.Collapsed;
        panelChatbot.Visibility = Visibility.Visible;

        await LoadChatbotMetadataAsync();
        await LoadChatsAsync();
    }

    private async void CardCompressor_Click(object sender, RoutedEventArgs e)
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
        panelCatalog.Visibility = Visibility.Visible;
    }

    private async void BtnRetryAuth_Click(object sender, RoutedEventArgs e)
    {
        btnRetryAuth.IsEnabled = false;
        await InitializeAppsTabAsync();
        btnRetryAuth.IsEnabled = true;
    }

    // --- NATIVE CHATBOT IMPLEMENTATION ---

    private async Task LoadChatbotMetadataAsync()
    {
        try
        {
            using var client = CreateSupabaseClient();

            // Fetch configs
            var modelsTask = client.GetAsync("https://vqmukrmpgvavscsyefqd.supabase.co/rest/v1/user_models?select=provider,model_id&order=provider");
            var stylesTask = client.GetAsync($"{_targetUrl}/api/ai/styles");
            var charsTask = client.GetAsync("https://vqmukrmpgvavscsyefqd.supabase.co/rest/v1/characters?select=id,name,display_name,is_encrypted");
            var localModelsTask = client.GetAsync($"{_targetUrl}/api/ai/local-providers");

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

            // Parse Characters
            if (charsTask.Result.IsSuccessStatusCode)
            {
                string json = await charsTask.Result.Content.ReadAsStringAsync();
                var rawChars = JsonSerializer.Deserialize<List<CharacterItem>>(json) ?? new();
                _characters = rawChars;
                foreach (var c in _characters)
                {
                    if (c.is_encrypted && !string.IsNullOrEmpty(_masterKey))
                    {
                        c.name = CryptoHelper.Decrypt(c.name, _masterKey);
                        if (c.display_name != null) c.display_name = CryptoHelper.Decrypt(c.display_name, _masterKey);
                    }
                }

                var withNone = new List<CharacterItem> { new CharacterItem { id = "", name = "None" } };
                withNone.AddRange(_characters);

                cmbLlmCharacters.ItemsSource = withNone;
                cmbUserCharacters.ItemsSource = withNone;

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
            using var client = CreateSupabaseClient();
            var response = await client.GetAsync("https://vqmukrmpgvavscsyefqd.supabase.co/rest/v1/chats?select=*&order=updated_at.desc");
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
            MessageBox.Show($"Failed to load chats: {ex.Message}");
        }
    }

    private async Task LoadChatMessagesAsync(string chatId)
    {
        try
        {
            using var client = CreateSupabaseClient();
            var response = await client.GetAsync($"https://vqmukrmpgvavscsyefqd.supabase.co/rest/v1/chat_messages?chat_id=eq.{chatId}&order=created_at.asc");
            if (response.IsSuccessStatusCode)
            {
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
                        BackgroundBrush = isUser
                            ? (System.Windows.Media.Brush)new System.Windows.Media.BrushConverter().ConvertFromString("#0288D1")
                            : (System.Windows.Media.Brush)new System.Windows.Media.BrushConverter().ConvertFromString("#2D2D30"),
                        BorderBrush = isUser
                            ? (System.Windows.Media.Brush)new System.Windows.Media.BrushConverter().ConvertFromString("#039BE5")
                            : (System.Windows.Media.Brush)new System.Windows.Media.BrushConverter().ConvertFromString("#3E3E42")
                    });
                }

                itemsMessages.ItemsSource = _messagesList;
                scrollerMessages.ScrollToEnd();
            }
        }
        catch (Exception ex)
        {
            MessageBox.Show($"Failed to load messages: {ex.Message}");
        }
    }

    private async Task CreateNewChatAsync()
    {
        try
        {
            using var client = CreateSupabaseClient();
            string rawTitle = "New Chat (Desktop)";
            string encryptedTitle = _isEncryptionEnabled && !string.IsNullOrEmpty(_masterKey)
                ? CryptoHelper.Encrypt(rawTitle, _masterKey)
                : rawTitle;

            var payload = new
            {
                user_id = _userId,
                title = encryptedTitle,
                style = "GeneralAssistant",
                is_encrypted = _isEncryptionEnabled
            };

            var content = new StringContent(JsonSerializer.Serialize(payload), Encoding.UTF8, "application/json");
            var request = new HttpRequestMessage(HttpMethod.Post, "https://vqmukrmpgvavscsyefqd.supabase.co/rest/v1/chats")
            {
                Content = content
            };
            request.Headers.Add("Prefer", "return=representation");

            var response = await client.SendAsync(request);
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
        }
        catch (Exception ex)
        {
            MessageBox.Show($"Failed to create chat: {ex.Message}");
        }
    }

    private async Task DeleteChatAsync(string chatId)
    {
        try
        {
            using var client = CreateSupabaseClient();
            var response = await client.DeleteAsync($"https://vqmukrmpgvavscsyefqd.supabase.co/rest/v1/chats?id=eq.{chatId}");
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
            MessageBox.Show($"Failed to delete chat: {ex.Message}");
        }
    }

    private async Task SendMessageAsync()
    {
        string text = txtChatInput.Text.Trim();
        if (string.IsNullOrEmpty(text) || _activeChat == null) return;

        txtChatInput.Text = "";
        btnSendChat.IsEnabled = false;

        _messagesList.Add(new MessageViewModel
        {
            RoleHeader = "You",
            Content = text,
            Alignment = HorizontalAlignment.Right,
            BackgroundBrush = (System.Windows.Media.Brush)new System.Windows.Media.BrushConverter().ConvertFromString("#0288D1"),
            BorderBrush = (System.Windows.Media.Brush)new System.Windows.Media.BrushConverter().ConvertFromString("#039BE5")
        });
        scrollerMessages.ScrollToEnd();

        try
        {
            using var client = CreateSupabaseClient();

            // Save user message
            string encryptedUserText = _isEncryptionEnabled && !string.IsNullOrEmpty(_masterKey)
                ? CryptoHelper.Encrypt(text, _masterKey)
                : text;

            var msgPayload = new
            {
                chat_id = _activeChat.id,
                role = "user",
                content = encryptedUserText,
                is_encrypted = _isEncryptionEnabled
            };

            var msgContent = new StringContent(JsonSerializer.Serialize(msgPayload), Encoding.UTF8, "application/json");
            var msgResponse = await client.PostAsync("https://vqmukrmpgvavscsyefqd.supabase.co/rest/v1/chat_messages", msgContent);
            if (!msgResponse.IsSuccessStatusCode)
            {
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

            var proxyRequest = new HttpRequestMessage(HttpMethod.Post, $"{_targetUrl}/api/ai/proxy");
            proxyRequest.Headers.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", _accessToken);
            proxyRequest.Content = new StringContent(JsonSerializer.Serialize(proxyPayload), Encoding.UTF8, "application/json");

            var assistantMsg = new MessageViewModel
            {
                RoleHeader = "Assistant",
                Content = "...",
                Alignment = HorizontalAlignment.Left,
                BackgroundBrush = (System.Windows.Media.Brush)new System.Windows.Media.BrushConverter().ConvertFromString("#2D2D30"),
                BorderBrush = (System.Windows.Media.Brush)new System.Windows.Media.BrushConverter().ConvertFromString("#3E3E42")
            };
            _messagesList.Add(assistantMsg);
            scrollerMessages.ScrollToEnd();

            var proxyResponse = await client.SendAsync(proxyRequest, HttpCompletionOption.ResponseHeadersRead);
            if (!proxyResponse.IsSuccessStatusCode)
            {
                string errText = await proxyResponse.Content.ReadAsStringAsync();
                assistantMsg.Content = $"Error calling proxy: {errText}";
                return;
            }

            using var stream = await proxyResponse.Content.ReadAsStreamAsync();
            using var reader = new StreamReader(stream);

            StringBuilder fullResponse = new StringBuilder();
            assistantMsg.Content = "";

            while (!reader.EndOfStream)
            {
                string? line = await reader.ReadLineAsync();
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
                        scrollerMessages.ScrollToEnd();
                    }
                }
                catch
                {
                    // Ignore parsing error for intermediate chunks
                }
            }

            // Save assistant message
            string encryptedAssistantText = _isEncryptionEnabled && !string.IsNullOrEmpty(_masterKey)
                ? CryptoHelper.Encrypt(fullResponse.ToString(), _masterKey)
                : fullResponse.ToString();

            var assistantSavePayload = new
            {
                chat_id = _activeChat.id,
                role = "assistant",
                content = encryptedAssistantText,
                is_encrypted = _isEncryptionEnabled
            };

            var saveContent = new StringContent(JsonSerializer.Serialize(assistantSavePayload), Encoding.UTF8, "application/json");
            await client.PostAsync("https://vqmukrmpgvavscsyefqd.supabase.co/rest/v1/chat_messages", saveContent);

            // Update chat updated_at
            var updatePayload = new
            {
                updated_at = DateTime.UtcNow.ToString("o")
            };
            var updateContent = new StringContent(JsonSerializer.Serialize(updatePayload), Encoding.UTF8, "application/json");
            await client.SendAsync(new HttpRequestMessage(HttpMethod.Patch, $"https://vqmukrmpgvavscsyefqd.supabase.co/rest/v1/chats?id=eq.{_activeChat.id}")
            {
                Content = updateContent
            });
        }
        catch (Exception ex)
        {
            MessageBox.Show($"Error: {ex.Message}");
        }
        finally
        {
            btnSendChat.IsEnabled = true;
            txtChatInput.Focus();
        }
    }

    private async Task UpdateChatConfigurationAsync(object patchPayload)
    {
        if (_activeChat == null) return;
        try
        {
            using var client = CreateSupabaseClient();
            var content = new StringContent(JsonSerializer.Serialize(patchPayload), Encoding.UTF8, "application/json");
            var request = new HttpRequestMessage(HttpMethod.Patch, $"https://vqmukrmpgvavscsyefqd.supabase.co/rest/v1/chats?id=eq.{_activeChat.id}")
            {
                Content = content
            };
            await client.SendAsync(request);
        }
        catch (Exception ex)
        {
            Debug.WriteLine($"Failed to update chat config: {ex.Message}");
        }
    }

    private void LstChats_SelectionChanged(object sender, SelectionChangedEventArgs e)
    {
        _activeChat = lstChats.SelectedItem as ChatItem;
        if (_activeChat != null)
        {
            _ = LoadChatMessagesAsync(_activeChat.id);

            var s = _styles.FirstOrDefault(st => st.id == _activeChat.style);
            if (s != null) cmbStyles.SelectedItem = s;

            var llmChar = cmbLlmCharacters.Items.Cast<CharacterItem>().FirstOrDefault(c => c.id == _activeChat.llm_character_id);
            if (llmChar != null) cmbLlmCharacters.SelectedItem = llmChar;

            var userChar = cmbUserCharacters.Items.Cast<CharacterItem>().FirstOrDefault(c => c.id == _activeChat.user_character_id);
            if (userChar != null) cmbUserCharacters.SelectedItem = userChar;
        }
        else
        {
            _messagesList.Clear();
        }
    }

    private void BtnDeleteChat_Click(object sender, RoutedEventArgs e)
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

    private void BtnNewChat_Click(object sender, RoutedEventArgs e)
    {
        _ = CreateNewChatAsync();
    }

    private void TxtChatInput_KeyDown(object sender, KeyEventArgs e)
    {
        if (e.Key == Key.Enter)
        {
            _ = SendMessageAsync();
        }
    }

    private void BtnSendChat_Click(object sender, RoutedEventArgs e)
    {
        _ = SendMessageAsync();
    }

    private void CmbModels_SelectionChanged(object sender, SelectionChangedEventArgs e) { }

    private async void CmbStyles_SelectionChanged(object sender, SelectionChangedEventArgs e)
    {
        var item = cmbStyles.SelectedItem as StyleItem;
        if (item != null && _activeChat != null && _activeChat.style != item.id)
        {
            _activeChat.style = item.id;
            await UpdateChatConfigurationAsync(new { style = item.id });
        }
    }

    private async void CmbLlmCharacters_SelectionChanged(object sender, SelectionChangedEventArgs e)
    {
        var item = cmbLlmCharacters.SelectedItem as CharacterItem;
        if (item != null && _activeChat != null && _activeChat.llm_character_id != item.id)
        {
            _activeChat.llm_character_id = string.IsNullOrEmpty(item.id) ? null : item.id;
            await UpdateChatConfigurationAsync(new { llm_character_id = _activeChat.llm_character_id });
        }
    }

    private async void CmbUserCharacters_SelectionChanged(object sender, SelectionChangedEventArgs e)
    {
        var item = cmbUserCharacters.SelectedItem as CharacterItem;
        if (item != null && _activeChat != null && _activeChat.user_character_id != item.id)
        {
            _activeChat.user_character_id = string.IsNullOrEmpty(item.id) ? null : item.id;
            await UpdateChatConfigurationAsync(new { user_character_id = _activeChat.user_character_id });
        }
    }

    // --- NATIVE FILE COMPRESSOR IMPLEMENTATION ---

    private async Task LoadStorageFilesAsync()
    {
        try
        {
            using var client = CreateSupabaseClient();
            var payload = new
            {
                prefix = "",
                limit = 100,
                sortBy = new { column = "name", order = "asc" }
            };

            var content = new StringContent(JsonSerializer.Serialize(payload), Encoding.UTF8, "application/json");
            var response = await client.PostAsync("https://vqmukrmpgvavscsyefqd.supabase.co/storage/v1/object/list/Storage", content);
            if (response.IsSuccessStatusCode)
            {
                string json = await response.Content.ReadAsStringAsync();
                var files = JsonSerializer.Deserialize<List<StorageFileItem>>(json) ?? new();
                var imageFiles = files.Where(f => f.metadata?.mimetype?.StartsWith("image/") == true).ToList();

                cmbStorageFiles.ItemsSource = imageFiles;
                if (imageFiles.Count > 0)
                {
                    cmbStorageFiles.SelectedIndex = 0;
                }
            }
        }
        catch (Exception ex)
        {
            MessageBox.Show($"Failed to load storage files: {ex.Message}");
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

        panelCompressorIdle.Visibility = Visibility.Collapsed;
        panelCompressorSuccess.Visibility = Visibility.Collapsed;
        panelCompressorRunning.Visibility = Visibility.Visible;
        btnStartCompression.IsEnabled = false;

        try
        {
            using var client = CreateSupabaseClient();

            // 1. Download
            txtCompressorStatus.Text = "Downloading file...";
            var downloadResponse = await client.GetAsync($"https://vqmukrmpgvavscsyefqd.supabase.co/storage/v1/object/Storage/{Uri.EscapeDataString(selectedFile.name)}");
            if (!downloadResponse.IsSuccessStatusCode)
            {
                throw new Exception($"Download failed: {await downloadResponse.Content.ReadAsStringAsync()}");
            }

            byte[] originalBytes = await downloadResponse.Content.ReadAsByteArrayAsync();

            // 2. Compress locally
            txtCompressorStatus.Text = "Compressing image locally...";
            byte[] compressedBytes;
            using (var inStream = new MemoryStream(originalBytes))
            {
                var decoder = BitmapDecoder.Create(inStream, BitmapCreateOptions.None, BitmapCacheOption.OnLoad);
                var frame = decoder.Frames[0];

                using (var outStream = new MemoryStream())
                {
                    var encoder = new JpegBitmapEncoder();
                    encoder.QualityLevel = (int)quality;
                    encoder.Frames.Add(BitmapFrame.Create(frame));
                    encoder.Save(outStream);
                    compressedBytes = outStream.ToArray();
                }
            }

            // 3. Upload
            txtCompressorStatus.Text = "Uploading compressed file...";
            string ext = Path.GetExtension(selectedFile.name);
            string baseName = Path.GetFileNameWithoutExtension(selectedFile.name);
            string newFileName = $"{baseName}_compressed{ext}";

            var uploadContent = new ByteArrayContent(compressedBytes);
            uploadContent.Headers.ContentType = new System.Net.Http.Headers.MediaTypeHeaderValue("image/jpeg");

            var uploadRequest = new HttpRequestMessage(HttpMethod.Post, $"https://vqmukrmpgvavscsyefqd.supabase.co/storage/v1/object/Storage/{Uri.EscapeDataString(newFileName)}")
            {
                Content = uploadContent
            };
            uploadRequest.Headers.Add("x-upsert", "true");

            var uploadResponse = await client.SendAsync(uploadRequest);
            if (!uploadResponse.IsSuccessStatusCode)
            {
                throw new Exception($"Upload failed: {await uploadResponse.Content.ReadAsStringAsync()}");
            }

            txtOrigSize.Text = FormatSize(originalBytes.Length);
            txtNewSize.Text = FormatSize(compressedBytes.Length);
            double savings = (1.0 - (double)compressedBytes.Length / originalBytes.Length) * 100.0;
            txtSavings.Text = $"Saved {savings:0}%";

            panelCompressorRunning.Visibility = Visibility.Collapsed;
            panelCompressorSuccess.Visibility = Visibility.Visible;
        }
        catch (Exception ex)
        {
            MessageBox.Show($"Compression failed: {ex.Message}");
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
        var btn = sender as Button;
        if (btn?.Tag is string valStr && double.TryParse(valStr, out double val))
        {
            sliderQuality.Value = val;
        }
    }

    private void BtnStartCompression_Click(object sender, RoutedEventArgs e)
    {
        _ = CompressAndUploadFileAsync();
    }

    private void BtnCompressAnother_Click(object sender, RoutedEventArgs e)
    {
        panelCompressorSuccess.Visibility = Visibility.Collapsed;
        panelCompressorRunning.Visibility = Visibility.Collapsed;
        panelCompressorIdle.Visibility = Visibility.Visible;
    }

    private void BtnRefreshStorageFiles_Click(object sender, RoutedEventArgs e)
    {
        _ = LoadStorageFilesAsync();
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

public class ChatItem
{
    public string id { get; set; } = "";
    public string title { get; set; } = "";
    public string style { get; set; } = "GeneralAssistant";
    public string? llm_character_id { get; set; }
    public string? user_character_id { get; set; }
    public bool is_encrypted { get; set; }
    public string updated_at { get; set; } = "";

    public string Title { get; set; } = "";
    public string Id => id;
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
