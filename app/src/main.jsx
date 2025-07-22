import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { WalletConnectionProvider } from './components/WalletProvider.jsx'
// import { Buffer  } from 'buffer';
import * as buffer from 'buffer'
import process from 'process';
window.process = process; 
window.Buffer = buffer.Buffer;
window.global = window;


createRoot(document.getElementById('root')).render(
  <StrictMode>
    <WalletConnectionProvider>
    <App />

    </WalletConnectionProvider>
  </StrictMode>,
)
