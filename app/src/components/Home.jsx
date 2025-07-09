import React, { useState,useEffect } from 'react'; // Import useState
import { useWallet } from '@solana/wallet-adapter-react';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';
import toast from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';


const Home = () => {
  const { publicKey, connected, disconnect } = useWallet();
  const { setVisible } = useWalletModal();

  const navigate = useNavigate();

  const [isHovered, setIsHovered] = useState(false);

  console.log("Home.jsx is rendering. Connected:", connected);

  useEffect(() => {
    if(connected && publicKey){
      console.log("redirecting to marketplace page");
      navigate('/marketplace');
    }
  }, [connected,publicKey,navigate]);
  

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
      toast('Please select wallet');
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
    <div className='bg-black h-screen w-screen flex flex-col justify-center items-center'>
        <p className='font-bold text-white align-middle text-center'>Welcome to Nft marketplace</p>

        <button
          onClick={handleWalletAction}
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
          className='bg-black border-2 mt-2 p-4 text-center rounded-md font-bold from-purple-600 via-pink-400 to-blue-600 bg-gradient-to-r bg-clip-text text-transparent border-amber-50 hover:border-2  hover:border-gray-500 hover:text-white transition duration-300'
        >
          {getButtonText()}
        </button>
    </div>
  );
};

export default Home;