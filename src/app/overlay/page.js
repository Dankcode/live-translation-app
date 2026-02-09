'use client';

import { useEffect, useState, useRef } from 'react';
import { X, Maximize2, ArrowLeftRight, Settings as SettingsIcon, Sparkles } from 'lucide-react';

const { ipcRenderer } = typeof window !== 'undefined' ? window.require('electron') : { ipcRenderer: null };

export default function OverlayPage() {
    const [subtitleHistory, setSubtitleHistory] = useState([]);
    const [isHovered, setIsHovered] = useState(false);
    const [isListening, setIsListening] = useState(false);
    const [sourceLang, setSourceLang] = useState('en-US');
    const [targetLang, setTargetLang] = useState('es');
    const [isResizing, setIsResizing] = useState(false);
    const [hasMounted, setHasMounted] = useState(false);
    const [bgOpacity, setBgOpacity] = useState(0.7);
    const [fontSize, setFontSize] = useState(1.0);
    const [showSettings, setShowSettings] = useState(false);

    const sourceLangRef = useRef(sourceLang);
    const targetLangRef = useRef(targetLang);
    const recognitionRef = useRef(null);
    const resizeStart = useRef({ x: 0, y: 0, w: 0, h: 0 });
    const isRecognitionRunningRef = useRef(false);

    useEffect(() => {
        sourceLangRef.current = sourceLang;
        targetLangRef.current = targetLang;
    }, [sourceLang, targetLang]);

    useEffect(() => {
        setHasMounted(true);
        const style = document.createElement('style');
        style.innerHTML = `
            html, body { background: transparent !important; overflow: hidden; margin: 0; padding: 0; }
            * { transition: background 0.3s ease, border 0.3s ease, opacity 0.3s ease; }
            input[type="range"]::-webkit-slider-thumb {
                -webkit-appearance: none;
                appearance: none;
                width: 14px;
                height: 14px;
                background: #fff;
                cursor: pointer;
                border-radius: 50%;
                box-shadow: 0 0 10px rgba(0,0,0,0.5);
            }
        `;
        document.head.appendChild(style);

        // Load saved settings
        const savedOpacity = localStorage.getItem('overlay_opacity');
        if (savedOpacity) setBgOpacity(parseFloat(savedOpacity));

        const savedFontSize = localStorage.getItem('overlay_font_size');
        if (savedFontSize) setFontSize(parseFloat(savedFontSize));

        if (ipcRenderer) {
            const onSub = (e, data) => setSubtitleHistory(data || []);
            const onStart = (e, cfg) => {
                const sLang = cfg?.sourceLang || sourceLangRef.current;
                const tLang = cfg?.targetLang || targetLangRef.current;
                setSourceLang(sLang);
                setTargetLang(tLang);
                startListening(sLang);
            };
            const onStop = () => stopListening();
            const onSync = (e, { sourceLang: s, targetLang: t }) => {
                setSourceLang(s);
                setTargetLang(t);
            };

            ipcRenderer.on('receive-subtitle', onSub);
            ipcRenderer.on('start-stt', onStart);
            ipcRenderer.on('stop-stt', onStop);
            ipcRenderer.on('sync-languages', onSync);

            return () => {
                ipcRenderer.removeListener('receive-subtitle', onSub);
                ipcRenderer.removeListener('start-stt', onStart);
                ipcRenderer.removeListener('stop-stt', onStop);
                ipcRenderer.removeListener('sync-languages', onSync);
            };
        }
    }, []);

    // Save settings when they change
    useEffect(() => {
        if (hasMounted) {
            localStorage.setItem('overlay_opacity', bgOpacity.toString());
            localStorage.setItem('overlay_font_size', fontSize.toString());
        }
    }, [bgOpacity, fontSize, hasMounted]);

    useEffect(() => {
        if (ipcRenderer) ipcRenderer.send('overlay-hover', isHovered);
    }, [isHovered]);

    const startListening = (lang) => {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRecognition) return;

        if (!recognitionRef.current) {
            const rec = new SpeechRecognition();
            rec.continuous = true;
            rec.interimResults = true;
            rec.onstart = () => {
                setIsListening(true);
                isRecognitionRunningRef.current = true;
            };
            rec.onresult = (e) => {
                let text = '';
                for (let i = e.resultIndex; i < e.results.length; ++i) text += e.results[i][0].transcript;
                if (text?.trim() && ipcRenderer) ipcRenderer.send('satellite-data', { transcript: text, isFinal: e.results[e.results.length - 1].isFinal, timestamp: Date.now() });
            };
            rec.onend = () => {
                isRecognitionRunningRef.current = false;
                if (window._active) {
                    setTimeout(() => {
                        if (window._active && !isRecognitionRunningRef.current) {
                            try { rec.start(); } catch (err) { }
                        }
                    }, 300);
                } else {
                    setIsListening(false);
                }
            };
            recognitionRef.current = rec;
        }
        window._active = true;
        recognitionRef.current.lang = lang;
        if (!isRecognitionRunningRef.current) {
            try {
                recognitionRef.current.start();
            } catch (e) {
                console.warn("SpeechRecognition start failed:", e);
            }
        }
    };

    const stopListening = () => {
        window._active = false;
        if (isRecognitionRunningRef.current) {
            recognitionRef.current?.stop();
        }
        setIsListening(false);
    };

    const swapLangs = () => {
        const map = { en: 'en-US', es: 'es-ES', fr: 'fr-FR', de: 'de-DE', zh: 'zh-CN' };
        const newSrc = map[targetLang] || `${targetLang}-US`;
        const newTgt = sourceLang.split('-')[0];
        setSourceLang(newSrc); setTargetLang(newTgt);
        if (ipcRenderer) {
            ipcRenderer.send('sync-languages', { sourceLang: newSrc, targetLang: newTgt });
            if (isListening) { stopListening(); setTimeout(() => startListening(newSrc), 300); }
        }
    };

    if (!hasMounted) return null;

    const items = subtitleHistory.slice(0, 2);
    const isEmpty = items.length === 0 || (!items[0]?.original && !items[0]?.translated);

    return (
        <div
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
            className="relative flex flex-col h-screen w-screen px-10 py-6 overflow-hidden group"
            style={{
                backgroundColor: `rgba(15, 23, 42, ${bgOpacity})`,
                backdropFilter: 'blur(12px)',
                border: isHovered ? '1px solid rgba(255,255,255,0.1)' : '1px solid transparent',
                WebkitAppRegion: isResizing || !isHovered ? 'none' : 'drag'
            }}
        >
            {/* Top Control Icons */}
            <div className={`absolute top-4 right-4 flex items-center gap-2 transition-opacity duration-300 ${isHovered ? 'opacity-100' : 'opacity-0'}`}>
                <button
                    onClick={() => setShowSettings(!showSettings)}
                    style={{ WebkitAppRegion: 'no-drag' }}
                    className={`p-2 rounded-xl transition-all ${showSettings ? 'bg-white/20 text-white' : 'text-white/60 hover:text-white hover:bg-white/10'}`}
                >
                    <SettingsIcon size={20} />
                </button>
                <button
                    onClick={() => ipcRenderer?.send('close-overlay')}
                    style={{ WebkitAppRegion: 'no-drag' }}
                    className="p-2 text-white/60 hover:text-white hover:bg-red-500/20 rounded-xl transition-all"
                >
                    <X size={20} />
                </button>
            </div>

            {/* Settings Popover */}
            {showSettings && isHovered && (
                <div
                    className="absolute top-16 right-4 w-64 bg-slate-900/95 backdrop-blur-2xl border border-white/10 rounded-2xl shadow-2xl p-5 z-50 animate-in fade-in zoom-in-95 duration-200"
                    style={{ WebkitAppRegion: 'no-drag' }}
                >
                    <div className="space-y-6">
                        {/* Opacity Slider */}
                        <div className="space-y-3">
                            <div className="flex items-center justify-between">
                                <span className="text-[10px] font-black uppercase tracking-widest text-white/40">Opacity</span>
                                <span className="text-xs font-mono text-white/80">{Math.round(bgOpacity * 100)}%</span>
                            </div>
                            <input
                                type="range"
                                min="0.1"
                                max="1"
                                step="0.01"
                                value={bgOpacity}
                                onChange={(e) => setBgOpacity(parseFloat(e.target.value))}
                                className="w-full h-1 bg-white/10 rounded-full appearance-none cursor-pointer accent-white"
                            />
                        </div>

                        {/* Font Size Slider */}
                        <div className="space-y-3">
                            <div className="flex items-center justify-between">
                                <span className="text-[10px] font-black uppercase tracking-widest text-white/40">Font Size</span>
                                <span className="text-xs font-mono text-white/80">{Math.round(fontSize * 100)}%</span>
                            </div>
                            <input
                                type="range"
                                min="0.5"
                                max="2.0"
                                step="0.1"
                                value={fontSize}
                                onChange={(e) => setFontSize(parseFloat(e.target.value))}
                                className="w-full h-1 bg-white/10 rounded-full appearance-none cursor-pointer accent-white"
                            />
                        </div>

                        {/* Languages */}
                        <div className="space-y-3">
                            <span className="text-[10px] font-black uppercase tracking-widest text-white/40">Language Sync</span>
                            <div className="flex items-center justify-between bg-white/5 p-3 rounded-xl border border-white/5">
                                <span className="text-xs font-black text-white/90 uppercase">{sourceLang.split('-')[0]}</span>
                                <button onClick={swapLangs} className="p-1.5 hover:bg-white/10 rounded-lg text-white/60 hover:text-white transition-all"><ArrowLeftRight size={14} /></button>
                                <span className="text-xs font-black text-white/90 uppercase">{targetLang}</span>
                            </div>
                        </div>

                        {/* Status */}
                        <div className="flex items-center gap-2 pt-2 border-t border-white/5">
                            <div className={`w-1.5 h-1.5 rounded-full ${isListening ? 'bg-red-500 animate-pulse' : 'bg-green-500'}`} />
                            <span className="text-[10px] font-bold uppercase tracking-widest text-white/40">
                                {isListening ? 'Stream Active' : 'System Ready'}
                            </span>
                        </div>
                    </div>
                </div>
            )}

            {/* Content Area */}
            <div className="flex-1 flex flex-col items-center justify-center text-center space-y-10 select-none">
                {isEmpty ? (
                    <div className="flex flex-col items-center gap-4">
                        <Sparkles className={`w-8 h-8 ${isListening ? 'text-white/60' : 'text-white/20'}`} />
                        <p className="text-white/30 text-2xl font-black italic tracking-widest uppercase">
                            {isListening ? 'Listening...' : 'Ready'}
                        </p>
                    </div>
                ) : (
                    <div className="space-y-10 w-full">
                        {items.map((sub, i) => (
                            <div key={i} className={`transition-all duration-500 ${i === 0 ? 'scale-100 opacity-100' : 'scale-90 opacity-40'}`}>
                                <p
                                    className="text-cyan-400/90 font-bold italic mb-4 drop-shadow-md"
                                    style={{ fontSize: `${30 * fontSize}px` }}
                                >
                                    {sub.original}
                                </p>
                                {sub.translated && (
                                    <p
                                        className="text-white font-black tracking-tight leading-tight drop-shadow-lg"
                                        style={{ fontSize: `${60 * fontSize}px` }}
                                    >
                                        {sub.translated}
                                    </p>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Resize Handle */}
            {isHovered && (
                <div
                    onMouseDown={(e) => { e.preventDefault(); setIsResizing(true); resizeStart.current = { x: e.screenX, y: e.screenY, w: window.outerWidth, h: window.outerHeight }; }}
                    style={{ WebkitAppRegion: 'no-drag' }}
                    className="absolute bottom-4 right-4 cursor-nwse-resize p-2 text-white/40 hover:text-white transition-colors"
                >
                    <Maximize2 size={24} />
                </div>
            )}

            {/* Global Mouse Listener for Resizing */}
            {isResizing && (
                <div
                    className="fixed inset-0 z-[9999] cursor-nwse-resize"
                    onMouseMove={(e) => {
                        const w = Math.max(400, resizeStart.current.w + (e.screenX - resizeStart.current.x));
                        const h = Math.max(150, resizeStart.current.h + (e.screenY - resizeStart.current.y));
                        ipcRenderer?.send('resize-overlay', { width: w, height: h });
                    }}
                    onMouseUp={() => setIsResizing(false)}
                />
            )}
        </div>
    );
}
