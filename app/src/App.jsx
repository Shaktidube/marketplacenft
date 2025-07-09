import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import './App.css';
import Home from './components/Home';
import Marketplace from './components/Marketplace';
import { WalletConnectionProvider } from './components/WalletProvider';
import { Toaster } from 'react-hot-toast';

function App() {
  return (
    <WalletConnectionProvider>
      <Toaster /> 
      <Router> 
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/marketplace/*" element={<Marketplace />} />
        </Routes>
      </Router>
    </WalletConnectionProvider>
  );
}

export default App;