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

#### macOS
1. Download the latest `Scribe.Center-x.x.x.dmg` from the [Releases](https://github.com/YOUR_USERNAME/YOUR_REPO/releases) page.
2. Drag Scribe Center to your Applications folder.
3. **Note**: If you see a "developer cannot be verified" warning, right-click the app and select **Open**.

#### Windows
1. Download `Scribe.Center.Setup.x.x.x.exe` from the [Releases](https://github.com/YOUR_USERNAME/YOUR_REPO/releases) page.
2. Run the installer and follow the prompts.

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