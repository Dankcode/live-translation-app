const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // 音频处理（录音在渲染进程完成，处理在主进程完成）
  processAudio: (audioData) => ipcRenderer.invoke('process-audio', audioData),
  
  // 翻译相关
  translateText: (text, targetLang) => ipcRenderer.invoke('translate-text', text, targetLang),
  
  // 事件监听
  onTranscriptionResult: (callback) => ipcRenderer.on('transcription-result', (event, data) => callback(data)),
  onTranslationResult: (callback) => ipcRenderer.on('translation-result', (event, data) => callback(data)),
  onError: (callback) => ipcRenderer.on('error', (event, error) => callback(error)),
  
  // 清理监听器
  removeAllListeners: (channel) => ipcRenderer.removeAllListeners(channel),
});
