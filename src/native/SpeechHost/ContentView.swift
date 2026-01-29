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