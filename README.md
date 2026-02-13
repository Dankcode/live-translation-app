# Scribe Center 🎙️✨

Scribe Center is a powerful, real-time speech-to-text and translation application designed for seamless presentations. It provides a transparent, always-on-top overlay for subtitles, making it perfect for PowerPoint, Keynote, or live video streaming.

## ✨ Features

- **Live Subtitle Overlay**: Fully transparent window that stays on top of full-screen applications.
- **Multi-Engine STT**: Support for Web Speech API (Free), Google Cloud STT, Gemini Multimodal, and Native macOS Dictation.
- **Real-Time Translation**: Powered by Google Translate and AI refinement via Gemini.
- **LAN History Sharing**: Scan a QR code to read the live transcript on your phone or tablet.
- **History Log**: Instant access to previous transcriptions with host-synchronized timestamps.

## 🚀 Getting Started

### Installation

#### 📦 Download the Setup Installer
To get the latest version for your computer:
1. Go to the [Releases](https://github.com/YOUR_USERNAME/YOUR_REPO/releases) page.
2. Download the **Setup Installer** for your platform:
   - **Windows**: `Scribe.Center.Setup.x.x.x.exe` (Runs the NSIS setup wizard).
   - **macOS**: `Scribe.Center-x.x.x-arm64.dmg` (Standard disk image).

#### 🛠️ Publishing a New Release (Standard Procedure)
This project follows the standard industry procedure for GitHub releases to keep the repository size small:
1. **Push Source Code**: Push your code changes to GitHub (large folders like `dist/` and `node_modules/` are automatically excluded via `.gitignore`).
2. **Pack the App**: Run `npm run electron:build` locally on your computer.
3. **Create Release**: On GitHub, go to **Releases** -> **Draft a new release**.
4. **Upload Assets**: Drag and drop the generated `.exe` or `.dmg` from your local `dist` folder into the "Attach binaries" section. GitHub allows files up to 2GB here!
5. **Publish**: Click **Publish release**.

### Usage

1. **Launch the App**: Open Scribe Center on your host computer.
2. **Start Transcription**: Select your source and target languages, then click **Start Translation**.
3. **Toggle Overlay**: Click the **Overlay** button to show the transparent subtitles. You can drag and resize the overlay as needed.
4. **Satellite Mode (Optional)**: If using the "Satellite" engine, click **Launch Now** to open the microphone controller in your browser.

## 🛠️ Development

If you want to build Scribe Center from source:

```bash
# Install dependencies
npm install

# Run in development mode
npm run dev:hybrid

# Build for production
npm run electron:build
```

## 📄 License

MIT