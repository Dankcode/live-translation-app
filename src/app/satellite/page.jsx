'use client';

import { useEffect, useState, useRef } from 'react';
import {
    Mic, MicOff, Terminal, ChevronDown, ChevronUp,
    Activity, Globe, Zap, Settings, ShieldCheck
} from 'lucide-react';

/**
 * Satellite Page Component
 * Handles the browser's native Web Speech API (Free STT) and sends data back to Electron via WebSocket or IPC.
 */
export default function SatellitePage() {
    const [status, setStatus] = useState('Standby');
    const [isActive, setIsActive] = useState(false);
    const [logs, setLogs] = useState([]);
    const [showLogs, setShowLogs] = useState(false);
    const recognitionRef = useRef(null);
    const wsRef = useRef(null);
    const isRecognitionRunningRef = useRef(false);

    // Safe access to Electron IPC
    const ipc = typeof window !== 'undefined' && window.require
        ? window.require('electron').ipcRenderer
        : null;

    const addLog = (msg) => {
        const time = new Date().toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
        console.log(`[Satellite Log ${time}]: ${msg}`);
        setLogs(prev => [{ time, msg }, ...prev].slice(0, 50)); // Keep last 50 logs, newest first
    };

    useEffect(() => {
        // --- 1. Initialize Speech Recognition ---
        const SpeechRecognition = typeof window !== 'undefined' && (window.SpeechRecognition || window.webkitSpeechRecognition);

        if (!SpeechRecognition) {
            addLog("Error: Web Speech API not supported.");
            setStatus("Incompatible Browser");
            return;
        }

        const recognition = new SpeechRecognition();
        recognitionRef.current = recognition;
        recognition.continuous = true;
        recognition.interimResults = true;

        recognition.onstart = () => {
            addLog("Audio stream initialized.");
            setStatus("Listening");
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
            if (text && text.trim()) {
                const isFinal = finalTranscript !== '';
                if (isFinal) {
                    addLog(`Final Segment: "${text}"`);
                }

                const payload = {
                    transcript: text,
                    isFinal: isFinal,
                    timestamp: Date.now()
                };

                if (ipc) {
                    ipc.send('satellite-data', payload);
                } else if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
                    wsRef.current.send(JSON.stringify(payload));
                }
            }
        };

        recognition.onerror = (event) => {
            if (event.error === 'no-speech') return; // Suppress no-speech
            addLog(`Recognition error: ${event.error}`);
            if (event.error === 'not-allowed') {
                setStatus("Access Denied");
            }
        };

        recognition.onend = () => {
            isRecognitionRunningRef.current = false;

            // Auto-restart if we're supposed to be active (prevents timeouts)
            if (window._shouldBeActive) {
                addLog("Stream timed out, auto-restarting...");
                // Brief delay to ensure clean state
                setTimeout(() => {
                    if (window._shouldBeActive && !isRecognitionRunningRef.current) {
                        try {
                            recognition.start();
                        } catch (e) {
                            addLog(`Auto-restart failed: ${e.message}`);
                        }
                    }
                }, 200);
            } else {
                addLog("Audio stream closed.");
                setStatus("Standby");
                setIsActive(false);
            }
        };

        // --- 2. Helper for Command Execution ---
        const executeStart = (sourceLang) => {
            addLog(`Remote command: START [${sourceLang || 'auto'}]`);
            window._shouldBeActive = true;

            if (sourceLang) {
                recognition.lang = sourceLang;
            }

            if (isRecognitionRunningRef.current) {
                recognition.stop();
            } else {
                try {
                    recognition.start();
                } catch (e) {
                    addLog(`Activation failed: ${e.message}`);
                }
            }
        };

        const executeStop = () => {
            addLog("Remote command: STOP");
            window._shouldBeActive = false;
            if (isRecognitionRunningRef.current) {
                recognition.stop();
            }
        };

        // --- 3. Communication Handlers ---
        if (ipc) {
            const handleStart = (event, config) => executeStart(config?.sourceLang);
            const handleStop = () => executeStop();

            ipc.on('start-stt', handleStart);
            ipc.on('stop-stt', handleStop);

            addLog("Secure IPC Bridge established.");

            return () => {
                ipc.removeListener('start-stt', handleStart);
                ipc.removeListener('stop-stt', handleStop);
                recognition.stop();
            };
        } else {
            const socket = new WebSocket('ws://localhost:8080');
            wsRef.current = socket;

            socket.onopen = () => {
                addLog("Cloud Bridge connected.");
                setStatus("Ready");
            };

            socket.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    if (data.type === 'command') {
                        if (data.command === 'start') {
                            executeStart(data.config?.sourceLang);
                        } else if (data.command === 'stop') {
                            executeStop();
                        }
                    }
                } catch (e) {
                    addLog("Command parsing failed.");
                }
            };

            socket.onclose = () => {
                addLog("Cloud Bridge offline.");
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
        <div className="min-h-screen bg-[#fafafa] dark:bg-[#18181b] text-[#18181b] dark:text-[#f4f4f5] font-sans flex flex-col items-center justify-center p-6 transition-colors duration-500">
            {/* Top Indicator */}
            <div className="fixed top-8 left-8 flex items-center gap-3">
                <div className={`p-2 rounded-xl border ${isActive ? 'bg-teal-500/10 border-teal-500/20 text-teal-600 dark:text-teal-400' : 'bg-zinc-100 dark:bg-zinc-800 border-transparent text-zinc-400'}`}>
                    <Globe className="w-5 h-5" />
                </div>
                <div className="flex flex-col">
                    <span className="text-[10px] font-black uppercase tracking-[0.2em] opacity-40">Satellite Node</span>
                    <span className="text-xs font-bold font-mono">NODE_8080_ACTIVE</span>
                </div>
            </div>

            {/* Main Visual Core */}
            <div className="relative group flex flex-col items-center">
                {/* Outer Glows */}
                {isActive && (
                    <div className="absolute inset-0 bg-teal-500/10 blur-[100px] rounded-full animate-pulse" />
                )}

                {/* Animated Rings */}
                <div className={`relative w-48 h-48 rounded-full flex items-center justify-center border transition-all duration-700 ${isActive ? 'border-teal-500/30 scale-110' : 'border-zinc-200 dark:border-zinc-800 scale-100'}`}>
                    {isActive && (
                        <div className="absolute inset-2 border border-teal-500/20 rounded-full animate-[spin_10s_linear_infinite]" />
                    )}

                    {/* Inner Core */}
                    <div className={`w-36 h-36 rounded-full flex flex-col items-center justify-center transition-all duration-500 shadow-2xl ${isActive ? 'bg-teal-500 text-white shadow-teal-500/20' : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-400 dark:text-zinc-500 shadow-none'}`}>
                        {isActive ? <Mic className="w-10 h-10 animate-bounce" /> : <MicOff className="w-10 h-10" />}
                        <span className="mt-3 text-[10px] font-black uppercase tracking-widest">{status}</span>
                    </div>

                    {/* Wave Sprites */}
                    {isActive && (
                        <div className="absolute -bottom-4 right-0 left-0 flex items-center justify-center gap-1 h-8">
                            {[0, 0.1, 0.2, 0.3, 0.4].map((delay, i) => (
                                <div key={i} className="w-1 h-4 bg-teal-500/40 rounded-full animate-wave" style={{ animationDelay: `${delay}s`, animationDuration: '0.8s' }} />
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* Controls & Footer */}
            <div className="mt-20 w-full max-w-sm space-y-4">
                <button
                    onClick={() => setShowLogs(!showLogs)}
                    className={`w-full py-4 px-6 rounded-2xl border flex items-center justify-between transition-all duration-300 group ${showLogs ? 'bg-teal-500/10 border-teal-500/20 text-teal-600 dark:text-teal-400' : 'bg-zinc-100 dark:bg-zinc-800 border-transparent text-zinc-500 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700'}`}
                >
                    <div className="flex items-center gap-3">
                        <Terminal className="w-4 h-4" />
                        <span className="text-xs font-bold uppercase tracking-widest">Live System Logs</span>
                    </div>
                    {showLogs ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4 group-hover:translate-y-0.5 transition-transform" />}
                </button>

                {showLogs && (
                    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 shadow-2xl animate-in slide-in-from-top-4 duration-300">
                        <div className="flex items-center gap-2 mb-4">
                            <Zap className="w-3 h-3 text-teal-400" />
                            <span className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Debug Stream</span>
                        </div>
                        <div className="h-48 overflow-y-auto custom-scrollbar space-y-2 pr-2">
                            {logs.length === 0 ? (
                                <div className="h-full flex items-center justify-center text-zinc-700 text-[10px] italic">No logs generated yet...</div>
                            ) : (
                                logs.map((log, i) => (
                                    <div key={i} className="flex gap-3 text-[11px] font-mono leading-relaxed border-l border-zinc-800 pl-3">
                                        <span className="text-zinc-600 shrink-0">{log.time}</span>
                                        <span className="text-zinc-300">{log.msg}</span>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                )}

                <div className="flex items-center justify-center gap-6 pt-4 text-zinc-400 dark:text-zinc-600">
                    <div className="flex items-center gap-2">
                        <ShieldCheck className="w-3.5 h-3.5" />
                        <span className="text-[10px] font-bold uppercase tracking-tighter">Secure Engine</span>
                    </div>
                    <div className="w-1 h-1 bg-zinc-300 dark:bg-zinc-700 rounded-full" />
                    <div className="flex items-center gap-2">
                        <Zap className="w-3.5 h-3.5" />
                        <span className="text-[10px] font-bold uppercase tracking-tighter">Low Latency</span>
                    </div>
                </div>
            </div>

            <style jsx global>{`
                @keyframes wave {
                    0%, 100% { transform: scaleY(0.5); }
                    50% { transform: scaleY(1.5); }
                }
                .custom-scrollbar::-webkit-scrollbar { width: 3px; }
                .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
                .custom-scrollbar::-webkit-scrollbar-thumb { background: #3f3f46; border-radius: 10px; }
            `}</style>
        </div>
    );
}