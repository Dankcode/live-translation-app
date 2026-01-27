'use client';

import { useEffect, useState, useRef } from 'react';
import { X, Sparkles } from 'lucide-react';

const { ipcRenderer } = typeof window !== 'undefined' ? window.require('electron') : { ipcRenderer: null };

export default function OverlayPage() {
    const [subtitle, setSubtitle] = useState({ original: '', translated: '' });
    const [visible, setVisible] = useState(false);
    const [showControls, setShowControls] = useState(false);
    const [isClickThrough, setIsClickThrough] = useState(true);

    const lastTimestampRef = useRef(0);

    useEffect(() => {
        // Add class to body and html for transparency
        document.body.classList.add('bg-transparent-window');
        document.documentElement.classList.add('bg-transparent-window');

        // 1. IPC Listener (for local Electron STT)
        let subtitleHandler;
        if (ipcRenderer) {
            // Default: click-through overlay so main window stays operable.
            ipcRenderer.send('set-ignore-mouse', true);
            subtitleHandler = (event, data) => {
                setSubtitle(data);
                setVisible(true);
            };
            ipcRenderer.on('receive-subtitle', subtitleHandler);
        }

        // 2. API Polling (for Browser Bridge Mode)
        const pollBridge = async () => {
            try {
                const res = await fetch('/api/bridge');
                const data = await res.json();

                // Only update if the data is fresh
                if (data.timestamp > lastTimestampRef.current) {
                    lastTimestampRef.current = data.timestamp;
                    if (data.original || data.translated) {
                        setSubtitle({ original: data.original, translated: data.translated });
                        setVisible(true);
                    } else {
                        // If everything is empty, we might want to clear or keep existing
                        // For now, let's just clear if it's explicitly empty
                        if (data.original === '' && data.translated === '') {
                            setSubtitle({ original: '', translated: '' });
                        }
                    }
                }
            } catch (e) {
                console.error("Bridge poll failed:", e);
            }
        };

        const interval = setInterval(pollBridge, 1000);

        return () => {
            if (ipcRenderer && subtitleHandler) {
                ipcRenderer.removeListener('receive-subtitle', subtitleHandler);
            }
            clearInterval(interval);
        };
    }, []);

    const handleClose = () => {
        if (ipcRenderer) ipcRenderer.send('close-overlay');
        else setVisible(false);
    };

    const handleResize = (size) => {
        if (!ipcRenderer) return;
        const width = size === 'small' ? 800 : size === 'large' ? 1400 : 1200;
        const height = size === 'small' ? 200 : size === 'large' ? 400 : 300;
        ipcRenderer.send('resize-overlay', { width, height });
    };

    const toggleClickThrough = () => {
        const next = !isClickThrough;
        setIsClickThrough(next);
        if (ipcRenderer) ipcRenderer.send('set-ignore-mouse', next);
    };

    if (!visible && !showControls) return null;

    return (
        <div className={`flex flex-col items-center justify-center h-full w-full p-8 group overflow-hidden transition-all duration-500 ${visible || showControls ? 'opacity-100' : 'opacity-0'} ${isClickThrough ? 'pointer-events-none' : 'hover:bg-slate-900/10'}`}>
            <div
                className={`relative bg-black/60 backdrop-blur-3xl rounded-3xl p-8 border-2 ${isClickThrough ? 'border-transparent' : 'border-white/20 group-hover:border-white/40'} shadow-[0_20px_60px_rgba(0,0,0,0.8)] max-w-[95%] w-full text-center transform transition-all duration-300 scale-100 group-hover:scale-[1.01] overflow-visible pointer-events-auto`}
                style={{ WebkitAppRegion: isClickThrough ? 'none' : 'drag' }}
            >
                {/* Control Bar (Visible on hover) */}
                <div className="absolute -top-12 left-1/2 -translate-x-1/2 flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity no-drag p-2 bg-slate-900/80 backdrop-blur-xl rounded-2xl border border-white/10 shadow-2xl">
                    <button
                        onClick={() => handleResize('small')}
                        className="p-2 hover:bg-white/10 rounded-xl text-[10px] font-bold uppercase tracking-widest text-slate-400 hover:text-white transition-colors"
                    >
                        Small
                    </button>
                    <button
                        onClick={() => handleResize('medium')}
                        className="p-2 hover:bg-white/10 rounded-xl text-[10px] font-bold uppercase tracking-widest text-slate-400 hover:text-white transition-colors"
                    >
                        Med
                    </button>
                    <button
                        onClick={() => handleResize('large')}
                        className="p-2 hover:bg-white/10 rounded-xl text-[10px] font-bold uppercase tracking-widest text-slate-400 hover:text-white transition-colors"
                    >
                        Large
                    </button>
                    <div className="w-px h-4 bg-white/10 mx-1" />
                    <button
                        onClick={toggleClickThrough}
                        className={`p-2 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-colors flex items-center gap-2 ${isClickThrough ? 'bg-indigo-600 text-white' : 'hover:bg-white/10 text-slate-400'}`}
                        title="Click Through Mode (Ignore Mouse)"
                    >
                        {isClickThrough ? <Sparkles className="w-3 h-3" /> : null} Mouse Lock
                    </button>
                    <div className="w-px h-4 bg-white/10 mx-1" />
                    <button
                        onClick={handleClose}
                        className="p-2 hover:bg-red-500/20 text-red-400 hover:text-red-300 rounded-xl transition-colors"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>

                <div className="space-y-4">
                    <p className="text-white text-4xl font-extrabold leading-tight tracking-tight drop-shadow-2xl select-none break-words">
                        {subtitle.translated || subtitle.original || "..."}
                    </p>
                    {subtitle.translated && subtitle.original && (
                        <div className="pt-2 border-t border-white/10">
                            <p className="text-blue-300 text-xl font-bold italic select-none opacity-80">
                                {subtitle.original}
                            </p>
                        </div>
                    )}
                </div>

                {!isClickThrough && (
                    <div className="absolute -bottom-3 left-1/2 -translate-x-1/2 bg-blue-600/80 text-white text-[9px] px-3 py-1 rounded-full font-bold uppercase tracking-widest shadow-lg opacity-0 group-hover:opacity-100 transition-opacity backdrop-blur-md">
                        Draggable Region
                    </div>
                )}
            </div>

            <style jsx global>{`
                html, body {
                    background: transparent !important;
                    background-color: transparent !important;
                }
                main {
                    background: transparent !important;
                }
            `}</style>
            <style jsx>{`
                .no-drag {
                    -webkit-app-region: no-drag;
                }
            `}</style>
        </div>
    );
}
