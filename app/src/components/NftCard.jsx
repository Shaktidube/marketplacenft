// NftCard.js
import React from 'react';
import { motion } from 'framer-motion';

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

function NftCard({ nft, onSellClick, onAuctionClick }) {
  return (
    <motion.div
      variants={cardVariants}
      whileHover={{
        scale: 1.05, // Slightly more pronounced scale on hover
        boxShadow: "0 15px 25px rgba(0,0,0,0.5), 0 5px 10px rgba(0,0,0,0.3)", // Stronger, more diffused shadow
        zIndex: 10 // Bring to front on hover
      }}
      transition={{ type: "spring", stiffness: 300, damping: 20 }}

      className="nft-card relative bg-gradient-to-br from-gray-800 to-      // Card background and overall stylinggray-900 rounded-xl shadow-2xl overflow-hidden transition-all duration-300 group"
    >
      <div className="relative pt-[100%]"> {/* Placeholder for 1:1 aspect ratio */}
        {nft.image ? (
          <img
            src={nft.image}
            alt={nft.name || 'NFT Image'}
            // Apply blur on group hover, smooth transition
            className="absolute inset-0 w-full h-full object-cover transition-transform duration-300 group-hover:scale-110 group-hover:filter group-hover:blur-sm"
            loading="lazy"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-900 text-gray-500 text-sm italic">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-12 w-12 mb-2 text-gray-600"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
              />
            </svg>
            <span className="text-sm">No Image Available</span>
          </div>
        )}
        
        {/* Actions overlay - This is where the buttons will live */}
        <div className="absolute inset-0 bg-black bg-opacity-70 flex flex-col items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300 p-4">
          <p className="text-white text-center mb-4 text-md font-bold drop-shadow-lg">What would you like to do?</p>
          <div className="flex flex-col space-y-4 w-full px-4"> {/* Increased spacing and added padding */}
            {onSellClick && (
              <motion.button
                whileHover={{ scale: 1.05, boxShadow: "0 0 15px rgba(139, 92, 246, 0.6)" }} // Glow effect
                whileTap={{ scale: 0.95 }}
                onClick={() => onSellClick(nft)}
                className="w-full px-4 py-3 bg-gradient-to-r from-blue-600 to-purple-700 text-white font-semibold rounded-lg shadow-lg hover:from-blue-700 hover:to-purple-800 transition-all duration-300 text-base"
              >
                Put on Sell
              </motion.button>
            )}
            {onAuctionClick && (
              <motion.button
                whileHover={{ scale: 1.05, boxShadow: "0 0 15px rgba(6, 182, 212, 0.6)" }} // Glow effect
                whileTap={{ scale: 0.95 }}
                onClick={() => onAuctionClick(nft)}
                className="w-full px-4 py-3 bg-gradient-to-r from-green-500 to-teal-600 text-white font-semibold rounded-lg shadow-lg hover:from-green-600 hover:to-teal-700 transition-all duration-300 text-base"
              >
                Start Auction
              </motion.button>
            )}
          </div>
        </div>
      </div>
      
      {/* NFT Info Section */}
      <div className="p-4 bg-gradient-to-br from-gray-900 to-black rounded-b-xl border-t border-gray-700"> {/* Darker gradient for info */}
        <h3 className="text-xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-300 to-cyan-300 mb-2 truncate">
          {nft.name || `NFT #${nft.mintAddress.substring(0, 6)}...`}
        </h3>
        <p className="text-gray-400 text-sm mb-3 line-clamp-2">{nft.description || 'No description available.'}</p>
        <div className="flex justify-between items-center text-xs text-gray-500">
          <span>Mint: <span className="font-mono text-gray-300">{nft.mintAddress.substring(0, 4)}...{nft.mintAddress.substring(nft.mintAddress.length - 4)}</span></span>
          {nft.symbol && <span className="px-3 py-1 bg-gray-700 rounded-full text-gray-300 text-xs font-semibold">{nft.symbol}</span>}
        </div>
      </div>
    </motion.div>
  );
}

export default NftCard;