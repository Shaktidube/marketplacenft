// NftCard.js
import React, { useState } from 'react';
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

function NftCard({ nft, onSellClick, onAuctionClick, onCardClick }) { // onCardClick is for "View Details"
  const [showActions, setShowActions] = useState(false); // State to control action overlay visibility

  const handleImageClick = (e) => {
    e.stopPropagation(); // Prevent this click from bubbling up to any parent handlers
    setShowActions(!showActions); // Toggle the visibility of the actions overlay
  };

  const handleActionClick = (actionFunction, e) => {
    e.stopPropagation(); // Prevent action button clicks from toggling the overlay
    actionFunction(nft);
    setShowActions(false); // Hide actions after an action is taken
  };

  const handleViewDetailsClick = (e) => {
    e.stopPropagation(); // Prevent this click from toggling the action overlay
    if (onCardClick) {
      onCardClick(nft);
    }
    setShowActions(false); // Hide actions after opening details
  };

  return (
    <motion.div
      variants={cardVariants}
      whileHover={{
        scale: 1.05,
        boxShadow: "0 15px 25px rgba(0,0,0,0.5), 0 5px 10px rgba(0,0,0,0.3)",
        zIndex: 10
      }}
      transition={{ type: "spring", stiffness: 300, damping: 20 }}
      className="nft-card relative bg-gradient-to-br from-gray-800 to-gray-900 rounded-xl shadow-2xl overflow-hidden transition-all duration-300 group"
    >
      <div
        className="relative pt-[100%] cursor-pointer" // This div is the clickable area for toggling actions
        onClick={handleImageClick}
      >
        {nft.image ? (
          <img
            src={nft.image}
            alt={nft.name || 'NFT Image'}
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
        
        {/* Actions overlay */}
        <div
          // Controlled by showActions state for mobile, group-hover for desktop
          className={`absolute inset-0 bg-black bg-opacity-70 flex flex-col items-center justify-center transition-opacity duration-300 p-4
            ${showActions ? 'opacity-100 visible' : 'opacity-0 invisible'} // Use 'visible'/'invisible' for accessibility
            lg:group-hover:opacity-100 lg:group-hover:visible // Desktop hover
          `}
        >
          <p className="text-white text-center mb-4 text-md font-bold drop-shadow-lg">What would you like to do?</p>
          <div className="flex flex-col space-y-4 w-full px-4">
            {onSellClick && (
              <motion.button
                whileHover={{ scale: 1.05, boxShadow: "0 0 15px rgba(139, 92, 246, 0.6)" }}
                whileTap={{ scale: 0.95 }}
                onClick={(e) => handleActionClick(onSellClick, e)}
                className="w-full px-4 py-3 bg-gradient-to-r from-blue-600 to-purple-700 text-white font-semibold rounded-lg shadow-lg hover:from-blue-700 hover:to-purple-800 transition-all duration-300 text-base"
              >
                Put on Sell
              </motion.button>
            )}
            {onAuctionClick && (
              <motion.button
                whileHover={{ scale: 1.05, boxShadow: "0 0 15px rgba(6, 182, 212, 0.6)" }}
                whileTap={{ scale: 0.95 }}
                onClick={(e) => handleActionClick(onAuctionClick, e)}
                className="w-full px-4 py-3 bg-gradient-to-r from-green-500 to-teal-600 text-white font-semibold rounded-lg shadow-lg hover:from-green-600 hover:to-teal-700 transition-all duration-300 text-base"
              >
                Start Auction
              </motion.button>
            )}
            {onCardClick && ( // "View Details" button, triggered by onCardClick
              <motion.button
                whileHover={{ scale: 1.05, boxShadow: "0 0 15px rgba(255, 255, 255, 0.3)" }}
                whileTap={{ scale: 0.95 }}
                onClick={handleViewDetailsClick}
                className="w-full px-4 py-3 bg-gray-600 hover:bg-gray-700 text-white font-semibold rounded-lg shadow-lg transition-all duration-300 text-base mt-2"
              >
                View Details
              </motion.button>
            )}
          </div>
        </div>
      </div>
      
      {/* NFT Info Section */}
      <div className="p-4 bg-transparent bg-opacity-60 bg- rounded-b-xl border-t border-gray-700">
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