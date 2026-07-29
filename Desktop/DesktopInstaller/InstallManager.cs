using System;
using System.IO;
using System.IO.Compression;
using System.Reflection;
using Microsoft.Win32;
using System.Diagnostics;
using System.Net.Http;
using System.Threading.Tasks;

namespace DesktopInstaller
{
    public class InstallManager
    {
        private const string AppName = "Oxygen Low's Software";
        private const string RegKeyPath = @"Software\OxygenLowsSoftware";
        
        public bool IsInstalled()
        {
            using var key = Registry.CurrentUser.OpenSubKey(RegKeyPath);
            return key != null && key.GetValue("InstallPath") != null;
        }
        
        public string GetInstallPath()
        {
            using var key = Registry.CurrentUser.OpenSubKey(RegKeyPath);
            return key?.GetValue("InstallPath")?.ToString() ?? Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "OxygenLowsSoftware");
        }

        public void Install(string targetPath)
        {
            ExtractApp(targetPath);
            InstallDependenciesAsync(targetPath).Wait();
            CreateRegistryKeys(targetPath);
            CreateShortcuts(targetPath);
        }

        public void Update()
        {
            var path = GetInstallPath();
            ExtractApp(path);
            InstallDependenciesAsync(path).Wait();
        }

        public void Repair()
        {
            var path = GetInstallPath();
            ExtractApp(path);
        }

        public void Reinstall()
        {
            var path = GetInstallPath();
            // Delete AppData
            var appDataPath = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "OxygenLowsSoftware");
            if (Directory.Exists(appDataPath))
            {
                Directory.Delete(appDataPath, true);
            }
            ExtractApp(path);
        }

        public void Uninstall()
        {
            var path = GetInstallPath();
            
            // Remove files
            if (Directory.Exists(path))
            {
                Directory.Delete(path, true);
            }
            
            // Remove Registry Keys
            Registry.CurrentUser.DeleteSubKeyTree(RegKeyPath, false);
            
            // Remove Shortcuts
            var programsPath = Environment.GetFolderPath(Environment.SpecialFolder.Programs);
            var shortcutPath = Path.Combine(programsPath, $"{AppName}.lnk");
            if (File.Exists(shortcutPath)) File.Delete(shortcutPath);
        }

        private void ExtractApp(string targetPath)
        {
            if (!Directory.Exists(targetPath))
            {
                Directory.CreateDirectory(targetPath);
            }
            
            var resourceName = "DesktopInstaller.app.zip";
            using var stream = Assembly.GetExecutingAssembly().GetManifestResourceStream(resourceName);
            if (stream == null) throw new Exception("App package not found in installer.");
            
            var tempZip = Path.Combine(Path.GetTempPath(), "app.zip");
            using (var fileStream = new FileStream(tempZip, FileMode.Create))
            {
                stream.CopyTo(fileStream);
            }
            
            // Kill existing processes before extracting
            foreach (var process in Process.GetProcessesByName("DesktopApp"))
            {
                try { process.Kill(); process.WaitForExit(); } catch { }
            }

            ZipFile.ExtractToDirectory(tempZip, targetPath, true);
            File.Delete(tempZip);
        }

        private async Task InstallDependenciesAsync(string targetPath)
        {
            // Clone repo
            var repoPath = Path.Combine(targetPath, "repo");
            if (!Directory.Exists(repoPath))
            {
                var psi = new ProcessStartInfo("git", $"clone https://github.com/Oxygen-Low/Oxygen-Lows-Software.git \"{repoPath}\"")
                {
                    UseShellExecute = false,
                    CreateNoWindow = true
                };
                Process.Start(psi)?.WaitForExit();
            }
            else
            {
                var psi = new ProcessStartInfo("git", "pull")
                {
                    WorkingDirectory = repoPath,
                    UseShellExecute = false,
                    CreateNoWindow = true
                };
                Process.Start(psi)?.WaitForExit();
            }

            // Download Node.js
            var nodeDir = Path.Combine(targetPath, "node");
            var nodeExtractedDir = Path.Combine(nodeDir, "node-v20.15.0-win-x64");
            if (!Directory.Exists(nodeDir))
            {
                Directory.CreateDirectory(nodeDir);
                var nodeZip = Path.Combine(Path.GetTempPath(), "node.zip");
                using (var client = new HttpClient())
                {
                    var response = await client.GetAsync("https://nodejs.org/dist/v20.15.0/node-v20.15.0-win-x64.zip");
                    using (var fs = new FileStream(nodeZip, FileMode.Create))
                    {
                        await response.Content.CopyToAsync(fs);
                    }
                }
                ZipFile.ExtractToDirectory(nodeZip, nodeDir, true);
                File.Delete(nodeZip);
            }
            
            // Run npm install
            var npmPath = Path.Combine(nodeExtractedDir, "npm.cmd");
            var installPsi = new ProcessStartInfo(npmPath, "install")
            {
                WorkingDirectory = repoPath,
                UseShellExecute = false,
                CreateNoWindow = true
            };
            Process.Start(installPsi)?.WaitForExit();

            // Run build
            var buildPsi = new ProcessStartInfo(npmPath, "run build")
            {
                WorkingDirectory = repoPath,
                UseShellExecute = false,
                CreateNoWindow = true
            };
            Process.Start(buildPsi)?.WaitForExit();
        }

        private void CreateRegistryKeys(string targetPath)
        {
            using var key = Registry.CurrentUser.CreateSubKey(RegKeyPath);
            key.SetValue("InstallPath", targetPath);

            string versionStr = "1.0.0";
            try
            {
                var version = Assembly.GetExecutingAssembly().GetName().Version;
                if (version != null)
                {
                    versionStr = $"{version.Major}.{version.Minor}.{version.Build}";
                }
            }
            catch
            {
            }
            key.SetValue("Version", versionStr);
        }
        
        private void CreateShortcuts(string targetPath)
        {
            var scriptPath = Path.Combine(Path.GetTempPath(), "CreateShortcut.vbs");
            var programsPath = Environment.GetFolderPath(Environment.SpecialFolder.Programs);
            var shortcutPath = Path.Combine(programsPath, $"{AppName}.lnk");
            var targetExe = Path.Combine(targetPath, "DesktopApp.exe");
            
            var script = $@"
Set ws = CreateObject(""WScript.Shell"")
Set link = ws.CreateShortcut(""{shortcutPath}"")
link.TargetPath = ""{targetExe}""
link.Save()
";
            File.WriteAllText(scriptPath, script);
            Process.Start("cscript", $"//nologo \"{scriptPath}\"").WaitForExit();
            File.Delete(scriptPath);
        }
    }
}
