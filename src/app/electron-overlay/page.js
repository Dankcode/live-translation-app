'use client';

import { useEffect, useState } from 'react';
import io from 'socket.io-client';

export default function ElectronOverlay() {
    const [subtitle, setSubtitle] = useState({ original: '', translated: '' });
    const [visible, setVisible] = useState(false);

    useEffect(() => {
        const socket = io();

        socket.on('connect', () => {
            console.log('Connected to socket');
        });

        socket.on('receive-subtitle', (data) => {
            setSubtitle(data);
            setVisible(true);

            const timer = setTimeout(() => {
                setVisible(false);
            }, 8000);

            return () => clearTimeout(timer);
        });

        return () => socket.disconnect();
    }, []);

    return (
        <div className={`flex flex-col items-center justify-center h-screen w-screen p-8 transition-opacity duration-500 ${visible ? 'opacity-100' : 'opacity-0'}`}>
            <style jsx global>{`
        body { 
          background: transparent !important; 
          margin: 0; 
          overflow: hidden;
        }
      `}</style>
            <div className="bg-black/40 backdrop-blur-xl rounded-3xl p-8 border border-white/10 shadow-2xl max-w-[90%] text-center">
                <p className="text-blue-400/80 text-sm mb-3 font-bold uppercase tracking-[0.2em]">
                    {subtitle.original}
                </p>
                <p className="text-white text-5xl font-extrabold leading-tight tracking-tight drop-shadow-2xl">
                    {subtitle.translated}
                </p>
            </div>
        </div>
    );
}
