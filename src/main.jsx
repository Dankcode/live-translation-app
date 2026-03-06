import React from 'react'
import ReactDOM from 'react-dom/client'
import HomePage from './pages/HomePage'
import { I18nProvider } from './lib/i18n'
import './globals.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <I18nProvider>
      <HomePage />
    </I18nProvider>
  </React.StrictMode>
)
