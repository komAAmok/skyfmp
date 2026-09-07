// SkyMP dedicated server launcher (Windows).
//
// Makes the packaged server self-contained: it sets the working directory to
// the folder this executable lives in and runs the bundled node.exe on
// dist_back/skymp5-server.js, so players never have to install Node.js or go
// near a console. The bundled node.exe must sit next to this executable.
//
// Build with the .NET Framework csc.exe that ships with Windows:
//
//   "%WINDIR%\Microsoft.NET\Framework64\v4.0.30319\csc.exe" /nologo /optimize+ /out:skymp-server.exe Launcher.cs
//
// (release.yml does this on Windows CI runners.)
using System;
using System.Diagnostics;
using System.IO;

class Launcher
{
    static int Main()
    {
        string exeDir = Path.GetDirectoryName(Process.GetCurrentProcess().MainModule.FileName);
        string nodePath = Path.Combine(exeDir, "node.exe");
        string serverJs = Path.Combine(exeDir, "dist_back", "skymp5-server.js");

        try
        {
            Console.Title = "SkyMP Server";
        }
        catch
        {
            // No console attached (e.g. launched from a service); log only.
        }

        if (!File.Exists(nodePath))
        {
            Console.Error.WriteLine("[ERROR] node.exe is missing next to skymp-server.exe.");
            Console.Error.WriteLine("        Re-extract the server archive fully.");
            Pause();
            return 1;
        }

        if (!File.Exists(serverJs))
        {
            Console.Error.WriteLine("[ERROR] dist_back\\skymp5-server.js is missing next to skymp-server.exe.");
            Console.Error.WriteLine("        Re-extract the server archive fully.");
            Pause();
            return 1;
        }

        try
        {
            ProcessStartInfo psi = new ProcessStartInfo(
                nodePath,
                "\"dist_back\\skymp5-server.js\"");
            psi.WorkingDirectory = exeDir;
            psi.UseShellExecute = false;
            Console.WriteLine("Starting SkyMP server...");
            Console.WriteLine("Players connect with the address <this machine's IP>:7777 (F2 in game).");
            Console.WriteLine();
            Process server = Process.Start(psi);
            server.WaitForExit();
            int exitCode = server.ExitCode;
            Console.WriteLine();
            Console.WriteLine("Server stopped with exit code " + exitCode + ".");
            Pause();
            return exitCode;
        }
        catch (Exception e)
        {
            Console.Error.WriteLine("[ERROR] Failed to start the server: " + e.Message);
            Pause();
            return 1;
        }
    }

    static void Pause()
    {
        Console.WriteLine();
        Console.WriteLine("Press any key to exit...");
        try { Console.ReadKey(true); }
        catch { }
    }
}