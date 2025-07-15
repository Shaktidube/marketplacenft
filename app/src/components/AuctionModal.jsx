// src/components/AuctionModal.jsx
import React, { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import './AuctionModal.css';

const AuctionModal = ({ isOpen, onClose, nft, onConfirmAuction }) => {
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
          const parsedPrice = parseFloat(value);
          if (isNaN(parsedPrice)) {
            error = "Invalid price. Please enter a number.";
          } else if (parsedPrice <= 0) {
            error = "Price must be greater than zero.";
          }
        }
        break;

      case "durationSeconds":
        if (!value.trim()) {
          error = "Duration is required.";
        } else {
          const parsedDuration = parseInt(value);
          if (isNaN(parsedDuration)) {
            error = "Invalid duration. Please enter a whole number.";
          } else if (parsedDuration <= 0) {
            error = "Duration must be at least 1 second.";
          }
        }
        break;

      case "startDate":
        // Value here is a Date object, not a string
        if (!value) { // Should not happen with DatePicker, but good to check
          error = "Start date and time is required.";
        } else if (value.getTime() < Date.now() - (60 * 1000)) { // 1 minute grace period
          error = "Start date/time cannot be in the past.";
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

    const parsedInitialPrice = parseFloat(initialPrice);
    const parsedDurationSeconds = parseInt(durationSeconds);

    const auctionStartTime = Math.floor(startDate.getTime() / 1000);
    const auctionEndTime = auctionStartTime + parsedDurationSeconds;

    console.log("start time : ",auctionStartTime);
    console.log("end time : ",auctionEndTime);

    onConfirmAuction(nft, parsedInitialPrice, auctionStartTime, parsedDurationSeconds);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className='fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50 p-4'>
      <div className='bg-gray-900 rounded-xl shadow-2xl p-8 w-full max-w-md border border-gray-700 animate-scale-in'>
        <div className='flex justify-between items-center mb-6'>
          <h2 className='text-3xl font-bold text-white'>Start New Auction</h2>
          <button
            onClick={onClose}
            className='text-gray-400 hover:text-white transition-colors duration-200'
          >
            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
          </button>
        </div>

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
              type='number'
              id='initialPrice'
              value={initialPrice}
              onChange={(e) => {
                setInitialPrice(e.target.value);
                setErrors(prevErrors => ({ ...prevErrors, initialPrice: validateField("initialPrice", e.target.value) }));
              }}
              step='0.001'
              min='0.001'
              placeholder='e.g., 0.1 SOL'
              className={`w-full p-3 text-white rounded-lg border focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none transition-all duration-200
                ${errors.initialPrice ? "bg-red-900 border-red-500" : "bg-gray-800 border-gray-700"}`}
              required
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
              showTimeSelect
              dateFormat="Pp"
              timeFormat="HH:mm"
              timeIntervals={15}
              minDate={new Date()}
              className={`w-full p-3 text-white rounded-lg border focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none transition-all duration-200 custom-datepicker-input
                ${errors.startDate ? "bg-red-900 border-red-500" : "bg-gray-800 border-gray-700"}`} 
              wrapperClassName="custom-datepicker-wrapper"
              popperPlacement="top-end"
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
              type='number'
              id='durationSeconds'
              value={durationSeconds}
              onChange={(e) => {
                setDurationSeconds(e.target.value);
                setErrors(prevErrors => ({ ...prevErrors, durationSeconds: validateField("durationSeconds", e.target.value) }));
              }}
              min='1'
              placeholder='e.g., 3600 (for 1 hour)'
              className={`w-full p-3 text-white rounded-lg border focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none transition-all duration-200
                ${errors.durationSeconds ? "bg-red-900 border-red-500" : "bg-gray-800 border-gray-700"}`} 
              required
            />
            {errors.durationSeconds && (
              <p className="text-red-400 mt-1 ml-2 text-xs mb-1">{errors.durationSeconds}</p>
            )}
          </div>

          <button
            type='submit'
            className='w-full bg-gradient-to-r from-purple-600 to-pink-700 text-white py-3 rounded-lg font-bold text-lg hover:from-purple-700 hover:to-pink-800 transition-all duration-300 transform hover:scale-105 shadow-md'
          >
            Start Auction
          </button>
        </form>
      </div>
    </div>
  );
};

export default AuctionModal;