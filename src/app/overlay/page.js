'use client';

import { useEffect, useState, useRef } from 'react';
import { X, Sparkles, GripVertical, Maximize2 } from 'lucide-react';

const { ipcRenderer } = typeof window !== 'undefined' ? window.require('electron') : { ipcRenderer: null };

export default function OverlayPage() {
    const [subtitleHistory, setSubtitleHistory] = useState([]); // Array of {original, translated}
    const [visible, setVisible] = useState(false);
    const [isClickThrough, setIsClickThrough] = useState(false);
    const [isResizing, setIsResizing] = useState(false);
    const [hasMounted, setHasMounted] = useState(false);
    const resizeStart = useRef({ x: 0, y: 0, w: 0, h: 0 });

    useEffect(() => {
        // Add class to body and html for transparency
        document.body.classList.add('bg-transparent-window');
        document.documentElement.classList.add('bg-transparent-window');
        setHasMounted(true);

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

    if (!hasMounted) return null;

    return (
        <div className={`flex flex-col items-center justify-center h-full w-full p-2 group overflow-hidden transition-all duration-500 hover:bg-slate-900/5 ${isClickThrough ? 'pointer-events-none' : ''}`}>
            <div
                className={`relative bg-black/70 backdrop-blur-3xl rounded-3xl p-8 border-2 
                    ${isClickThrough ? 'border-transparent' : 'border-white/20 group-hover:border-white/40'} 
                    shadow-[0_20px_60px_rgba(0,0,0,0.8)] max-w-[95%] w-full h-full text-center 
                    transform overflow-visible pointer-events-auto
                    ${isResizing ? 'transition-none scale-100' : 'transition-all duration-300 scale-100 group-hover:scale-[1.01]'}`}
                style={{ WebkitAppRegion: isResizing ? 'none' : (isClickThrough ? 'none' : 'drag') }}
            >
                {/* Top-Right Close Button */}
                {!isClickThrough && (
                    <button
                        onClick={handleClose}
                        className="absolute top-4 right-4 p-2 bg-white/5 hover:bg-red-500/20 text-white/40 hover:text-red-400 rounded-xl transition-all duration-300 no-drag z-50 group/close"
                        title="Close Overlay"
                    >
                        <X className="w-5 h-5" />
                    </button>
                )}

                {/* Top-Left Anchor Handle */}
                {!isClickThrough && (
                    <div className="absolute -top-3 -left-3 bg-blue-600 p-1.5 rounded-lg shadow-xl cursor-grab active:cursor-grabbing hover:scale-110 transition-transform">
                        <GripVertical className="w-5 h-5 text-white" />
                    </div>
                )}

                {/* Control Bar (Visible on hover) */}
                <div className="absolute -top-12 left-1/2 -translate-x-1/2 flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity no-drag p-2 bg-slate-900/80 backdrop-blur-xl rounded-2xl border border-white/10 shadow-2xl">
                    <button onClick={() => handleResize('small')} className="p-2 hover:bg-white/10 rounded-xl text-[10px] font-bold uppercase tracking-widest text-slate-400 hover:text-white transition-colors">Small</button>
                    <button onClick={() => handleResize('medium')} className="p-2 hover:bg-white/10 rounded-xl text-[10px] font-bold uppercase tracking-widest text-slate-400 hover:text-white transition-colors">Med</button>
                    <button onClick={() => handleResize('large')} className="p-2 hover:bg-white/10 rounded-xl text-[10px] font-bold uppercase tracking-widest text-slate-400 hover:text-white transition-colors">Large</button>
                    <div className="w-px h-4 bg-white/10 mx-1" />
                    <button
                        onClick={toggleClickThrough}
                        className={`p-2 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-colors flex items-center gap-2 ${isClickThrough ? 'bg-indigo-600 text-white' : 'hover:bg-white/10 text-slate-400'}`}
                    >
                        {isClickThrough ? <Sparkles className="w-3 h-3" /> : null} Mouse Lock
                    </button>
                    <div className="w-px h-4 bg-white/10 mx-1" />
                    <button onClick={handleClose} className="p-2 hover:bg-red-500/20 text-red-400 hover:text-red-300 rounded-xl transition-colors">
                        <X className="w-4 h-4" />
                    </button>
                </div>

                <div className="space-y-4 flex-1 overflow-y-auto pr-4 flex flex-col-reverse custom-scrollbar">
                    {isEmpty ? (
                        <p className="text-white/40 text-xl font-bold italic tracking-tight select-none animate-pulse">
                            Waiting for input...
                        </p>
                    ) : (
                        subtitleHistory.map((sub, idx) => (
                            <div key={idx} className={`space-y-1 transition-all duration-500 ${idx === 0 ? 'opacity-100 scale-100' : 'opacity-40 scale-95'}`}>
                                <p className={`text-white leading-tight tracking-tight drop-shadow-2xl select-none break-words font-extrabold ${idx === 0 ? 'text-2xl' : 'text-lg'}`}>
                                    {sub.translated || sub.original}
                                </p>
                                {sub.translated && sub.original && (
                                    <p className="text-blue-300 text-xs font-bold italic select-none opacity-60">
                                        {sub.original}
                                    </p>
                                )}
                            </div>
                        ))
                    )}
                </div>

                {!isClickThrough && (
                    <div
                        onMouseDown={handleResizeMouseDown}
                        className="absolute -bottom-3 -right-3 bg-indigo-600 p-1.5 rounded-lg shadow-xl cursor-nwse-resize hover:scale-110 transition-transform no-drag z-50"
                    >
                        <Maximize2 className="w-5 h-5 text-white" />
                    </div>
                )}

                {!isClickThrough && !isEmpty && (
                    <div className="absolute -bottom-3 left-1/2 -translate-x-1/2 bg-blue-600/80 text-white text-[9px] px-3 py-1 rounded-full font-bold uppercase tracking-widest shadow-lg opacity-0 group-hover:opacity-100 transition-opacity backdrop-blur-md">
                        Drag to reposition
                    </div>
                )}
            </div>

            <style jsx global>{`
                html, body {
                    background: transparent !important;
                    background-color: transparent !important;
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
                    background: rgba(255, 255, 255, 0.1);
                    border-radius: 10px;
                }
                .custom-scrollbar::-webkit-scrollbar-thumb:hover {
                    background: rgba(255, 255, 255, 0.2);
                }
                .no-drag {
                    -webkit-app-region: no-drag;
                }
            `}</style>
        </div>
    );
}
