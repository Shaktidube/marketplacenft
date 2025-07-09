import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { WalletConnectionProvider } from './components/WalletProvider.jsx'
import { Buffer } from 'buffer';
window.Buffer = Buffer;


createRoot(document.getElementById('root')).render(
  <StrictMode>
    <WalletConnectionProvider>
    <App />

    </WalletConnectionProvider>
  </StrictMode>,
)
