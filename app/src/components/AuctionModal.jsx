// src/components/AuctionModal.jsx
import React, { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import { motion, AnimatePresence } from 'framer-motion'; // Import motion for animation

import './AuctionModal.css'; // Your custom CSS for datepicker might be here

const modalVariants = {
  hidden: { opacity: 0, scale: 0.75 },
  visible: { opacity: 1, scale: 1, transition: { duration: 0.2 } },
  exit: { opacity: 0, scale: 0.75, transition: { duration: 0.2 } },
};

const backdropVariants = {  
  hidden: { opacity: 0 },
  visible: { opacity: 1 },
};

// Add isProcessing prop
const AuctionModal = ({ isOpen, onClose, nft, onConfirmAuction, isProcessing }) => {
  const [initialPrice, setInitialPrice] = useState('');
  const [durationSeconds, setDurationSeconds] = useState('100');
  const [startDate, setStartDate] = useState(new Date());
  const [errors, setErrors] = useState({});

  // Reset form fields and errors when modal opens
  useEffect(() => {
    if (isOpen) {
      setInitialPrice('');
      setDurationSeconds('100');
      setStartDate(new Date());
      setErrors({});
    }
  }, [isOpen]);

  // Centralized validation function using a switch case
  const validateField = (fieldName, value) => {
    let error = "";

    switch (fieldName) {
      case "initialPrice":
        if (!value.trim()) {
          error = "Initial price is required.";
        } else {
          // Use a regex to check for valid number format before parsing
          if (!/^\d*\.?\d*$/.test(value)) {
            error = "Invalid price format. Only numbers and one decimal allowed.";
          } else {
            const parsedPrice = parseFloat(value);
            if (isNaN(parsedPrice)) { // Should ideally not happen after regex, but as fallback
              error = "Invalid price. Please enter a number.";
            } else if (parsedPrice <= 0) {
              error = "Price must be greater than zero.";
            }
          }
        }
        break;

      case "durationSeconds":
        if (!value.trim()) {
          error = "Duration is required.";
        } else {
          // Use a regex to check for valid integer format
          if (!/^\d+$/.test(value)) {
            error = "Invalid duration format. Only whole numbers allowed.";
          } else {
            const parsedDuration = parseInt(value);
            if (isNaN(parsedDuration)) { // Should ideally not happen after regex
              error = "Invalid duration. Please enter a whole number.";
            } else if (parsedDuration <= 0) {
              error = "Duration must be at least 1 second.";
            }
          }
        }
        break;

      case "startDate":
        // Value here is a Date object, not a string
        if (!value) {
          error = "Start date and time is required.";
        } else {
          // Give a small grace period for current time, e.g., 5 seconds
          if (value.getTime() < Date.now() - (5 * 1000)) { 
            error = "Start date/time cannot be in the past.";
          }
        }
        break;

      default:
        break;
    }
    return error;
  };

  // Validate the entire form
  const validateForm = () => {
    const newErrors = {
      initialPrice: validateField("initialPrice", initialPrice),
      durationSeconds: validateField("durationSeconds", durationSeconds),
      startDate: validateField("startDate", startDate),
    };
    setErrors(newErrors);

    // Return true if all error messages are empty
    return Object.values(newErrors).every((error) => !error);
  };

  const handleSubmit = (e) => {
    e.preventDefault();

    if (!validateForm()) {
      toast.error("Please correct the errors in the form.");
      return;
    }

    // Prevent submission if already processing
    if (isProcessing) {
      return;
    }

    const parsedInitialPrice = parseFloat(initialPrice);
    const parsedDurationSeconds = parseInt(durationSeconds);

    const auctionStartTime = Math.floor(startDate.getTime() / 1000);

    // onConfirmAuction will handle its own loading and closing
    onConfirmAuction(nft, parsedInitialPrice, auctionStartTime, parsedDurationSeconds);
    // Do NOT call onClose() here. Let onConfirmAuction (in BuySell.js) decide when to close
    // based on the transaction outcome (success/failure).
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className='fixed inset-0 bg-transparent bg-opacity-75 backdrop-blur-lg border-t-2 border-purple-400 border-b-2 flex items-center justify-center z-50 p-4'
          variants={backdropVariants}
          initial="hidden"
          animate="visible"
          exit="hidden"
          onClick={onClose} // Close on backdrop click
        >
          <motion.div
            className='bg-gray-900 rounded-xl shadow-2xl p-8 w-full max-w-md border border-gray-700 animate-scale-in relative' // Added relative for absolute positioning of close button
            variants={modalVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            onClick={(e) => e.stopPropagation()} // Prevent closing when clicking inside the modal
          >
            <button
              onClick={onClose} // Corrected: Call onClose to close the modal
              className='absolute top-4 right-4 text-gray-400 hover:text-white transition-colors duration-200 text-2xl'
              aria-label="Close"
            >
              &times;
            </button>

            <h2 className='text-3xl font-bold text-white mb-6 text-center'>Start New Auction</h2>

            <div className='mb-6 text-center'>
              <img src={nft?.image || 'https://via.placeholder.com/100?text=NFT'} alt={nft?.name} className='w-24 h-24 object-cover rounded-lg mx-auto mb-3 border border-gray-700'/>
              <p className='text-lg font-semibold text-white'>{nft?.name}</p>
            </div>

            <form onSubmit={handleSubmit}>
              <div className='mb-4'>
                <label htmlFor='initialPrice' className='block text-gray-300 text-sm font-semibold mb-2'>
                  Initial Price (SOL)
                </label>
                <input
                  type='text' // Changed to text to better control input for numerical validation
                  id='initialPrice'
                  value={initialPrice}
                  onChange={(e) => {
                    const value = e.target.value;
                    // Allow only numbers and a single decimal point
                    const cleanedValue = value.replace(/[^0-9.]/g, '').replace(/(\..*)\./g, '$1');
                    setInitialPrice(cleanedValue);
                    setErrors(prevErrors => ({ ...prevErrors, initialPrice: validateField("initialPrice", cleanedValue) }));
                  }}
                  placeholder='e.g., 0.1 SOL'
                  className={`w-full p-3 text-white rounded-lg border focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none transition-all duration-200
                    ${errors.initialPrice ? "bg-red-900 border-red-500" : "bg-gray-800 border-gray-700"}`}
                  required
                  disabled={isProcessing} // Disable input while processing
                />
                {errors.initialPrice && (
                  <p className="text-red-400 mt-1 ml-2 text-xs mb-1">{errors.initialPrice}</p>
                )}
              </div>
              
              <div className='mb-4'>
                <label htmlFor='startDate' className='block text-gray-300 text-sm font-semibold mb-2'>
                  Auction Start Date & Time
                </label>
                <DatePicker
                  selected={startDate}
                  onChange={(date) => {
                    setStartDate(date);
                    setErrors(prevErrors => ({ ...prevErrors, startDate: validateField("startDate", date) }));
                  }}
                  showTimeSelect // Enable time selection
                  dateFormat="Pp"
                  timeFormat="HH:mm"
                  timeIntervals={15}
                  minDate={new Date()}
                  className={`w-full p-3 text-white rounded-lg border focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none transition-all duration-200 custom-datepicker-input
                    ${errors.startDate ? "bg-red-900 border-red-500" : "bg-gray-800 border-gray-700"}`} 
                  wrapperClassName="custom-datepicker-wrapper"
                  popperPlacement="top-end"
                  disabled={isProcessing} // Disable date picker while processing
                />
                {errors.startDate && (
                  <p className="text-red-400 mt-1 ml-2 text-xs mb-1">{errors.startDate}</p>
                )}
              </div>

              <div className='mb-6'>
                <label htmlFor='durationSeconds' className='block text-gray-300 text-sm font-semibold mb-2'>
                  Duration (Seconds)
                </label>
                <input
                  type='text' // Changed to text to better control input for numerical validation
                  id='durationSeconds'
                  value={durationSeconds}
                  onChange={(e) => {
                    const value = e.target.value;
                    const cleanedValue = value.replace(/[^0-9]/g, ''); // Allow only digits
                    setDurationSeconds(cleanedValue);
                    setErrors(prevErrors => ({ ...prevErrors, durationSeconds: validateField("durationSeconds", cleanedValue) }));
                  }}
                  placeholder='e.g., 3600 (for 1 hour)'
                  className={`w-full p-3 text-white rounded-lg border focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none transition-all duration-200
                    ${errors.durationSeconds ? "bg-red-900 border-red-500" : "bg-gray-800 border-gray-700"}`} 
                  required
                  disabled={isProcessing} // Disable input while processing
                />
                {errors.durationSeconds && (
                  <p className="text-red-400 mt-1 ml-2 text-xs mb-1">{errors.durationSeconds}</p>
                )}
              </div>

              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                type='submit'
                className={`w-full py-3 rounded-lg font-bold text-lg transition-all duration-300 shadow-md
                  ${isProcessing ? 'bg-gray-600 cursor-not-allowed' : 'bg-gradient-to-r from-purple-600 to-pink-700 hover:from-purple-700 hover:to-pink-800 transform hover:scale-105'}
                `}
                disabled={isProcessing} // Disable button based on processing state
              >
                {isProcessing ? 'Starting Auction...' : 'Start Auction'}
              </motion.button>
            </form>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default AuctionModal;