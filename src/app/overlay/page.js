'use client';

import { useEffect, useState, useRef } from 'react';
import { X, Settings, Sparkles, GripVertical, Maximize2, ChevronUp, ChevronDown } from 'lucide-react';

const { ipcRenderer } = typeof window !== 'undefined' ? window.require('electron') : { ipcRenderer: null };

export default function OverlayPage() {
    const [subtitleHistory, setSubtitleHistory] = useState([]); // Array of {original, translated}
    const [visible, setVisible] = useState(false);
    const [isClickThrough, setIsClickThrough] = useState(false);
    const [isResizing, setIsResizing] = useState(false);
    const [hasMounted, setHasMounted] = useState(false);
    const [panelAlpha, setPanelAlpha] = useState(0.75); // 0..1, background opacity
    const [showSettings, setShowSettings] = useState(false);
    const resizeStart = useRef({ x: 0, y: 0, w: 0, h: 0 });
    const scrollContainerRef = useRef(null);
    const settingsPopoverRef = useRef(null);
    const settingsButtonRef = useRef(null);

    useEffect(() => {
        // Add class to body and html for transparency
        document.body.classList.add('bg-transparent-window');
        document.documentElement.classList.add('bg-transparent-window');
        setHasMounted(true);

        try {
            const saved = localStorage.getItem('overlay_panel_alpha');
            if (saved != null) {
                const value = Number(saved);
                if (!Number.isNaN(value)) setPanelAlpha(Math.min(0.95, Math.max(0.15, value)));
            }
        } catch {
            // ignore
        }

        if (ipcRenderer) {
            ipcRenderer.send('set-ignore-mouse', false);

            const subtitleHandler = (event, data) => {
                // data can be a single object or an array
                setSubtitleHistory(prev => {
                    const newItems = Array.isArray(data) ? data : [data];
                    // If the first item in newItems has the same 'id' or content as the first in prev, we might be updating
                    // For now, let's assume the sender manages the 'history' or sends the full list.
                    // But if it's a single update (interim), we should replace the top item.
                    // However, to keep it simple and robust, we'll let page.js send the full history.
                    return newItems;
                });
                setVisible(true);
            };

            ipcRenderer.on('receive-subtitle', subtitleHandler);

            const lockHandler = (event, ignore) => {
                setIsClickThrough(ignore);
            };
            ipcRenderer.on('overlay-lock-status', lockHandler);

            return () => {
                ipcRenderer.removeListener('receive-subtitle', subtitleHandler);
                ipcRenderer.removeListener('overlay-lock-status', lockHandler);
            };
        }
    }, []);

    useEffect(() => {
        if (!showSettings) return;
        const onMouseDown = (e) => {
            const pop = settingsPopoverRef.current;
            const btn = settingsButtonRef.current;
            if (!pop || !btn) return;
            if (pop.contains(e.target) || btn.contains(e.target)) return;
            setShowSettings(false);
        };
        window.addEventListener('mousedown', onMouseDown);
        return () => window.removeEventListener('mousedown', onMouseDown);
    }, [showSettings]);

    const handleClose = () => {
        if (ipcRenderer) ipcRenderer.send('close-overlay');
    };

    const handleResize = (size) => {
        if (!ipcRenderer) return;
        const width = size === 'small' ? 800 : size === 'large' ? 1400 : 1200;
        const height = size === 'small' ? 200 : size === 'large' ? 800 : 600;
        ipcRenderer.send('resize-overlay', { width, height });
    };

    const toggleClickThrough = () => {
        if (ipcRenderer) ipcRenderer.send('set-ignore-mouse', !isClickThrough);
    };

    const handleResizeMouseDown = (e) => {
        if (isClickThrough) return;
        e.preventDefault();
        e.stopPropagation();
        setIsResizing(true);
        resizeStart.current = {
            x: e.screenX,
            y: e.screenY,
            w: window.outerWidth,
            h: window.outerHeight
        };
    };

    useEffect(() => {
        if (!isResizing || !ipcRenderer) return;

        const handleMouseMove = (e) => {
            const deltaX = e.screenX - resizeStart.current.x;
            const deltaY = e.screenY - resizeStart.current.y;
            const newWidth = Math.max(400, resizeStart.current.w + deltaX);
            const newHeight = Math.max(150, resizeStart.current.h + deltaY);
            ipcRenderer.send('resize-overlay', { width: newWidth, height: newHeight });
        };

        const handleMouseUp = () => {
            setIsResizing(false);
        };

        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);
        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };
    }, [isResizing]);

    const isEmpty = subtitleHistory.length === 0 || (subtitleHistory.length === 1 && !subtitleHistory[0].translated && !subtitleHistory[0].original);

    const handleManualScroll = (direction) => {
        if (scrollContainerRef.current) {
            const scrollAmount = 100;
            scrollContainerRef.current.scrollBy({
                top: direction === 'up' ? -scrollAmount : scrollAmount,
                behavior: 'smooth'
            });
        }
    };

    const handlePanelAlphaChange = (value) => {
        const next = Math.min(0.95, Math.max(0.15, Number(value)));
        setPanelAlpha(next);
        try {
            localStorage.setItem('overlay_panel_alpha', String(next));
        } catch {
            // ignore
        }
    };

    if (!hasMounted) return null;

    return (
        <div className={`flex flex-col items-center justify-center h-full w-full p-2 group overflow-hidden transition-all duration-700 ${isClickThrough ? 'pointer-events-none' : ''}`}>
            <div
                className={`relative backdrop-blur-3xl rounded-3xl p-8 border-2
                    ${isClickThrough ? 'border-transparent' : 'border-white/30 hover:border-white/45'}
                    shadow-[0_20px_60px_rgba(0,0,0,0.8)] max-w-[95%] w-full h-full text-center 
                    transform overflow-visible pointer-events-auto flex flex-col
                    transition-all duration-500
                    ${isResizing ? 'transition-none scale-100' : 'scale-100 group-hover:scale-[1.01]'}`}
                style={{
                    WebkitAppRegion: isResizing ? 'none' : (isClickThrough ? 'none' : 'drag'),
                    backgroundColor: `rgba(0,0,0,${panelAlpha})`,
                }}
            >
                {/* Top-Right Close Button */}
                {!isClickThrough && (
                    <div className="absolute top-4 right-4 flex items-center gap-2 no-drag z-50">
                        <button
                            ref={settingsButtonRef}
                            onClick={() => setShowSettings((v) => !v)}
                            className="p-2 bg-white/5 hover:bg-white/10 text-white/60 hover:text-white rounded-xl transition-all duration-300"
                            title="Overlay Settings"
                        >
                            <Settings className="w-5 h-5" />
                        </button>
                        <button
                            onClick={handleClose}
                            className="p-2 bg-white/5 hover:bg-red-500/20 text-white/60 hover:text-red-300 rounded-xl transition-all duration-300"
                            title="Close Overlay"
                        >
                            <X className="w-5 h-5" />
                        </button>
                    </div>
                )}

                {/* Top-Left Anchor Handle */}
                {!isClickThrough && (
                    <div className="absolute -top-3 -left-3 bg-teal-600 p-1.5 rounded-lg shadow-xl cursor-grab active:cursor-grabbing hover:scale-110 transition-all opacity-0 group-hover:opacity-100">
                        <GripVertical className="w-5 h-5 text-white" />
                    </div>
                )}

                {/* Settings Popover */}
                {!isClickThrough && showSettings && (
                    <div
                        ref={settingsPopoverRef}
                        className="absolute top-16 right-4 w-[320px] max-w-[90vw] bg-slate-900/90 backdrop-blur-xl rounded-2xl border border-white/10 shadow-2xl p-4 text-left no-drag z-50"
                        style={{ WebkitAppRegion: 'no-drag' }}
                    >
                        <div className="flex items-center justify-between mb-3">
                            <div className="text-xs font-black uppercase tracking-widest text-white/70">Overlay Settings</div>
                            <button
                                onClick={() => setShowSettings(false)}
                                className="p-1.5 rounded-lg text-white/60 hover:text-white hover:bg-white/10 transition-colors"
                                title="Close Settings"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>

                        <div className="space-y-4">
                            <div className="space-y-2">
                                <div className="flex items-center justify-between">
                                    <span className="text-[10px] font-bold uppercase tracking-widest text-slate-300">Opacity</span>
                                    <span className="text-[10px] font-bold tabular-nums text-slate-400">{Math.round(panelAlpha * 100)}%</span>
                                </div>
                                <input
                                    className="overlay-range w-full"
                                    type="range"
                                    min="0.15"
                                    max="0.95"
                                    step="0.02"
                                    value={panelAlpha}
                                    onChange={(e) => handlePanelAlphaChange(e.target.value)}
                                />
                            </div>

                            <div className="space-y-2">
                                <span className="text-[10px] font-bold uppercase tracking-widest text-slate-300">Size</span>
                                <div className="flex items-center gap-2">
                                    <button onClick={() => handleResize('small')} className="flex-1 p-2 hover:bg-white/10 rounded-xl text-[10px] font-bold uppercase tracking-widest text-slate-300 hover:text-white transition-colors">Small</button>
                                    <button onClick={() => handleResize('medium')} className="flex-1 p-2 hover:bg-white/10 rounded-xl text-[10px] font-bold uppercase tracking-widest text-slate-300 hover:text-white transition-colors">Med</button>
                                    <button onClick={() => handleResize('large')} className="flex-1 p-2 hover:bg-white/10 rounded-xl text-[10px] font-bold uppercase tracking-widest text-slate-300 hover:text-white transition-colors">Large</button>
                                </div>
                            </div>

                            <div className="flex items-center justify-between">
                                <span className="text-[10px] font-bold uppercase tracking-widest text-slate-300">Mouse Lock</span>
                                <button
                                    onClick={toggleClickThrough}
                                    className={`px-3 py-2 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-colors flex items-center gap-2 ${isClickThrough ? 'bg-teal-600 text-white' : 'hover:bg-white/10 text-slate-300 hover:text-white'}`}
                                >
                                    {isClickThrough ? <Sparkles className="w-3 h-3" /> : null}
                                    {isClickThrough ? 'Locked' : 'Unlocked'}
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                <div
                    ref={scrollContainerRef}
                    className="space-y-4 flex-1 overflow-y-auto pr-26 flex flex-col-reverse custom-scrollbar"
                >
                    {isEmpty ? (
                        <p className="text-white/40 text-xl font-bold italic tracking-tight select-none animate-pulse">
                            Waiting for input...
                        </p>
	                    ) : (
	                        subtitleHistory.slice(0, 2).map((sub, idx) => (
	                            <div key={idx} className={`space-y-2 transition-all duration-500 ${idx === 0 ? 'opacity-100 scale-100' : 'opacity-40 scale-95'}`}>
	                                {/* Original Transcription - TOP */}
	                                <p className={`text-white/70 leading-tight tracking-tight drop-shadow-2xl select-none break-words font-bold ${idx === 0 ? 'text-xl' : 'text-base'}`}>
	                                    {sub.original}
	                                </p>

	                                {/* Translation - BOTTOM */}
	                                {sub.translated && (
	                                    <p className={`text-teal-200 font-extrabold select-none break-words leading-tight ${idx === 0 ? 'text-3xl' : 'text-xl'}`}>
	                                        {sub.translated}
	                                    </p>
	                                )}
	                            </div>
	                        ))
	                    )}
                </div>

                {!isClickThrough && (
                    <div
                        onMouseDown={handleResizeMouseDown}
                        className="absolute -bottom-3 -right-3 bg-teal-600 p-1.5 rounded-lg shadow-xl cursor-nwse-resize hover:scale-110 transition-all no-drag z-50 opacity-0 group-hover:opacity-100"
                    >
                        <Maximize2 className="w-5 h-5 text-white" />
                    </div>
                )}

                {/* Manual Scroll Controls */}
                {!isClickThrough && !isEmpty && (
                    <>
                        <div className="absolute right-12 top-12 opacity-0 group-hover:opacity-60 hover:opacity-100 transition-opacity no-drag z-50">
                            <button
                                onClick={() => handleManualScroll('up')}
                                className="p-3 transition-all bg-slate-800/80 hover:bg-slate-700 text-white/50 hover:text-white rounded-2xl border border-white/10 shadow-2xl backdrop-blur-xl scale-90 hover:scale-110 active:scale-95"
                                title="Scroll Up"
                            >
                                <ChevronUp className="w-6 h-6" />
                            </button>
                        </div>
                        <div className="absolute right-12 bottom-12 opacity-0 group-hover:opacity-60 hover:opacity-100 transition-opacity no-drag z-50">
                            <button
                                onClick={() => handleManualScroll('down')}
                                className="p-3 transition-all bg-slate-800/80 hover:bg-slate-700 text-white/50 hover:text-white rounded-2xl border border-white/10 shadow-2xl backdrop-blur-xl scale-90 hover:scale-110 active:scale-95"
                                title="Scroll Down"
                            >
                                <ChevronDown className="w-6 h-6" />
                            </button>
                        </div>
                    </>
                )}

                {!isClickThrough && !isEmpty && (
                    <div className="absolute -bottom-3 left-1/2 -translate-x-1/2 bg-teal-600/80 text-white text-[9px] px-3 py-1 rounded-full font-bold uppercase tracking-widest shadow-lg opacity-0 group-hover:opacity-100 transition-opacity backdrop-blur-md">
                        Drag to reposition
                    </div>
                )}
            </div>

            <style jsx global>{`
                html, body {
                    background: transparent !important;
                    background-color: transparent !important;
                    overflow: hidden !important;
                    margin: 0;
                    padding: 0;
                    height: 100%;
                    width: 100%;
                }
                .no-scrollbar::-webkit-scrollbar {
                    display: none;
                }
                .no-scrollbar {
                    -ms-overflow-style: none;
                    scrollbar-width: none;
                }
                .custom-scrollbar::-webkit-scrollbar {
                    width: 5px;
                }
                .custom-scrollbar::-webkit-scrollbar-track {
                    background: transparent;
                }
                .custom-scrollbar::-webkit-scrollbar-thumb {
                    background: rgba(255, 255, 255, 0.2);
                    border-radius: 10px;
                }
                .custom-scrollbar::-webkit-scrollbar-thumb:hover {
                    background: rgba(255, 255, 255, 0.3);
                }
                .no-drag {
                    -webkit-app-region: no-drag;
                }
                .overlay-range {
                    -webkit-appearance: none;
                    appearance: none;
                    height: 6px;
                    border-radius: 999px;
                    background: rgba(255, 255, 255, 0.18);
                    outline: none;
                }
                .overlay-range::-webkit-slider-thumb {
                    -webkit-appearance: none;
                    appearance: none;
                    width: 14px;
                    height: 14px;
                    border-radius: 999px;
                    background: rgba(45, 212, 191, 1);
                    border: 2px solid rgba(255, 255, 255, 0.75);
                    box-shadow: 0 8px 20px rgba(0, 0, 0, 0.5);
                }
                .overlay-range::-moz-range-thumb {
                    width: 14px;
                    height: 14px;
                    border-radius: 999px;
                    background: rgba(45, 212, 191, 1);
                    border: 2px solid rgba(255, 255, 255, 0.75);
                    box-shadow: 0 8px 20px rgba(0, 0, 0, 0.5);
                }
            `}</style>
        </div>
    );
}
