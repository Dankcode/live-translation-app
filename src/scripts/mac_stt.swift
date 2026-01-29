import Foundation
import Speech
import AVFoundation

class SpeechManager: NSObject, SFSpeechRecognizerDelegate {
    private var speechRecognizer: SFSpeechRecognizer?
    private var recognitionRequest: SFSpeechAudioBufferRecognitionRequest?
    private var recognitionTask: SFSpeechRecognitionTask?
    private let audioEngine = AVAudioEngine()
    
    init(localeIdentifier: String) {
        print("Diagnostic: Initializing SpeechManager with \(localeIdentifier)")
        self.speechRecognizer = SFSpeechRecognizer(locale: Locale(identifier: localeIdentifier))
        super.init()
    }
    
    func start() {
        print("Diagnostic: Requesting authorization")
        SFSpeechRecognizer.requestAuthorization { status in
            print("Diagnostic: Authorization status received: \(status.rawValue)")
            switch status {
            case .authorized: 
                print("Diagnostic: Authorized, starting recording")
                self.startRecording()
            case .notDetermined:
                print("Diagnostic: Authorization is not determined, waiting for prompt...")
                // Don't exit, wait for the user to interact with the system prompt
            case .denied, .restricted:
                self.sendError("Speech recognition authorization denied or restricted (status: \(status.rawValue))")
                exit(1)
            @unknown default:
                self.sendError("Unknown authorization status")
                exit(1)
            }
        }
    }
    
    private func startRecording() {
        print("Diagnostic: Starting recording")
        if recognitionTask != nil {
            recognitionTask?.cancel()
            recognitionTask = nil
        }
        
        // AVAudioSession is not needed/available on macOS
        // The inputNode will handle audio capture directly
        
        recognitionRequest = SFSpeechAudioBufferRecognitionRequest()
        let inputNode = audioEngine.inputNode
        guard let recognitionRequest = recognitionRequest else {
            sendError("Unable to create recognition request")
            exit(1)
        }
        
        recognitionRequest.shouldReportPartialResults = true
        
        print("Diagnostic: Starting recognition task")
        recognitionTask = speechRecognizer?.recognitionTask(with: recognitionRequest) { result, error in
            if let result = result {
                self.sendResult(result.bestTranscription.formattedString, isFinal: result.isFinal)
            }
            if let error = error {
                self.sendError("Recognition task error: \(error.localizedDescription)")
                self.stop()
            }
        }
        
        let recordingFormat = inputNode.outputFormat(forBus: 0)
        print("Diagnostic: Recording format: \(recordingFormat)")
        inputNode.installTap(onBus: 0, bufferSize: 1024, format: recordingFormat) { buffer, _ in
            self.recognitionRequest?.append(buffer)
        }
        
        audioEngine.prepare()
        do {
            print("Diagnostic: Starting audio engine")
            try audioEngine.start()
        } catch {
            sendError("Audio engine failed to start: \(error.localizedDescription)")
            exit(1)
        }
        print("Diagnostic: Recording started successfully")
    }
    
    func stop() {
        audioEngine.stop()
        audioEngine.inputNode.removeTap(onBus: 0)
        recognitionRequest?.endAudio()
        recognitionRequest = nil
        recognitionTask = nil
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

let args = CommandLine.arguments
let locale = args.count > 1 ? args[1] : "en-US"

let manager = SpeechManager(localeIdentifier: locale)
manager.start()

// Run loop to keep the process alive
RunLoop.main.run()
