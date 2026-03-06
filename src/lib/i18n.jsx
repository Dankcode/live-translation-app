import React, { createContext, useContext, useState, useEffect } from 'react';
import en from '../locales/en.json';
import zh from '../locales/zh.json';

const translations = { en, zh };
const I18nContext = createContext();

const { ipcRenderer } = (typeof window !== 'undefined' && typeof window.require === 'function')
    ? window.require('electron')
    : { ipcRenderer: null };

export function I18nProvider({ children }) {
    const [locale, setLocale] = useState(() => {
        return localStorage.getItem('app_locale') || 'en';
    });

    useEffect(() => {
        localStorage.setItem('app_locale', locale);
        if (ipcRenderer) {
            ipcRenderer.send('sync-interface-language', locale);
        }
    }, [locale]);

    useEffect(() => {
        const handleStorage = (e) => {
            if (e.key === 'app_locale' && e.newValue) {
                setLocale(e.newValue);
            }
        };
        window.addEventListener('storage', handleStorage);

        if (ipcRenderer) {
            const handleSync = (event, newLocale) => {
                setLocale(newLocale);
            };
            ipcRenderer.on('sync-interface-language', handleSync);
            return () => {
                window.removeEventListener('storage', handleStorage);
                ipcRenderer.removeListener('sync-interface-language', handleSync);
            };
        }
        return () => window.removeEventListener('storage', handleStorage);
    }, []);

    const t = (key) => {
        return translations[locale][key] || key;
    };

    return (
        <I18nContext.Provider value={{ locale, setLocale, t }}>
            {children}
        </I18nContext.Provider>
    );
}

export function useTranslation() {
    const context = useContext(I18nContext);
    if (!context) {
        throw new Error('useTranslation must be used within an I18nProvider');
    }
    return context;
}
