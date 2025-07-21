// components/NftDetailModal.jsx
import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';

const NftDetailModal = ({ isOpen, onClose, nft }) => {
  if (!isOpen || !nft) return null;

  const handleCopyMintAddress = () => {
    navigator.clipboard.writeText(nft.mintAddress)
      .then(() => {
        toast.success("Mint address copied to clipboard!");
      })
      .catch((err) => {
        console.error("Failed to copy mint address:", err);
        toast.error("Failed to copy mint address.");
      });
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="fixed inset-0 bg-black bg-opacity-80 backdrop-blur-sm flex justify-center items-center z-50 p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <motion.div
            className="bg-gray-800 rounded-xl shadow-2xl border border-purple-600 text-white w-full max-w-4xl max-h-[90vh] flex flex-col md:flex-row overflow-hidden relative"
            initial={{ scale: 0.9, y: 50 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.9, y: 50 }}
            transition={{ type: "spring", stiffness: 200, damping: 20 }}
          >
            {/* Decorative background elements */}
            <div className="absolute top-0 left-1/4 -translate-x-1/2 -translate-y-1/2 w-64 h-64 bg-purple-500 rounded-full opacity-15 blur-2xl"></div>
            <div className="absolute bottom-0 right-1/4 translate-x-1/2 translate-y-1/2 w-52 h-52 bg-blue-500 rounded-full opacity-10 blur-2xl"></div>

            {/* NFT Image Section (Left Half) */}
            <div className="w-full md:w-1/2 p-6 flex items-center justify-center bg-gray-900 relative z-10">
              {nft.image ? (
                <img
                  src={nft.image}
                  alt={nft.name}
                  className="max-w-full max-h-full object-contain rounded-lg shadow-lg border border-gray-700"
                />
              ) : (
                <div className="w-full h-full bg-gray-700 rounded-lg flex items-center justify-center text-gray-400 text-xl font-semibold">
                  No Image
                </div>
              )}
            </div>

            {/* NFT Details Section (Right Half) */}
            <div className="w-full md:w-1/2 p-6 flex flex-col relative z-10 overflow-y-auto custom-scrollbar">
              <h2 className="text-4xl font-extrabold mb-4 text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-purple-400 break-words">
                {nft.name}
              </h2>
              <p className="text-gray-300 text-xl font-semibold mb-2">Symbol: <span className="text-teal-300">{nft.symbol || 'N/A'}</span></p>
              
              <div className="bg-gray-700/50 rounded-lg p-4 mb-4 flex-grow">
                <h3 className="text-gray-200 text-lg font-bold mb-2">Description:</h3>
                <p className="text-gray-400 text-base leading-relaxed overflow-y-auto max-h-36 custom-scrollbar">
                  {nft.description || 'No description available for this NFT.'}
                </p>
              </div>

              <div className="mb-6">
                <p className="text-gray-300 text-sm font-semibold mb-2">Mint Address:</p>
                <div className="flex items-center bg-gray-700 rounded-md p-2">
                  <span className="font-mono text-gray-400 text-sm break-all flex-grow">
                    {nft.mintAddress}
                  </span>
                  <motion.button
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.9 }}
                    onClick={handleCopyMintAddress}
                    className="ml-3 p-2 bg-blue-600 rounded-full text-white text-xs shadow-md hover:bg-blue-700 transition-colors duration-200"
                    aria-label="Copy Mint Address"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 0 012 2m0 0h2a2 0 012 2v3m-7 10h7l-3-3m0 6l3-3" />
                    </svg>
                  </motion.button>
                </div>
              </div>

              <div className="mt-auto flex justify-end">
                <button
                  onClick={onClose}
                  className="px-6 py-2 bg-gradient-to-r from-red-600 to-rose-700 text-white font-bold rounded-md shadow-lg hover:from-red-700 hover:to-rose-800 transition-all duration-300"
                >
                  Close
                </button>
              </div>
            </div>
          </motion.div>
          {/* Custom Scrollbar for Description */}
          <style jsx>{`
            .custom-scrollbar::-webkit-scrollbar {
              width: 8px;
            }
            .custom-scrollbar::-webkit-scrollbar-track {
              background: rgba(0, 0, 0, 0.1);
              border-radius: 10px;
            }
            .custom-scrollbar::-webkit-scrollbar-thumb {
              background-color: #5b21b6; /* purple-700 */
              border-radius: 10px;
              border: 2px solid rgba(0, 0, 0, 0);
            }
            .custom-scrollbar {
              scrollbar-width: thin; /* For Firefox */
              scrollbar-color: #5b21b6 rgba(0, 0, 0, 0.1); /* For Firefox */
            }
          `}</style>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default NftDetailModal;