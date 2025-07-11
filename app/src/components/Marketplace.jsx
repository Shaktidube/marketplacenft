import React, { useEffect, useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';
import toast from 'react-hot-toast';
import { useNavigate, Outlet, Routes, Route } from 'react-router-dom';
import Mint from './Mint';
import BuySell from './BuySell';
import Auction from './Auction';
import Sidebar from './SideBar';
import LiveSell from './LiveSell';

const Marketplace = () => {
  const { publicKey, connected, disconnect } = useWallet();
  const { setVisible } = useWalletModal();
  const navigate = useNavigate();

  const [isHovered, setIsHovered] = useState(false); 
  useEffect(() => {
    if (!connected && publicKey === null) {
    //   toast.error("Wallet disconnected or not connected. Redirecting to home.");
      navigate('/'); 
    }
  }, [connected, publicKey, navigate]);

  const handleWalletAction = async () => {
    if (connected) {
      try {
        await disconnect();
        toast.success("Wallet disconnected successfully!");
      } catch (error) {
        console.error("Wallet disconnect error:", error);
        toast.error("Failed to disconnect wallet. Please try again.");
      }
    } else {
      setVisible(true);
      toast('Please select a wallet to connect');
    }
  };

  const getButtonText = () => {
    if (connected) {
      return isHovered ? 'Disconnect' : `${publicKey?.toBase58().slice(0, 4)}...${publicKey?.toBase58().slice(-4)}`;
    } else {
      return 'Connect Wallet';
    }
  };

  // If not connected, show a loading/redirect message or simply let the useEffect handle it
  if (!connected && publicKey === null) {
    return (
      <div className='bg-black h-screen w-screen flex items-center justify-center text-white'>
        <p>Checking wallet connection...</p>
      </div>
    );
  }

  return (
    <div className='flex h-screen bg-gray-800 text-white'>
    
      <Sidebar />

     
      <div className='flex-1 flex flex-col relative'>
       
        <div className='absolute top-4 right-4 z-10'>
          <button
            onClick={handleWalletAction}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
            className='bg-black border-2 mt-2 p-4 text-center rounded-md font-bold from-purple-600 via-pink-400 to-blue-600 bg-gradient-to-r bg-clip-text text-transparent border-amber-50 hover:border-2  hover:border-gray-500 hover:text-white transition duration-300'
          >
            {getButtonText()}
          </button>
        </div>

        <main className='flex-1 p-8 overflow-y-auto'>
          <Routes>
            
            <Route index element={<Mint />} /> 
            <Route path="mint" element={<Mint />} />
            <Route path="buy-sell" element={<BuySell />} />
            <Route path="auction" element={<Auction />} />
            <Route path="live-sell" element={<LiveSell />} />
            
          </Routes>
          <Outlet /> 
        </main>
      </div>
    </div>
  );
};

export default Marketplace;
