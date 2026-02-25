const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadFile('index.html');

  // 开发模式下打开 DevTools
  if (process.argv.includes('--dev')) {
    mainWindow.webContents.openDevTools();
  }

  return mainWindow;
}

// 音频处理（录音在渲染进程完成，音频数据发送到主进程处理）
ipcMain.handle('process-audio', async (event, audioData) => {
  try {
    console.log('收到音频数据，大小:', audioData.length, 'bytes');
    
    // TODO: 将来接入 Gemini API 进行语音识别
    // 目前使用模拟转录结果
    const mockTranscription = {
      text: 'Hello, this is a test transcription from the audio recording.',
      confidence: 0.95
    };
    
    // 发送转录结果到渲染进程
    const mainWindow = BrowserWindow.getAllWindows()[0];
    if (mainWindow) {
      mainWindow.webContents.send('transcription-result', mockTranscription);
    }
    
    return { success: true };
  } catch (error) {
    console.error('处理音频失败:', error);
    return { success: false, error: error.message };
  }
});

// 翻译功能
ipcMain.handle('translate-text', async (event, text, targetLang) => {
  try {
    // 这里应该调用实际的翻译API
    // 目前使用模拟数据
    const translations = {
      'zh': '你好，这是来自音频录制的测试转录。',
      'en': 'Hello, this is a test transcription from the audio recording.',
      'ja': 'こんにちは、これはオーディオ録音からのテスト転写です。',
      'ko': '안녕하세요, 이것은 오디오 녹음에서 테스트 전사입니다.'
    };
    
    const translatedText = translations[targetLang] || text;
    
    // 发送翻译结果到渲染进程
    const mainWindow = BrowserWindow.getAllWindows()[0];
    if (mainWindow) {
      mainWindow.webContents.send('translation-result', { 
        text: translatedText,
        originalText: text,
        targetLanguage: targetLang
      });
    }
    
    return { success: true, translatedText };
  } catch (error) {
    console.error('翻译失败:', error);
    return { success: false, error: error.message };
  }
});

// 错误处理
ipcMain.handle('error', (event, error) => {
  console.error('渲染进程错误:', error);
  const mainWindow = BrowserWindow.getAllWindows()[0];
  if (mainWindow) {
    mainWindow.webContents.send('error', { message: error });
  }
});

app.whenReady().then(() => {
  const mainWindow = createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

