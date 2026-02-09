'use client';

import { useState, useEffect } from 'react';
import { History, Download, Trash2, ArrowLeft, Languages } from 'lucide-react';

export default function HistoryPage() {
    const [history, setHistory] = useState([]);
    const [isHydrated, setIsHydrated] = useState(false);

    useEffect(() => {
        setIsHydrated(true);
        const savedHistory = localStorage.getItem('scribe_transcript_history');
        if (savedHistory) {
            try {
                setHistory(JSON.parse(savedHistory));
            } catch (e) {
                console.error('Failed to parse history:', e);
            }
        }

        // LAN Real-time Sync Logic (WebSocket)
        // Use hostname from the URL to find the Mac host
        const host = typeof window !== 'undefined' ? window.location.hostname : 'localhost';
        const ws = new WebSocket(`ws://${host}:8080`);

        ws.onopen = () => console.log('Connected to Transcript Host');
        ws.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                if (data.type === 'transcript') {
                    setHistory(prev => {
                        let newHistory = [...prev];
                        const existingIndex = newHistory.findIndex(item => item.id === data.id);

                        if (existingIndex !== -1) {
                            // Update existing entry (matched by ID)
                            newHistory[existingIndex] = {
                                ...newHistory[existingIndex],
                                original: data.transcript,
                                translated: data.translated || newHistory[existingIndex].translated,
                                isFinal: data.isFinal,
                                // Preserve the original segment timestamp
                                timestamp: newHistory[existingIndex].timestamp || data.timestamp
                            };
                        } else {
                            // New entry
                            newHistory.unshift({
                                id: data.id,
                                original: data.transcript,
                                translated: data.translated || '',
                                isFinal: data.isFinal,
                                timestamp: data.timestamp || Date.now()
                            });
                        }
                        return newHistory.slice(0, 50);
                    });
                }
            } catch (e) {
                console.error('Sync Error:', e);
            }
        };

        return () => ws.close();
    }, []);

    const clearHistory = () => {
        if (confirm('Are you sure you want to clear all history?')) {
            localStorage.removeItem('scribe_transcript_history');
            setHistory([]);
        }
    };

    const downloadHistory = () => {
        const text = history.map(item => {
            const date = new Date(item.timestamp).toLocaleString();
            return `[${date}]\nOriginal: ${item.original}\nTranslation: ${item.translated}\n-------------------`;
        }).join('\n\n');

        const blob = new Blob([text], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `scribe_history_${new Date().toISOString().split('T')[0]}.txt`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    const formatDate = (timestamp) => {
        if (!isHydrated) return '';
        try {
            return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        } catch (e) {
            return '';
        }
    };

    // Hydration Gate: Critical for Next.js on mobile browsers (avoids white screen crashes)
    if (!isHydrated) return <div className="min-h-screen bg-bg-main" />;

    return (
        <div className="min-h-screen bg-bg-main text-text-main font-sans p-6">
            <div className="max-w-4xl mx-auto space-y-8">
                <header className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <button
                            onClick={() => window.location.href = '/'}
                            className="p-2 hover:bg-bg-hover rounded-full transition-colors"
                        >
                            <ArrowLeft className="w-6 h-6" />
                        </button>
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-accent-primary rounded-xl text-white shadow-lg">
                                <History className="w-6 h-6" />
                            </div>
                            <h1 className="text-2xl font-bold tracking-tight">Translation History</h1>
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        <button
                            onClick={downloadHistory}
                            disabled={history.length === 0}
                            className="flex items-center gap-2 px-4 py-2 bg-bg-card border border-border-color rounded-xl text-xs font-bold uppercase tracking-wider hover:bg-bg-hover transition-all disabled:opacity-50"
                        >
                            <Download className="w-4 h-4" />
                            Export TXT
                        </button>
                        <button
                            onClick={clearHistory}
                            disabled={history.length === 0}
                            className="flex items-center gap-2 px-4 py-2 bg-red-500/10 border border-red-500/20 rounded-xl text-xs font-bold uppercase tracking-wider text-red-500 hover:bg-red-50/20 transition-all disabled:opacity-50"
                        >
                            <Trash2 className="w-4 h-4" />
                            Clear All
                        </button>
                    </div>
                </header>

                <div className="space-y-4">
                    {history.length === 0 ? (
                        <div className="bg-bg-card border border-border-color rounded-3xl p-12 text-center space-y-4">
                            <div className="flex justify-center">
                                <History className="w-16 h-16 text-text-muted opacity-20" />
                            </div>
                            <p className="text-text-muted">No translation history found yet.</p>
                        </div>
                    ) : (
                        history.map((item, idx) => (
                            <div key={idx} className="bg-bg-card border border-border-color rounded-2xl p-6 shadow-sm hover:shadow-md transition-shadow transition-all group animate-in fade-in slide-in-from-bottom-2 duration-300" style={{ animationDelay: `${idx * 20}ms` }}>
                                <div className="flex items-start justify-between mb-4">
                                    <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-text-muted">
                                        <Languages className="w-3 h-3" />
                                        {formatDate(item.timestamp)}
                                    </div>
                                    {item.isFinal === false && (
                                        <span className="flex items-center gap-1.5 text-[10px] font-bold text-accent-primary animate-pulse">
                                            <div className="w-1.5 h-1.5 rounded-full bg-accent-primary" />
                                            Live
                                        </span>
                                    )}
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <div>
                                        <span className="text-[9px] font-black uppercase tracking-widest text-accent-primary opacity-60 block mb-1">Original</span>
                                        <p className="text-sm font-medium leading-relaxed">{item.original}</p>
                                    </div>
                                    <div className="md:border-l md:border-border-color/50 md:pl-6">
                                        <span className="text-[9px] font-black uppercase tracking-widest text-teal-500 opacity-60 block mb-1">Translation</span>
                                        <p className="text-sm font-bold text-text-main leading-relaxed">{item.translated || (item.isFinal === false ? '...' : '')}</p>
                                    </div>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>
        </div>
    );
}
