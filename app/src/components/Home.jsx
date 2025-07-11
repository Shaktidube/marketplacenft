import React, { useState, useEffect } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';
import toast from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';

const Home = () => {
  const { publicKey, connected, disconnect } = useWallet();
  const { setVisible } = useWalletModal();
  const navigate = useNavigate();

  const [isHovered, setIsHovered] = useState(false);

  useEffect(() => {
    // Redirect to marketplace if connected
    if (connected && publicKey) {
      console.log("Wallet connected, redirecting to marketplace page.");
      navigate('/marketplace');
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
      // Removed the toast here as the wallet modal typically has its own feedback
    }
  };

  const getButtonText = () => {
    if (connected) {
      return isHovered ? 'Disconnect' : `${publicKey?.toBase58().slice(0, 4)}...${publicKey?.toBase58().slice(-4)}`;
    } else {
      return 'Connect Wallet';
    }
  };

  return (
    // Dynamic gradient background with subtle animation
    <div className='min-h-screen w-screen flex flex-col justify-center items-center bg-gradient-to-br from-gray-900 via-indigo-950 to-purple-950 animate-gradient-shift'>
      <div className="relative z-10 flex flex-col items-center p-8 bg-gray-900/40 backdrop-blur-sm rounded-xl shadow-2xl border border-gray-700/50">
        <h1 className='text-5xl md:text-6xl font-extrabold text-white mb-6 text-center tracking-tight drop-shadow-lg animate-fade-in-up'>
          Welcome to <span className="bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">Solana Marketplace</span>
        </h1>
        <p className='text-lg md:text-xl text-gray-200 text-center max-w-2xl mb-10 opacity-0 animate-fade-in delay-200'>
          Your gateway to creating, trading, and experiencing unique digital assets on the Solana blockchain.
        </p>

        <button
          onClick={handleWalletAction}
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
          className='
            relative
            px-8 py-4 rounded-full
            font-bold text-lg
            bg-gradient-to-br from-blue-500 to-purple-600
            text-white
            shadow-lg
            hover:shadow-2xl
            transform hover:scale-105
            transition-all duration-300 ease-in-out
            overflow-hidden
            group
            border border-transparent
            animate-fade-in delay-400
          '
        >
          {/* Subtle glow effect on hover for the button */}
          <span className="absolute inset-0 bg-white opacity-0 transition-opacity duration-300 group-hover:opacity-10"></span>
          {getButtonText()}
        </button>
      </div>

      {/* Optional: Add some background particles/shapes for extra flair */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden opacity-30">
        <div className="absolute w-24 h-24 bg-blue-500 rounded-full mix-blend-multiply filter blur-xl opacity-70 animate-blob top-1/4 left-1/4"></div>
        <div className="absolute w-32 h-32 bg-purple-500 rounded-full mix-blend-multiply filter blur-xl opacity-70 animate-blob animation-delay-2000 bottom-1/3 right-1/4"></div>
        <div className="absolute w-28 h-28 bg-indigo-500 rounded-full mix-blend-multiply filter blur-xl opacity-70 animate-blob animation-delay-4000 top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2"></div>
      </div>
    </div>
  );
};

export default Home;