'use client';

import { useEffect, useState, useRef } from 'react';

/**
 * Satellite Page Component
 * Ensure this file is saved as: app/satellite/page.jsx
 * This page is intended to be opened in a browser or a secondary Electron window.
 * It handles the browser's native Web Speech API (Free STT) and sends data back to Electron.
 * This version uses 'send-subtitle' to communicate with main.js.
 */
export default function SatellitePage() {
    const [status, setStatus] = useState('Idle - Waiting for Command');
    const [isActive, setIsActive] = useState(false);
    const [logs, setLogs] = useState(['Engine initialized...']);
    const recognitionRef = useRef(null);

    // Safe access to Electron IPC
    const ipc = typeof window !== 'undefined' && window.require
        ? window.require('electron').ipcRenderer
        : null;

    const addLog = (msg) => {
        setLogs(prev => [...prev.slice(-20), msg]); // Keep last 20 logs
    };

    useEffect(() => {
        // Initialize Speech Recognition
        const SpeechRecognition = typeof window !== 'undefined' && (window.SpeechRecognition || window.webkitSpeechRecognition);

        if (SpeechRecognition) {
            recognitionRef.current = new SpeechRecognition();
            const recognition = recognitionRef.current;

            recognition.continuous = true;
            recognition.interimResults = true;

            recognition.onstart = () => {
                addLog("Microphone access granted. Listening...");
                setStatus("Listening...");
                setIsActive(true);
            };

            recognition.onresult = (event) => {
                let interimTranscript = '';
                let finalTranscript = '';

                for (let i = event.resultIndex; i < event.results.length; ++i) {
                    if (event.results[i].isFinal) {
                        finalTranscript += event.results[i][0].transcript;
                    } else {
                        interimTranscript += event.results[i][0].transcript;
                    }
                }

                const text = finalTranscript || interimTranscript;
                if (text) {
                    addLog(`Detected: ${text.substring(0, 30)}...`);

                    // Send the data back to Electron main.js using 'send-subtitle'
                    // Matching your ipcrenderer.js structure
                    if (ipc) {
                        ipc.send('send-subtitle', {
                            transcript: text,
                            isFinal: finalTranscript !== '',
                            timestamp: Date.now()
                        });
                    }
                }
            };

            recognition.onerror = (event) => {
                addLog(`Error: ${event.error}`);
                if (event.error === 'not-allowed') {
                    setStatus("Mic Blocked");
                }
            };

            recognition.onend = () => {
                // Auto-restart if we're supposed to be active (prevents timeouts)
                if (window._shouldBeActive) {
                    addLog("Restarting stream...");
                    try { recognition.start(); } catch (e) { }
                } else {
                    addLog("Stream ended.");
                    setStatus("Idle");
                    setIsActive(false);
                }
            };
        } else {
            addLog("Error: Web Speech API not supported.");
            setStatus("Not Supported");
        }

        // Handle IPC Commands from Electron Main
        if (ipc) {
            const handleStart = (event, config) => {
                addLog(`Command: Start (Lang: ${config.sourceLang})`);
                window._shouldBeActive = true;
                if (recognitionRef.current) {
                    recognitionRef.current.lang = config.sourceLang || 'en-US';
                    try { recognitionRef.current.start(); } catch (e) { addLog("Already running"); }
                }
            };

            const handleStop = () => {
                addLog("Command: Stop");
                window._shouldBeActive = false;
                if (recognitionRef.current) {
                    recognitionRef.current.stop();
                }
            };

            ipc.on('start-stt', handleStart);
            ipc.on('stop-stt', handleStop);

            return () => {
                ipc.removeListener('start-stt', handleStart);
                ipc.removeListener('stop-stt', handleStop);
            };
        }
    }, [ipc]);

    return (
        <div className="min-h-screen bg-[#0a0f1c] text-slate-300 font-sans flex items-center justify-center p-6">
            <div className="max-w-md w-full bg-[#1e293b] border border-[#334155] rounded-3xl p-8 shadow-2xl text-center">
                <div className={`w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6 transition-all duration-500 ${isActive ? 'bg-blue-600/20 text-blue-400' : 'bg-slate-800 text-slate-500'}`}>
                    <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="32"
                        height="32"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                    >
                        <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
                        <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                        <line x1="12" x2="12" y1="19" y2="22" />
                    </svg>
                </div>

                <h1 className="text-white text-xl font-bold mb-2">Satellite Engine</h1>
                <p className={`text-sm mb-8 uppercase tracking-widest font-black ${isActive ? 'text-blue-400' : 'text-slate-500'}`}>
                    {status}
                </p>

                {isActive && (
                    <div className="flex items-center justify-center gap-1 h-8 mb-8">
                        <div className="w-1 h-4 bg-blue-500 rounded-full animate-bounce"></div>
                        <div className="w-1 h-6 bg-blue-400 rounded-full animate-bounce [animation-delay:0.1s]"></div>
                        <div className="w-1 h-8 bg-blue-300 rounded-full animate-bounce [animation-delay:0.2s]"></div>
                        <div className="w-1 h-6 bg-blue-400 rounded-full animate-bounce [animation-delay:0.3s]"></div>
                        <div className="w-1 h-4 bg-blue-500 rounded-full animate-bounce [animation-delay:0.4s]"></div>
                    </div>
                )}

                <div className="bg-[#0f172a] rounded-2xl p-4 text-left border border-[#334155]">
                    <span className="text-[10px] text-indigo-400 font-bold uppercase tracking-tighter">Live Debug Feed</span>
                    <div className="text-[11px] font-mono mt-2 h-32 overflow-y-auto text-slate-400 space-y-1">
                        {logs.map((log, i) => (
                            <div key={i}>{`> ${log}`}</div>
                        ))}
                    </div>
                </div>

                {!ipc && (
                    <p className="mt-4 text-[10px] text-yellow-500/50">
                        Running in Standalone Browser Mode (IPC unavailable)
                    </p>
                )}
            </div>
        </div>
    );
}