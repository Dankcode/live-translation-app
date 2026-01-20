export class AudioTranscriber {
    constructor(onTranscript, options = {}) {
        this.onTranscript = onTranscript;
        this.provider = options.provider || 'whisper';
        this.apiKey = options.apiKey || '';
        this.mediaRecorder = null;
        this.audioChunks = [];
        this.isTranscribing = false;
        this.interval = null;
    }

    setOptions(options) {
        if (options.provider) this.provider = options.provider;
        if (options.hasOwnProperty('apiKey')) this.apiKey = options.apiKey;
    }

    async start() {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            this.mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });

            this.mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    this.sendToTranscriptionAPI(event.data);
                }
            };

            // Start recording in chunks of 2 seconds
            this.mediaRecorder.start(2000);

            console.log("Transcription started using provider:", this.provider);
        } catch (err) {
            console.error("Error starting audio capture:", err);
            throw err;
        }
    }

    stop() {
        if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
            this.mediaRecorder.stop();
            this.mediaRecorder.stream.getTracks().forEach(track => track.stop());
        }
    }

    async sendToTranscriptionAPI(audioBlob) {
        const formData = new FormData();
        formData.append('file', audioBlob, 'audio.webm');

        try {
            const response = await fetch('/api/transcribe', {
                method: 'POST',
                body: formData,
                headers: {
                    'x-transcription-provider': this.provider,
                    'x-api-key': this.apiKey,
                }
            });

            if (!response.ok) throw new Error('Transcription API failed');

            const data = await response.json();
            if (data.text) {
                this.onTranscript(data.text);
            }
        } catch (err) {
            console.error("Transcription Communication Error:", err);
        }
    }
}
