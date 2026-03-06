import React from 'react'
import ReactDOM from 'react-dom/client'
import SatellitePage from './pages/SatellitePage'
import { I18nProvider } from './lib/i18n'
import './globals.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <I18nProvider>
      <SatellitePage />
    </I18nProvider>
  </React.StrictMode>
)
