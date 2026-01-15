'use client';

import { useState, useRef, useEffect } from 'react';
import { Mic, MicOff, Settings, Monitor, Languages, Sparkles } from 'lucide-react';
import { translateText } from '@/lib/translator';
import io from 'socket.io-client';

export default function Home() {
  const [isRecording, setIsRecording] = useState(false);
  const [sourceLang, setSourceLang] = useState('en-US');
  const [targetLang, setTargetLang] = useState('es');
  const [llmModel, setLlmModel] = useState('none');
  const [showSettings, setShowSettings] = useState(false);
  const [transcript, setTranscript] = useState({ original: '', translated: '' });

  const recognitionRef = useRef(null);
  const socketRef = useRef(null);

  useEffect(() => {
    // Initialize socket
    fetch('/api/socket'); // Wake up the socket handler
    socketRef.current = io();

    return () => {
      if (socketRef.current) socketRef.current.disconnect();
    };
  }, []);

  useEffect(() => {
    if (typeof window !== 'undefined' && ('WebkitSpeechRecognition' in window || 'SpeechRecognition' in window)) {
      const SpeechRecognition = window.SpeechRecognition || window.WebkitSpeechRecognition;
      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.continuous = true;
      recognitionRef.current.interimResults = true;

      recognitionRef.current.onresult = async (event) => {
        let interimTranscript = '';
        let finalTranscript = '';

        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) {
            finalTranscript += event.results[i][0].transcript;
          } else {
            interimTranscript += event.results[i][0].transcript;
          }
        }

        const currentText = finalTranscript || interimTranscript;
        if (currentText) {
          const translated = await translateText(currentText, sourceLang.split('-')[0], targetLang, llmModel);
          const data = { original: currentText, translated };
          setTranscript(data);

          // Emit to the Electron overlay via websocket
          if (socketRef.current) {
            socketRef.current.emit('send-subtitle', data);
          }
        }
      };

      recognitionRef.current.onerror = (event) => {
        console.error('Speech recognition error', event.error);
        setIsRecording(false);
      };

      recognitionRef.current.onend = () => {
        if (isRecording) recognitionRef.current.start();
      };
    }
  }, [sourceLang, targetLang, isRecording, llmModel]);

  const toggleRecording = () => {
    if (!recognitionRef.current) return;

    if (isRecording) {
      recognitionRef.current.stop();
      setIsRecording(false);
    } else {
      recognitionRef.current.lang = sourceLang;
      recognitionRef.current.start();
      setIsRecording(true);
    }
  };

  return (
    <main className="min-h-screen bg-[#0f172a] text-slate-200 p-8 font-sans">
      <div className="max-w-4xl mx-auto space-y-8">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-blue-600 p-2 rounded-xl">
              <Languages className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-indigo-400">
              Scribe Center
            </h1>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div className="space-y-6">
            <section className="bg-slate-800/50 border border-slate-700 p-6 rounded-3xl space-y-4 shadow-xl">
              <h2 className="text-lg font-semibold flex items-center gap-2 text-blue-300">
                <Monitor className="w-5 h-5 text-blue-400" /> Controls
              </h2>

              <div className="space-y-4">
                <div className="flex flex-col gap-2">
                  <label className="text-xs text-slate-400 uppercase tracking-widest font-bold">Mic Language</label>
                  <select
                    value={sourceLang}
                    onChange={(e) => setSourceLang(e.target.value)}
                    className="bg-slate-900 border border-slate-700 p-3 rounded-xl outline-none text-sm"
                  >
                    <option value="en-US">English (US)</option>
                    <option value="es-ES">Spanish</option>
                    <option value="fr-FR">French</option>
                    <option value="de-DE">German</option>
                    <option value="zh-CN">Chinese</option>
                  </select>
                </div>

                <div className="flex flex-col gap-2">
                  <label className="text-xs text-slate-400 uppercase tracking-widest font-bold">Target Language</label>
                  <select
                    value={targetLang}
                    onChange={(e) => setTargetLang(e.target.value)}
                    className="bg-slate-900 border border-slate-700 p-3 rounded-xl outline-none text-sm"
                  >
                    <option value="es">Spanish</option>
                    <option value="en">English</option>
                    <option value="fr">French</option>
                    <option value="de">German</option>
                    <option value="zh">Chinese</option>
                  </select>
                </div>
              </div>
            </section>

            <section className="bg-slate-800/50 border border-slate-700 p-6 rounded-3xl space-y-4 shadow-xl">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold flex items-center gap-2 text-indigo-300">
                  <Sparkles className="w-5 h-5 text-indigo-400" /> AI Refinement
                </h2>
                <button
                  onClick={() => setShowSettings(!showSettings)}
                  className="p-2 hover:bg-slate-700 rounded-lg transition-colors"
                >
                  <Settings className={`w-5 h-5 transition-transform ${showSettings ? 'rotate-90' : ''}`} />
                </button>
              </div>

              {showSettings && (
                <div className="space-y-4 pt-2 animate-in fade-in slide-in-from-top-2 duration-200">
                  <div className="flex flex-col gap-2">
                    <label className="text-xs text-slate-400 uppercase tracking-widest font-bold">LLM Assistant</label>
                    <select
                      value={llmModel}
                      onChange={(e) => setLlmModel(e.target.value)}
                      className="bg-slate-900 border border-slate-700 p-3 rounded-xl outline-none text-sm"
                    >
                      <option value="none">Default (No LLM)</option>
                      <option value="gemini-1.5-flash">Gemini 1.5 Flash (Fast)</option>
                      <option value="gemini-1.5-pro">Gemini 1.5 Pro (Accurate)</option>
                    </select>
                    <p className="text-[10px] text-slate-500 italic mt-1">
                      * Gemini is used automatically for Chinese translations.
                    </p>
                  </div>
                </div>
              )}
            </section>

            <button
              onClick={toggleRecording}
              className={`w-full py-5 rounded-3xl flex items-center justify-center gap-3 font-bold text-xl transition-all ${isRecording
                ? 'bg-red-500 hover:bg-red-600 shadow-lg shadow-red-500/20'
                : 'bg-blue-600 hover:bg-blue-700 shadow-lg shadow-blue-500/20'
                }`}
            >
              {isRecording ? <MicOff /> : <Mic />}
              {isRecording ? 'Stop Transcript' : 'Start Microphone'}
            </button>

            <div className="p-4 bg-indigo-500/10 border border-indigo-500/20 rounded-2xl">
              <p className="text-xs text-indigo-300 font-medium">
                <Sparkles className="w-3 h-3 inline mr-1" />
                The transparent overlay will stay on top of your full-screen PowerPoint. Ensure you use Chrome or Edge for the microphone to work.
              </p>
            </div>
          </div>

          <div className="bg-slate-900/50 border border-slate-800 rounded-3xl p-6 flex flex-col min-h-[400px]">
            <h2 className="text-lg font-semibold mb-6 flex items-center gap-2">
              <Languages className="w-5 h-5 text-indigo-400" /> Live Feedback
            </h2>

            <div className="flex-1 space-y-8 overflow-y-auto pr-2 custom-scrollbar">
              <div className="space-y-1">
                <span className="text-[10px] text-slate-500 uppercase font-bold tracking-widest">Original</span>
                <p className="text-lg text-slate-300 italic">
                  {transcript.original || "Speak to see transcription..."}
                </p>
              </div>

              <div className="h-px bg-slate-800" />

              <div className="space-y-1">
                <span className="text-[10px] text-indigo-400 uppercase font-bold tracking-widest">Translated</span>
                <p className="text-2xl text-white font-medium">
                  {transcript.translated || "---"}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
