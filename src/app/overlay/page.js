'use client';

import { useEffect, useState, useRef } from 'react';
import { X } from 'lucide-react';
import io from 'socket.io-client';

export default function OverlayPage() {
    const [subtitle, setSubtitle] = useState({ original: '', translated: '' });
    const [visible, setVisible] = useState(false);
    const socketRef = useRef(null);

    useEffect(() => {
        // Add class to body for transparency
        document.body.classList.add('bg-transparent-window');

        // Initialize socket
        socketRef.current = io();

        socketRef.current.on('receive-subtitle', (data) => {
            setSubtitle(data);
            setVisible(true);

            // Auto-hide after 10 seconds of silence
            const timer = setTimeout(() => {
                setVisible(false);
            }, 10000);

            return () => clearTimeout(timer);
        });

        return () => {
            if (socketRef.current) socketRef.current.disconnect();
        };
    }, []);

    const handleClose = () => {
        setVisible(false);
    };

    if (!visible) return null;

    return (
        <div className={`flex flex-col items-center justify-center h-full w-full p-8 group overflow-hidden transition-opacity duration-500 ${visible ? 'opacity-100' : 'opacity-0'} drag-region`}>
            <div
                className="relative bg-black/60 backdrop-blur-2xl rounded-3xl p-8 border-2 border-white/20 shadow-[0_20px_60px_rgba(0,0,0,0.8)] max-w-[95%] w-full text-center transform transition-transform duration-300 scale-100 group-hover:scale-[1.01] overflow-visible"
                style={{ WebkitAppRegion: 'drag' }}
            >
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-blue-600 text-white text-[10px] px-3 py-1 rounded-full font-bold uppercase tracking-widest shadow-lg no-drag">
                    Draggable Overlay
                </div>

                <button
                    onClick={handleClose}
                    className="absolute top-4 right-4 bg-white/10 hover:bg-white/20 text-white/50 hover:text-white rounded-full p-2 opacity-0 group-hover:opacity-100 transition-all border border-white/10 no-drag"
                    title="Close Overlay"
                >
                    <X className="w-5 h-5" />
                </button>

                <div className="space-y-4">
                    <p className="text-blue-400/90 text-sm font-bold uppercase tracking-[0.2em] drop-shadow-sm select-none">
                        {subtitle.original || "Listening..."}
                    </p>
                    <p className="text-white text-4xl font-extrabold leading-tight tracking-tight drop-shadow-2xl select-none break-words">
                        {subtitle.translated}
                    </p>
                </div>

                {/* Resize indicator in corner */}
                <div className="absolute bottom-1 right-1 w-4 h-4 border-r-2 border-b-2 border-white/20 rounded-br-lg opacity-40 select-none group-hover:opacity-100 transition-opacity" />
            </div>

            <style jsx>{`
                .drag-region {
                    cursor: move;
                }
                .no-drag {
                    -webkit-app-region: no-drag;
                    cursor: default;
                }
            `}</style>
        </div>
    );
}
