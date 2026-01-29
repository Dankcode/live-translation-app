# macOS Native Speech Host Setup

To enable real Apple Native Speech-to-Text in Electron, follow these steps to create a helper app.

## 1. Create the Xcode Project
1. Open **Xcode**.
2. Select **File > New > Project...**
3. Select **macOS > App**.
4. Product Name: `SpeechHost`.
5. Interface: **SwiftUI** (or Storyboard, doesn't matter much).
6. Language: **Swift**.
7. Save the project inside your repository at: `src/native/SpeechHost`.

## 2. Configure Capabilities (Permissions)
1. In Xcode, select the **SpeechHost** project in the sidebar.
2. Go to **Signing & Capabilities**.
3. Click **+ Capability** and add:
    - **App Sandbox** (optional, but if enabled, ensure "Audio Input" is checked).
    - **Hardened Runtime** (Ensure "Audio Input" is checked).
4. Go to **Info** tab. Add the following keys:
    - `Privacy - Microphone Usage Description`: "Required for speech-to-text translation."
    - `Privacy - Speech Recognition Usage Description`: "Required to transcribe your speech natively."

## 3. Implementation Code
Replace the contents of `ContentView.swift` (or `AppDelegate.swift`) with the following logic. For a clean CLI-like behavior in a GUI app, you can put this in your `App` struct or a `Window` initializer.

```swift
import SwiftUI
import Speech
import AVFoundation

class SpeechManager: NSObject, ObservableObject {
    private var speechRecognizer: SFSpeechRecognizer?
    private var recognitionRequest: SFSpeechAudioBufferRecognitionRequest?
    private var recognitionTask: SFSpeechRecognitionTask?
    private let audioEngine = AVAudioEngine()
    
    func start(locale: String) {
        self.speechRecognizer = SFSpeechRecognizer(locale: Locale(identifier: locale))
        
        SFSpeechRecognizer.requestAuthorization { status in
            DispatchQueue.main.async {
                if status == .authorized {
                    self.startRecording()
                } else {
                    self.sendError("Speech recognition not authorized. Please enable it in System Settings.")
                }
            }
        }
    }
    
    private func startRecording() {
        let inputNode = audioEngine.inputNode
        recognitionRequest = SFSpeechAudioBufferRecognitionRequest()
        guard let recognitionRequest = recognitionRequest else { return }
        recognitionRequest.shouldReportPartialResults = true
        
        recognitionTask = speechRecognizer?.recognitionTask(with: recognitionRequest) { result, error in
            if let result = result {
                self.sendResult(result.bestTranscription.formattedString, isFinal: result.isFinal)
            }
            if error != nil {
                self.stop()
            }
        }
        
        let recordingFormat = inputNode.outputFormat(forBus: 0)
        inputNode.installTap(onBus: 0, bufferSize: 1024, format: recordingFormat) { buffer, _ in
            self.recognitionRequest?.append(buffer)
        }
        
        audioEngine.prepare()
        try? audioEngine.start()
        print("Diagnostic: Speech Host Started")
    }
    
    func stop() {
        audioEngine.stop()
        audioEngine.inputNode.removeTap(onBus: 0)
        recognitionRequest?.endAudio()
    }
    
    private func sendResult(_ transcript: String, isFinal: Bool) {
        let json: [String: Any] = ["transcript": transcript, "isFinal": isFinal]
        if let data = try? JSONSerialization.data(withJSONObject: json),
           let string = String(data: data, encoding: .utf8) {
            print(string)
            fflush(stdout)
        }
    }
    
    private func sendError(_ message: String) {
        let json: [String: Any] = ["error": message]
        if let data = try? JSONSerialization.data(withJSONObject: json),
           let string = String(data: data, encoding: .utf8) {
            print(string)
            fflush(stdout)
        }
    }
}

@main
struct SpeechHostApp: App {
    let manager = SpeechManager()
    
    init() {
        // Read locale from arguments if present
        let args = CommandLine.arguments
        let locale = args.count > 1 ? args[1] : "zh-CN"
        manager.start(locale: locale)
    }
    
    var body: some Scene {
        WindowGroup {
            VStack {
                Text("Scribe Center Speech Host")
                    .font(.headline)
                Text("This window can be minimized.")
                    .font(.subheadline)
            }
            .frame(width: 300, height: 200)
        }
    }
}
```

## 4. Build and Export
1. In Xcode, ensure you have a "Development Team" selected in **Signing & Capabilities**.
2. Click the Play button or **Cmd + B** to build.
3. In the Xcode sidebar, find the **Products** folder.
4. Right-click `SpeechHost.app` and select **Show in Finder**.
5. Create a `bin` folder in your project root (same level as `package.json`).
6. Copy `SpeechHost.app` into that `bin` folder.
7. Restart your Electron app.
