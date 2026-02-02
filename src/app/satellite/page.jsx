'use client';

import { useEffect, useState, useRef } from 'react';

/**
 * Satellite Page Component
 * Handles the browser's native Web Speech API (Free STT) and sends data back to Electron via WebSocket or IPC.
 */
export default function SatellitePage() {
    const [status, setStatus] = useState('Idle - Waiting for Command');
    const [isActive, setIsActive] = useState(false);
    const [logs, setLogs] = useState(['Engine initialized...']);
    const recognitionRef = useRef(null);
    const wsRef = useRef(null);
    const isRecognitionRunningRef = useRef(false);

    // Safe access to Electron IPC
    const ipc = typeof window !== 'undefined' && window.require
        ? window.require('electron').ipcRenderer
        : null;

    const addLog = (msg) => {
        console.log(`[Satellite Log]: ${msg}`);
        setLogs(prev => [...prev.slice(-20), msg]); // Keep last 20 logs
    };

    useEffect(() => {
        // --- 1. Initialize Speech Recognition ---
        const SpeechRecognition = typeof window !== 'undefined' && (window.SpeechRecognition || window.webkitSpeechRecognition);

        if (!SpeechRecognition) {
            addLog("Error: Web Speech API not supported.");
            setStatus("Not Supported");
            return;
        }

        const recognition = new SpeechRecognition();
        recognitionRef.current = recognition;
        recognition.continuous = true;
        recognition.interimResults = true;

        recognition.onstart = () => {
            addLog("Microphone listening...");
            setStatus("Listening...");
            setIsActive(true);
            isRecognitionRunningRef.current = true;
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

                const payload = {
                    transcript: text,
                    isFinal: finalTranscript !== '',
                    timestamp: Date.now()
                };

                if (ipc) {
                    ipc.send('send-subtitle', payload);
                } else if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
                    wsRef.current.send(JSON.stringify(payload));
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
            addLog("Recognition stream ended.");
            isRecognitionRunningRef.current = false;

            // Auto-restart if we're supposed to be active (prevents timeouts)
            if (window._shouldBeActive) {
                addLog("Attempting auto-restart...");
                try {
                    recognition.start();
                } catch (e) {
                    addLog(`Restart failed: ${e.message}`);
                }
            } else {
                setStatus("Idle");
                setIsActive(false);
            }
        };

        // --- 2. Helper for Command Execution ---
        const executeStart = (sourceLang) => {
            addLog(`Execute Start (Lang: ${sourceLang || 'default'})`);
            window._shouldBeActive = true;

            // Update language
            if (sourceLang) {
                recognition.lang = sourceLang;
            }

            if (isRecognitionRunningRef.current) {
                addLog("Already running, restarting to apply language...");
                recognition.stop(); // onend will catch window._shouldBeActive = true and restart
            } else {
                try {
                    recognition.start();
                } catch (e) {
                    addLog(`Start failed: ${e.message}`);
                }
            }
        };

        const executeStop = () => {
            addLog("Execute Stop");
            window._shouldBeActive = false;
            if (isRecognitionRunningRef.current) {
                recognition.stop();
            }
        };

        // --- 3. Communication Handlers (IPC or WebSocket) ---
        if (ipc) {
            const handleStart = (event, config) => executeStart(config?.sourceLang);
            const handleStop = () => executeStop();

            ipc.on('start-stt', handleStart);
            ipc.on('stop-stt', handleStop);

            addLog("Electron IPC Listeners initialized.");

            return () => {
                ipc.removeListener('start-stt', handleStart);
                ipc.removeListener('stop-stt', handleStop);
                recognition.stop();
            };
        } else {
            // Standalone Browser Mode
            const socket = new WebSocket('ws://localhost:8080');
            wsRef.current = socket;

            socket.onopen = () => {
                addLog("Connected to Electron via WebSocket.");
                setStatus("Connected - Ready");
                // Initial start in browser mode
                executeStart();
            };

            socket.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    if (data.type === 'command') {
                        if (data.command === 'start') {
                            addLog(`Remote Command: START received (${data.config?.sourceLang || 'auto'})`);
                            executeStart(data.config?.sourceLang);
                        } else if (data.command === 'stop') {
                            addLog("Remote Command: STOP received");
                            executeStop();
                        }
                    }
                } catch (e) {
                    addLog("Failed to parse remote command.");
                }
            };

            socket.onclose = () => {
                addLog("Disconnected from Electron.");
                setStatus("Disconnected");
                executeStop();
            };

            return () => {
                socket.close();
                recognition.stop();
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
                        Connected via WebSocket (Browser Mode)
                    </p>
                )}
            </div>
        </div>
    );
}