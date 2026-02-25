// 渲染进程脚本
console.log('Live Translation App 已启动');

class TranslationApp {
  constructor() {
    this.isRecording = false;
    this.mediaRecorder = null;
    this.audioChunks = [];
    this.targetLanguage = 'zh';
    
    this.initializeElements();
    this.bindEvents();
    this.setupEventListeners();
  }

  initializeElements() {
    this.startBtn = document.getElementById('startRecording');
    this.stopBtn = document.getElementById('stopRecording');
    this.languageSelect = document.getElementById('targetLanguage');
    this.originalTextDiv = document.getElementById('originalText');
    this.translatedTextDiv = document.getElementById('translatedText');
  }

  bindEvents() {
    this.startBtn.addEventListener('click', () => this.startRecording());
    this.stopBtn.addEventListener('click', () => this.stopRecording());
    this.languageSelect.addEventListener('change', (e) => {
      this.targetLanguage = e.target.value;
    });
  }

  setupEventListeners() {
    // 监听转录结果
    window.electronAPI.onTranscriptionResult((data) => {
      this.updateOriginalText(data.text);
      // 自动翻译
      this.translateText(data.text);
    });

    // 监听翻译结果
    window.electronAPI.onTranslationResult((data) => {
      this.updateTranslatedText(data.text);
    });

    // 监听错误
    window.electronAPI.onError((error) => {
      console.error('应用错误:', error);
      this.showError(error.message || '发生未知错误');
    });
  }

  async startRecording() {
    try {
      // 在渲染进程中直接请求麦克风权限并录音
      // macOS 会弹出权限请求，权限绑定到 Electron 应用
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.stream = stream;
      this.audioChunks = [];
      this.mediaRecorder = new MediaRecorder(stream);

      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          this.audioChunks.push(event.data);
        }
      };

      this.mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(this.audioChunks, { type: 'audio/webm' });
        console.log('录音结束，音频大小:', audioBlob.size, 'bytes');

        // 将音频发送到主进程进行转录
        const arrayBuffer = await audioBlob.arrayBuffer();
        const uint8Array = new Uint8Array(arrayBuffer);
        const result = await window.electronAPI.processAudio(Array.from(uint8Array));
        if (!result.success) {
          this.showError('处理音频失败: ' + (result.error || '未知错误'));
        }
      };

      this.mediaRecorder.start(1000); // 每秒收集一次数据
      this.isRecording = true;
      this.startBtn.disabled = true;
      this.stopBtn.disabled = false;
      this.startBtn.textContent = '录音中...';
      console.log('录音已开始');
    } catch (error) {
      console.error('启动录音错误:', error);
      if (error.name === 'NotAllowedError') {
        this.showError('麦克风权限被拒绝。请在 系统设置 → 隐私与安全性 → 麦克风 中允许 Electron 访问麦克风。');
      } else if (error.name === 'NotFoundError') {
        this.showError('未检测到麦克风设备。');
      } else {
        this.showError('启动录音失败: ' + error.message);
      }
    }
  }

  async stopRecording() {
    try {
      if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
        this.mediaRecorder.stop();
      }
      if (this.stream) {
        this.stream.getTracks().forEach(track => track.stop());
        this.stream = null;
      }
      this.isRecording = false;
      this.startBtn.disabled = false;
      this.stopBtn.disabled = true;
      this.startBtn.textContent = '开始录音';
      console.log('录音已停止');
    } catch (error) {
      console.error('停止录音错误:', error);
      this.showError('停止录音失败: ' + error.message);
    }
  }

  async translateText(text) {
    try {
      const result = await window.electronAPI.translateText(text, this.targetLanguage);
      if (!result.success) {
        throw new Error(result.error || '翻译失败');
      }
    } catch (error) {
      console.error('翻译错误:', error);
      this.showError('翻译失败: ' + error.message);
    }
  }

  updateOriginalText(text) {
    const timestamp = new Date().toLocaleTimeString();
    this.originalTextDiv.innerHTML = `<p><strong>[${timestamp}]</strong> ${text}</p>`;
  }

  updateTranslatedText(text) {
    const timestamp = new Date().toLocaleTimeString();
    this.translatedTextDiv.innerHTML = `<p><strong>[${timestamp}]</strong> ${text}</p>`;
  }

  showError(message) {
    // 简单的错误显示，可以后续改进为更好的UI
    const errorDiv = document.createElement('div');
    errorDiv.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: #e94560;
      color: white;
      padding: 1rem;
      border-radius: 6px;
      z-index: 1000;
      max-width: 300px;
    `;
    errorDiv.textContent = message;
    document.body.appendChild(errorDiv);
    
    setTimeout(() => {
      if (errorDiv.parentNode) {
        errorDiv.parentNode.removeChild(errorDiv);
      }
    }, 3000);
  }
}

// 应用初始化
document.addEventListener('DOMContentLoaded', () => {
  new TranslationApp();
});
