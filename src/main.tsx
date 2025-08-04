import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './CRMVentapel'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />  // <-- Acá debe decir App, no CRMVentapel
  </React.StrictMode>,
)
