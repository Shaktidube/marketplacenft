import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { WalletConnectionProvider } from './components/WalletProvider.jsx'
import { Buffer } from 'buffer';
import process from 'process/browser';
window.process = process; 
window.Buffer = Buffer;
window.global = window;


createRoot(document.getElementById('root')).render(
  <StrictMode>
    <WalletConnectionProvider>
    <App />

    </WalletConnectionProvider>
  </StrictMode>,
)
