// SellModal.jsx
import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast'; // Make sure toast is imported

const modalVariants = {
  hidden: { opacity: 0, scale: 0.75 },
  visible: { opacity: 1, scale: 1, transition: { duration: 0.2 } },
  exit: { opacity: 0, scale: 0.75, transition: { duration: 0.2 } },
};

const backdropVariants = {  
  hidden: { opacity: 0 },
  visible: { opacity: 1 },
};

function SellModal({ isOpen, onClose, nft, onConfirmSell }) {
  const [price, setPrice] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [errors, setErrors] = useState({});

  // Centralized validation for the price field
  const validatePrice = (value) => {
    if (!value.trim()) {
      return "Price is required.";
    }
    const parsedPrice = parseFloat(value);
    if (isNaN(parsedPrice)) {
      return "Invalid price. Please enter a number.";
    }
    if (parsedPrice <= 0) { // Price must be positive
      return "Price must be greater than zero.";
    }
    return ""; // No error
  };

  // Validate the entire form
  const validateForm = () => {
    const priceError = validatePrice(price);
    const newErrors = {
      price: priceError,
    };
    setErrors(newErrors);
    // Return true if there are no errors in any field
    return Object.values(newErrors).every((error) => !error);
  };

  // Reset price and errors when modal opens for a new NFT
  useEffect(() => {
    if (isOpen) {
      setPrice('');
      setErrors({}); // Clear errors when modal opens
    }
  }, [isOpen]);

  const handleSubmit = async () => {
    // Validate the form before proceeding
    if (!validateForm()) {
      toast.error("Please correct the errors in the form.");
      return;
    }

    setIsProcessing(true);
    // Call the parent's onConfirmSell function
    await onConfirmSell(nft, parseFloat(price));
    setIsProcessing(false);
    // The parent's onConfirmSell is responsible for closing the modal and showing success/failure toasts
    // For now, we'll keep onClose here, but consider if onConfirmSell should conditionally close
    onClose();
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4"
          variants={backdropVariants}
          initial="hidden"
          animate="visible"
          exit="hidden"
          onClick={onClose}
        >
          <motion.div
            className="bg-gray-800 rounded-lg p-8 w-full max-w-md shadow-2xl relative border border-gray-700"
            variants={modalVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={onClose}
              className="absolute top-4 right-4 text-gray-400 hover:text-white text-2xl"
              aria-label="Close"
            >
              &times;
            </button>

            <h2 className="text-3xl font-bold text-white mb-6 text-center">List for Sale</h2>

            {nft && (
              <div className="flex flex-col items-center mb-6">
                {nft.image ? (
                  <img
                    src={nft.image}
                    alt={nft.name || 'NFT Image'}
                    className="w-32 h-32 object-cover rounded-lg border border-gray-600 shadow-md mb-4"
                  />
                ) : (
                  <div className="w-32 h-32 bg-gray-700 rounded-lg flex items-center justify-center text-gray-400 text-sm mb-4 border border-gray-600">
                    No Image
                  </div>
                )}
                <h3 className="text-xl font-semibold text-white text-center">{nft.name}</h3>
                <p className="text-gray-400 text-sm">{nft.symbol}</p>
                <p className="text-gray-500 text-xs mt-1 break-all">{nft.mintAddress}</p>
              </div>
            )}

            <div className="mb-6">
              <label htmlFor="price" className="block text-gray-300 text-sm font-medium mb-2">
                Selling Price (SOL)
              </label>
              <input
                type="number"
                id="price"
                value={price}
                onChange={(e) => {
                  setPrice(e.target.value);
                  // Optional: Validate on change to provide real-time feedback
                  setErrors(prevErrors => ({ ...prevErrors, price: validatePrice(e.target.value) }));
                }}
                placeholder="e.g., 0.5 SOL"
                className={`w-full p-3 bg-gray-700 text-white rounded-md border focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none
                  ${errors.price ? "border-red-500" : "border-gray-600"}`} 
                step="0.01"
                min="0" // Set min to 0, actual validation for > 0 is in JS
                required
                disabled={isProcessing}
              />
              {errors.price && ( // Display error message if present
                <p className="text-red-400 mt-1 ml-2 text-xs mb-1">{errors.price}</p>
              )}
            </div>

            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={handleSubmit}
              // Removed onSubmit={handleSubmit} from here, it should only be on the <form> tag if present
              className={`w-full py-3 rounded-md font-semibold text-white transition-all duration-200
                ${isProcessing ? 'bg-gray-600 cursor-not-allowed' : 'bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700'}
              `}
              disabled={isProcessing}
            >
              {isProcessing ? 'Processing...' : 'List NFT'}
            </motion.button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export default SellModal;