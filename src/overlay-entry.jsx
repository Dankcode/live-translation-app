import React from 'react'
import ReactDOM from 'react-dom/client'
import OverlayPage from './pages/OverlayPage'
import { I18nProvider } from './lib/i18n'
import './globals.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <I18nProvider>
      <OverlayPage />
    </I18nProvider>
  </React.StrictMode>
)
