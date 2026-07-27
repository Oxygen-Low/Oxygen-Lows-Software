using System;
using System.ComponentModel;
using System.Runtime.CompilerServices;
using System.Windows.Media;

namespace DesktopApp;

public class VPNServerItem : INotifyPropertyChanged
{
    private string _status = "offline"; // "offline", "loading", "connected"
    private string _ip = "Pending...";
    private string _latencyText = "999 ms";

    public string Id { get; set; } = "";
    public string Name { get; set; } = "";
    public string BaseUrl { get; set; } = "";
    public double Latitude { get; set; }
    public double Longitude { get; set; }

    public string Status
    {
        get => _status;
        set
        {
            _status = value;
            OnPropertyChanged();
            OnPropertyChanged(nameof(StatusColor));
        }
    }

    public string IP
    {
        get => _ip;
        set { _ip = value; OnPropertyChanged(); OnPropertyChanged(nameof(DisplayIP)); }
    }

    public string DisplayIP => $"IP: {IP}";

    public string LatencyText
    {
        get => _latencyText;
        set { _latencyText = value; OnPropertyChanged(); }
    }

    public Brush StatusColor => Status switch
    {
        "connected" => Brushes.LimeGreen,
        "loading" => Brushes.Orange,
        _ => Brushes.Red
    };

    public event PropertyChangedEventHandler? PropertyChanged;
    protected void OnPropertyChanged([CallerMemberName] string? name = null)
    {
        PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(name));
    }
}
