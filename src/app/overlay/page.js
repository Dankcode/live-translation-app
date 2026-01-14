'use client';

import { useEffect, useState } from 'react';
import { X } from 'lucide-react';

export default function OverlayPage() {
    const [subtitle, setSubtitle] = useState({ original: '', translated: '' });
    const [visible, setVisible] = useState(false);

    useEffect(() => {
        // Add class to body for transparency
        document.body.classList.add('bg-transparent-window');

        if (window.electronAPI) {
            window.electronAPI.onSubtitleData((data) => {
                setSubtitle(data);
                setVisible(true);

                // Auto-hide after 10 seconds of silence (increased for better dev experience)
                const timer = setTimeout(() => {
                    setVisible(false);
                }, 10000);

                return () => clearTimeout(timer);
            });
        }
    }, []);

    const handleClose = () => {
        setVisible(false);
        if (window.electronAPI) {
            window.electronAPI.toggleOverlay(false);
        }
    };

    if (!visible) return null;

    return (
        <div className={`flex flex-col items-center justify-center h-full w-full p-8 group overflow-hidden transition-opacity duration-500 ${visible ? 'opacity-100' : 'opacity-0'}`}>
            <div className="relative bg-black/40 backdrop-blur-xl rounded-3xl p-8 border border-white/10 shadow-[0_20px_50px_rgba(0,0,0,0.5)] max-w-[85%] text-center transform transition-transform duration-300 scale-100 group-hover:scale-[1.02]">
                <button
                    onClick={handleClose}
                    className="absolute top-4 right-4 bg-white/10 hover:bg-white/20 text-white/50 hover:text-white rounded-full p-2 opacity-0 group-hover:opacity-100 transition-all border border-white/10"
                    title="Close Overlay"
                >
                    <X className="w-5 h-5" />
                </button>
                <p className="text-blue-400/80 text-sm mb-3 font-bold uppercase tracking-[0.2em] drop-shadow-sm">
                    {subtitle.original || "Listening..."}
                </p>
                <p className="text-white text-5xl font-extrabold leading-tight tracking-tight drop-shadow-2xl">
                    {subtitle.translated}
                </p>
            </div>
        </div>
    );
}
