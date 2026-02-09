'use client';

import { useEffect, useState, useRef } from 'react';
import { X, Maximize2, ArrowLeftRight } from 'lucide-react';

const { ipcRenderer } = typeof window !== 'undefined' ? window.require('electron') : { ipcRenderer: null };

export default function OverlayPage() {
    const [subtitleHistory, setSubtitleHistory] = useState([]);
    const [isHovered, setIsHovered] = useState(false);
    const [isListening, setIsListening] = useState(false);
    const [sourceLang, setSourceLang] = useState('en-US');
    const [targetLang, setTargetLang] = useState('es');
    const [isResizing, setIsResizing] = useState(false);
    const [hasMounted, setHasMounted] = useState(false);

    const recognitionRef = useRef(null);
    const resizeStart = useRef({ x: 0, y: 0, w: 0, h: 0 });

    useEffect(() => {
        setHasMounted(true);
        const style = document.createElement('style');
        style.innerHTML = `
            html, body { background: transparent !important; overflow: hidden; margin: 0; padding: 0; }
            * { transition: background 0.3s ease, border 0.3s ease, opacity 0.3s ease; }
        `;
        document.head.appendChild(style);

        if (ipcRenderer) {
            const onSub = (e, data) => setSubtitleHistory(data || []);
            const onStart = (e, cfg) => {
                if (cfg?.sourceLang) setSourceLang(cfg.sourceLang);
                if (cfg?.targetLang) setTargetLang(cfg.targetLang);
                startListening(cfg?.sourceLang || sourceLang);
            };
            const onStop = () => stopListening();

            ipcRenderer.on('receive-subtitle', onSub);
            ipcRenderer.on('start-stt', onStart);
            ipcRenderer.on('stop-stt', onStop);
            return () => {
                ipcRenderer.removeListener('receive-subtitle', onSub);
                ipcRenderer.removeListener('start-stt', onStart);
                ipcRenderer.removeListener('stop-stt', onStop);
            };
        }
    }, [sourceLang, targetLang]);

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
            rec.onstart = () => setIsListening(true);
            rec.onresult = (e) => {
                let text = '';
                for (let i = e.resultIndex; i < e.results.length; ++i) text += e.results[i][0].transcript;
                if (text?.trim() && ipcRenderer) ipcRenderer.send('satellite-data', { transcript: text, isFinal: e.results[e.results.length - 1].isFinal, timestamp: Date.now() });
            };
            rec.onend = () => window._active && setTimeout(() => { try { rec.start(); } catch (err) { } }, 200);
            recognitionRef.current = rec;
        }
        window._active = true;
        recognitionRef.current.lang = lang;
        try { recognitionRef.current.start(); } catch (e) { recognitionRef.current.stop(); setTimeout(() => recognitionRef.current.start(), 100); }
    };

    const stopListening = () => {
        window._active = false;
        recognitionRef.current?.stop();
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
            className={`relative flex flex-col h-screen w-screen px-10 py-6 overflow-hidden ${isHovered ? 'bg-slate-900/60 backdrop-blur-md border border-white/20' : 'bg-white/[0.005] border border-transparent'}`}
            style={{ WebkitAppRegion: isResizing || !isHovered ? 'none' : 'drag' }}
        >
            {/* Controls */}
            <div className={`flex items-center justify-end transition-opacity duration-300 ${isHovered ? 'opacity-100' : 'opacity-0'}`}>
                <div className="flex items-center gap-3 bg-white/20 backdrop-blur-xl px-4 py-2 rounded-2xl border border-white/10 mr-auto">
                    <span className="text-xs font-black text-white px-1 uppercase">{sourceLang.split('-')[0]}</span>
                    <button onClick={swapLangs} className="p-1.5 hover:bg-white/10 rounded-lg text-white" style={{ WebkitAppRegion: 'no-drag' }}><ArrowLeftRight size={14} /></button>
                    <span className="text-xs font-black text-white px-1 uppercase">{targetLang}</span>
                </div>
                <button onClick={() => ipcRenderer?.send('close-overlay')} style={{ WebkitAppRegion: 'no-drag' }} className="p-2 text-white/70 hover:text-white"><X size={24} /></button>
            </div>

            {/* Content: Static text with 100% opacity, white, no outlines */}
            <div className="flex-1 flex flex-col items-center justify-center text-center space-y-10 select-none">
                {isEmpty ? (
                    <p className="text-white/30 text-4xl font-black italic tracking-widest uppercase" style={{ opacity: 1 }}>
                        {isListening ? 'Listening...' : 'Ready'}
                    </p>
                ) : (
                    <div className="space-y-12 w-full">
                        {items.map((sub, i) => (
                            <div key={i} className="scale-100" style={{ opacity: 1 }}>
                                <p className="text-white font-black text-5xl md:text-6xl tracking-tight leading-tight" style={{ opacity: 1 }}>
                                    {sub.original}
                                </p>
                                {sub.translated && (
                                    <p className="text-white font-bold italic text-3xl mt-4" style={{ opacity: 1 }}>
                                        {sub.translated}
                                    </p>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Resize */}
            {isHovered && (
                <div
                    onMouseDown={(e) => { setIsResizing(true); resizeStart.current = { x: e.screenX, y: e.screenY, w: window.outerWidth, h: window.outerHeight }; }}
                    style={{ WebkitAppRegion: 'no-drag' }}
                    className="absolute bottom-6 right-6 cursor-nwse-resize p-2 text-white/40 hover:text-white"
                ><Maximize2 size={24} /></div>
            )}

            {/* Global Mouse Listener for Drag State */}
            {isResizing && <div className="fixed inset-0 z-[9999] cursor-nwse-resize" onMouseMove={(e) => {
                const w = Math.max(400, resizeStart.current.w + (e.screenX - resizeStart.current.x));
                const h = Math.max(150, resizeStart.current.h + (e.screenY - resizeStart.current.y));
                ipcRenderer?.send('resize-overlay', { width: w, height: h });
            }} onMouseUp={() => setIsResizing(false)} />}
        </div>
    );
}
