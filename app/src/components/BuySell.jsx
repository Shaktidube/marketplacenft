// BuySell.js
import React, { useEffect, useState, useCallback } from 'react';
import { PublicKey } from '@solana/web3.js';
import { Helius } from 'helius-sdk';
import { useWallet } from "@solana/wallet-adapter-react";
import toast from 'react-hot-toast';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';
import confetti from 'canvas-confetti';
import { motion, AnimatePresence } from 'framer-motion';
import { Link, useNavigate } from 'react-router-dom'; // Import Link and useNavigate

import NftCard from './NftCard';
import SellModal from './SellModal';
import AuctionModal from './AuctionModal';


const HELIUS_API_KEY = "e1ed6bae-c868-4b1b-9b21-e062d5edd982"; // Replace with your Helius API Key
const HELIUS_CLUSTER = "devnet"; // Or 'mainnet-beta'

const helius = new Helius(HELIUS_API_KEY, HELIUS_CLUSTER);

// Framer Motion Variants (keep these)
const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1,
    },
  },
};

const cardVariants = { // Keep this for NftCard component
  hidden: { opacity: 0, y: 50, scale: 0.8 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: {
      type: "spring",
      stiffness: 100,
      damping: 10,
    },
  },
};

const spinnerVariants = {
  animate: {
    rotate: 360,
    transition: {
      repeat: Infinity,
      duration: 1,
      ease: "linear",
    },
  },
};

function BuySell() {
  const [nfts, setNfts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const { publicKey, connected } = useWallet();
  const { setVisible } = useWalletModal();
  const navigate = useNavigate(); // Initialize useNavigate

  // Pagination states
  const [currentPage, setCurrentPage] = useState(1);
  const [nftsPerPage] = useState(20);
  const [totalNfts, setTotalNfts] = useState(0);

  const [isSellModalOpen, setIsSellModalOpen] = useState(false);
  const [isAuctionModalOpen, setIsAuctionModalOpen] = useState(false);
  const [selectedNft, setSelectedNft] = useState(null);

  useEffect(() => {
    if (!connected) {
      const timer = setTimeout(() => {
        toast('Please connect your wallet to view your NFTs!', { icon: '👋', id: 'connect-prompt' });
        setVisible(true);
      }, 500);
      return () => clearTimeout(timer);
    } else {
        toast.dismiss('connect-prompt');
    }
  }, [connected, setVisible]);

  useEffect(() => {
    if (nfts.length > 0 && !loading && currentPage === 1) {
      confetti({
        particleCount: 150,
        spread: 180,
        origin: { y: 0.6 },
        colors: ['#a864fd', '#29cdff', '#78ff44', '#ff718d', '#fdff6a'],
      });
    }
  }, [nfts, loading, currentPage]);

  const fetchNfts = useCallback(async () => { // Wrapped fetchNfts in useCallback
      if (!connected || !publicKey) {
        setNfts([]);
        setTotalNfts(0);
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);
      toast.loading(`Loading NFTs - Page ${currentPage}...`, { id: 'loading-nfts' });

      try {
        console.log(`Fetching NFTs for owner: ${publicKey.toBase58()} (Page: ${currentPage}, Limit: ${nftsPerPage})`);
        console.log("Helius API Key (first 5 chars):", HELIUS_API_KEY ? HELIUS_API_KEY.substring(0, 5) + '...' : 'Not set');
        console.log("Helius Cluster:", HELIUS_CLUSTER);

        const response = await helius.rpc.getAssetsByOwner({
          ownerAddress: publicKey.toBase58(),
          page: currentPage,
          limit: nftsPerPage,
          // sortBy: { field: "created", order: "desc" }
        });

        console.log("Helius API Response:", response);

        if (!response || typeof response.total === 'undefined' || !Array.isArray(response.items)) {
          throw new Error("Invalid response structure from Helius API. Response might be undefined or missing 'total'/'items'.");
        }

        setTotalNfts(response.total);

        // Filter out NFTs that are already listed for sale
        const storedListedNfts = JSON.parse(localStorage.getItem('listedNfts') || '[]');
        const listedMintAddresses = new Set(storedListedNfts.map(nft => nft.mintAddress));

        const fetchedNfts = response.items
          .filter(item => !listedMintAddresses.has(item.id)) // Filter out already listed NFTs
          .map(item => ({
            mintAddress: item.id,
            name: item.content.metadata.name || `Unnamed NFT #${item.id.substring(0, 6)}`,
            symbol: item.content.metadata.symbol || '',
            image: item.content.files && item.content.files.length > 0 ? item.content.files[0].uri : null,
            description: item.content.metadata.description || 'No description available.',
          }));
        
        setNfts(fetchedNfts);
        toast.success(`NFTs loaded successfully! (Page ${currentPage} of ${Math.ceil(response.total / nftsPerPage)})`, { id: 'loading-nfts' });

      } catch (err) {
        console.error("Error fetching Solana NFTs with Helius:", err);
        let userMessage = "Failed to fetch NFTs. Please check your wallet connection or API key.";

        if (err.message.includes('Invalid response structure')) {
            userMessage = "Received an unexpected response from the NFT service. Please try again.";
        } else if (err.message.includes('401') || err.message.includes('Unauthorized')) {
            userMessage = "Invalid Helius API Key or unauthorized access. Please verify your API key.";
        } else if (err.message.includes('429') || err.message.includes('Too Many Requests')) {
            userMessage = "You are being rate-limited by Helius. Please wait a moment and try again.";
        } else if (err.message.includes('Network Error') || err.message.includes('Failed to fetch')) {
            userMessage = "Network error. Please check your internet connection.";
        }
        
        setError(userMessage);
        toast.error(userMessage, { id: 'loading-nfts' });
      } finally {
        setLoading(false);
      }
  }, [publicKey, connected, currentPage, nftsPerPage]); // Add dependencies for useCallback

  useEffect(() => {
    fetchNfts();
  }, [fetchNfts]); // Dependency on fetchNfts

  const handleSellClick = useCallback((nft) => {
    setSelectedNft(nft);
    setIsSellModalOpen(true);
    setIsAuctionModalOpen(false);
  }, []);

  const handleAuctionClick = useCallback((nft) => {
    setSelectedNft(nft);
    setIsAuctionModalOpen(true);
    setIsSellModalOpen(false);
  }, []);

  const handleConfirmSell = useCallback(async (nft, price) => {
    toast.loading(`Listing ${nft.name} for ${price} SOL...`, { id: 'sell-nft-action' });
    try {
      // Simulate blockchain transaction
      await new Promise(resolve => setTimeout(resolve, 2000)); 

      // 1. Add NFT to localStorage for 'Live Sell' page
      const listedNftWithPrice = { ...nft, sellPrice: price };
      const storedListedNfts = JSON.parse(localStorage.getItem('listedNfts') || '[]');
      const updatedListedNfts = [...storedListedNfts, listedNftWithPrice];
      localStorage.setItem('listedNfts', JSON.stringify(updatedListedNfts));

      // 2. Remove NFT from current 'Your Digital Assets' page (optimistic update)
      setNfts(prevNfts => prevNfts.filter(item => item.mintAddress !== nft.mintAddress));
      setTotalNfts(prevTotal => prevTotal - 1); // Decrement total count

      toast.success(`Successfully listed ${nft.name} for ${price} SOL!`, { id: 'sell-nft-action' });
      setIsSellModalOpen(false);
      
      // Optional: Navigate to the Live Sell page after listing
      navigate('/marketplace/live-sell'); 

    } catch (error) {
      console.error("Error listing NFT for sale:", error);
      toast.error(`Failed to list ${nft.name}. Error: ${error.message || 'Unknown error'}`, { id: 'sell-nft-action' });
    }
  }, [navigate]); // Add navigate to dependency array

  const handleConfirmAuction = useCallback(async (nft, initialPrice, startTime, endTime) => {
    toast.loading(`Starting auction for ${nft.name}...`, { id: 'auction-nft-action' });
    try {
      // Simulate blockchain transaction
      await new Promise(resolve => setTimeout(resolve, 2000));

      toast.success(`Successfully started auction for ${nft.name}!`, { id: 'auction-nft-action' });
      setIsAuctionModalOpen(false);
    } catch (error) {
      console.error("Error starting auction:", error);
      toast.error(`Failed to start auction for ${nft.name}. Error: ${error.message || 'Unknown error'}`, { id: 'auction-nft-action' });
    }
  }, []);

  const goToNextPage = () => {
    if (currentPage * nftsPerPage < totalNfts) {
      setCurrentPage(prevPage => prevPage + 1);
    }
  };

  const goToPrevPage = () => {
    if (currentPage > 1) {
      setCurrentPage(prevPage => prevPage - 1);
    }
  };

  const totalPages = Math.ceil(totalNfts / nftsPerPage);

  // Conditional Rendering with Enhanced UI ---
  if (!connected) {
    return (
      <div className='min-h-screen bg-gradient-to-br from-gray-900 to-black text-white flex flex-col items-center justify-center p-8'>
        <motion.h1 
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className='text-5xl md:text-6xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-purple-500 mb-6 text-center'
        >
          Your Solana NFT Vault
        </motion.h1>
        <motion.p 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 0.5 }}
          className='text-xl text-gray-300 text-center max-w-lg'
        >
          Connect your wallet to unlock and view your stunning NFT collection.
        </motion.p>
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => setVisible(true)}
          className="mt-8 px-8 py-3 bg-gradient-to-r from-blue-600 to-purple-600 text-white font-semibold rounded-full shadow-lg hover:shadow-xl transition-all duration-300"
        >
          Connect Wallet
        </motion.button>
        <div className="mt-8">
          <Link to="/live-sell" className="text-gray-400 hover:text-gray-300 text-md font-semibold transition-colors duration-200">
            View Live Sales →
          </Link>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className='min-h-screen bg-gradient-to-br from-gray-900 to-black text-white flex flex-col items-center justify-center p-8'>
        <h1 
          className='text-4xl md:text-5xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-green-400 to-teal-500 mb-8 text-center'
        >
          Loading Your Collection
        </h1>
        <motion.div
          className="w-16 h-16 border-4 border-t-4 border-gray-200 border-t-purple-500 rounded-full"
          variants={spinnerVariants}
          animate="animate"
        />
        <p className='text-lg text-gray-400 mt-6 animate-pulse'>Fetching digital assets...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className='min-h-screen bg-gradient-to-br from-gray-900 to-black text-white flex flex-col items-center justify-center p-8'>
        <h1 className='text-4xl md:text-5xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-red-500 to-orange-500 mb-8 text-center'>
          Oops! Something Went Wrong.
        </h1>
        <p className='text-red-400 text-center text-lg mt-4 max-w-xl'>{error}</p>
        <button
          onClick={() => window.location.reload()}
          className="mt-8 px-8 py-3 bg-gradient-to-r from-red-600 to-orange-600 text-white font-semibold rounded-full shadow-lg hover:shadow-xl transition-all duration-300"
        >
          Retry
        </button>
        <div className="mt-8">
          <Link to="/live-sell" className="text-gray-400 hover:text-gray-300 text-md font-semibold transition-colors duration-200">
            View Live Sales Instead →
          </Link>
        </div>
      </div>
    );
  }

  // Adjusted this message to be more accurate if some NFTs are listed, and some aren't
  const displayNfts = nfts.length > 0;
  const displayNoNftsMessage = !loading && nfts.length === 0 && totalNfts === 0;

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-950 to-black text-white p-8">
      <motion.h1
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className='text-4xl md:text-5xl font-extrabold mb-10 text-center text-transparent bg-clip-text bg-gradient-to-r from-gray-300 via-pink-400 to-gray-100'
      >
        Your Digital Assets
      </motion.h1>
      <motion.p
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2, duration: 0.6 }}
        className='text-lg text-gray-300 text-center mb-12'
      >
        Showing NFTs for: <span className="font-mono text-purple-300 break-all">{publicKey ? publicKey.toBase58() : 'Connect Wallet'}</span>
      </motion.p>

      {/* Button to navigate to Live Sell page */}
      <div className="text-center mb-8">
        <Link to="/live-sell"
          className="px-6 py-2 bg-gradient-to-r from-teal-500 to-emerald-600 text-white font-semibold rounded-full shadow-lg hover:shadow-xl transition-all duration-300"
        >
          View Live Sales →
        </Link>
      </div>

      {displayNoNftsMessage ? (
        <div className='flex flex-col items-center justify-center p-8'>
          <h1 className='text-4xl md:text-5xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 to-pink-500 mb-8 text-center'>
            No NFTs In Your Wallet!
          </h1>
          <p className='text-center text-lg text-gray-400 mt-8 max-w-xl'>
            It seems you don't own any NFTs on the {HELIUS_CLUSTER} network that aren't already listed for sale.
          </p>
        </div>
      ) : (
        <>
          {/* NFT Grid */}
          <AnimatePresence>
            <motion.div
              className='grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-8'
              variants={containerVariants}
              initial="hidden"
              animate="visible"
            >
              {nfts.map((nft) => (
                <NftCard
                  key={nft.mintAddress}
                  nft={nft}
                  onSellClick={handleSellClick}
                  onAuctionClick={handleAuctionClick}
                />
              ))}
            </motion.div>
          </AnimatePresence>

          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div className="flex justify-center items-center mt-12 space-x-4">
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={goToPrevPage}
                disabled={currentPage === 1 || loading}
                className={`px-6 py-2 rounded-full font-semibold text-white shadow-md transition-all duration-300
                  ${currentPage === 1 || loading ? 'bg-gray-700 cursor-not-allowed' : 'bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700'}
                `}
              >
                Previous
              </motion.button>
              <span className="text-xl font-medium text-gray-300">
                Page {currentPage} of {totalPages}
              </span>
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={goToNextPage}
                disabled={currentPage === totalPages || loading}
                className={`px-6 py-2 rounded-full font-semibold text-white shadow-md transition-all duration-300
                  ${currentPage === totalPages || loading ? 'bg-gray-700 cursor-not-allowed' : 'bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700'}
                `}
              >
                Next
              </motion.button>
            </div>
          )}
        </>
      )}


      {/* Your Modals */}
      {selectedNft && (
        <>
          <SellModal
            isOpen={isSellModalOpen}
            onClose={() => setIsSellModalOpen(false)}
            nft={selectedNft}
            onConfirmSell={handleConfirmSell}
          />
          <AuctionModal
            isOpen={isAuctionModalOpen}
            onClose={() => setIsAuctionModalOpen(false)}
            nft={selectedNft}
            onConfirmAuction={handleConfirmAuction}
          />
        </>
      )}
    </div>
  );
}

export default BuySell;