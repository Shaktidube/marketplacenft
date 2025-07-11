// LiveSell.jsx
import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';


const cardVariants = {
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

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1,
    },
  },
};

function LiveSell() {
  const [listedNfts, setListedNfts] = useState([]);
  const [loading, setLoading] = useState(true);

  console.log("live selll .....");

  useEffect(() => {
    // Load listed NFTs from localStorage on component mount
    const storedListedNfts = localStorage.getItem('listedNfts');
    if (storedListedNfts) {
      try {
        setListedNfts(JSON.parse(storedListedNfts));
      } catch (e) {
        console.error("Failed to parse listed NFTs from localStorage", e);
        setListedNfts([]);
      }
    }
    setLoading(false);
  }, []);

  const handleDelist = (mintAddress) => {
    toast.loading('Delisting NFT...', { id: 'delist-nft' });
    // Simulate delisting action
    setTimeout(() => {
      const updatedListedNfts = listedNfts.filter(nft => nft.mintAddress !== mintAddress);
      setListedNfts(updatedListedNfts);
      localStorage.setItem('listedNfts', JSON.stringify(updatedListedNfts));
      toast.success('NFT delisted successfully!', { id: 'delist-nft' });
      // In a real app, you would also interact with the blockchain to delist
    }, 1000);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-950 to-black text-white flex justify-center items-center">
        <p>Loading listed NFTs...</p>
      </div>
    );
  }

  if (listedNfts.length === 0) {
    return (
      <div className='min-h-screen bg-gradient-to-br from-gray-900 to-black text-white flex flex-col items-center justify-center p-8'>
        <h1 className='text-4xl md:text-5xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 to-pink-500 mb-8 text-center'>
          No NFTs Listed for Sale Yet!
        </h1>
        <p className='text-center text-lg text-gray-400 mt-8 max-w-xl'>
          List your NFTs from your collection to see them here.
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-950 to-black text-white p-8">
      <motion.h1
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className='text-4xl md:text-5xl font-extrabold mb-10 text-center text-transparent bg-clip-text bg-gradient-to-r from-green-400 to-cyan-400'
      >
        NFTs Live for Sale
      </motion.h1>

      <AnimatePresence>
        <motion.div
          className='grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-8'
          variants={containerVariants}
          initial="hidden"
          animate="visible"
        >
          {listedNfts.map((nft) => (
            <motion.div
              key={nft.mintAddress}
              className="bg-gray-800 rounded-lg shadow-xl overflow-hidden transform hover:scale-105 transition-transform duration-300 relative border border-gray-700"
              variants={cardVariants}
              layout // For smooth animation when items are removed
            >
              {nft.image ? (
                <img
                  src={nft.image}
                  alt={nft.name}
                  className="w-full h-48 object-cover"
                />
              ) : (
                <div className="w-full h-48 bg-gray-700 flex items-center justify-center text-gray-400">
                  No Image
                </div>
              )}
              <div className="p-4">
                <h3 className="text-xl font-bold text-white truncate">{nft.name}</h3>
                <p className="text-gray-400 text-sm truncate">{nft.symbol}</p>
                <p className="text-lg font-semibold text-purple-400 mt-2">
                  Price: {nft.sellPrice} SOL
                </p>
                <p className="text-gray-500 text-xs mt-1 break-all">
                  {nft.mintAddress}
                </p>
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => handleDelist(nft.mintAddress)}
                  className="mt-4 w-full bg-red-600 hover:bg-red-700 text-white font-semibold py-2 rounded-md transition-colors duration-200"
                >
                  Delist
                </motion.button>
              </div>
            </motion.div>
          ))}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

export default LiveSell;