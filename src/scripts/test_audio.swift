import Foundation
import AVFoundation

print("Diagnostic: Testing Audio Engine")
let audioEngine = AVAudioEngine()
let inputNode = audioEngine.inputNode
let recordingFormat = inputNode.outputFormat(forBus: 0)
print("Diagnostic: Recording format: \(recordingFormat)")

inputNode.installTap(onBus: 0, bufferSize: 1024, format: recordingFormat) { buffer, _ in
    print("Received buffer")
}

do {
    try audioEngine.start()
    print("Diagnostic: Audio engine started")
    Thread.sleep(forTimeInterval: 2)
    audioEngine.stop()
    print("Diagnostic: Audio engine stopped")
} catch {
    print("Diagnostic: Failed to start audio engine: \(error)")
}
