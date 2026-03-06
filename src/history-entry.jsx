import React from 'react'
import ReactDOM from 'react-dom/client'
import HistoryPage from './pages/HistoryPage'
import { I18nProvider } from './lib/i18n'
import './globals.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <I18nProvider>
      <HistoryPage />
    </I18nProvider>
  </React.StrictMode>
)
