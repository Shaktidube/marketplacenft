// src/components/AuctionModal.jsx
import React, { useState } from 'react';
import toast from 'react-hot-toast';

const AuctionModal = ({ isOpen, onClose, nft, onConfirmAuction }) => {
  const [initialPrice, setInitialPrice] = useState('');
  const [durationHours, setDurationHours] = useState('24'); // Default to 24 hours
  // You might want a dedicated start time picker, but for simplicity, we'll assume "now"
  // and just get duration. For a proper start time, you'd use a date/time picker library.

  if (!isOpen) return null;

  const handleSubmit = (e) => {
    e.preventDefault();
    const parsedInitialPrice = parseFloat(initialPrice);
    const parsedDurationHours = parseInt(durationHours);

    if (isNaN(parsedInitialPrice) || parsedInitialPrice <= 0) {
      toast.error('Please enter a valid positive initial price.');
      return;
    }
    if (isNaN(parsedDurationHours) || parsedDurationHours <= 0) {
        toast.error('Please enter a valid positive duration in hours.');
        return;
    }

    // Calculate end time (Unix timestamp in seconds)
    const startTime = Math.floor(Date.now() / 1000); // Current time in seconds
    const endTime = startTime + (parsedDurationHours * 3600); // Add hours in seconds

    onConfirmAuction(nft, parsedInitialPrice, startTime, endTime);
    setInitialPrice('');
    setDurationHours('24');
    onClose();
  };

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
              onChange={(e) => setInitialPrice(e.target.value)}
              step='0.001'
              min='0.001'
              placeholder='e.g., 0.1 SOL'
              className='w-full p-3 bg-gray-800 text-white rounded-lg border border-gray-700 focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none transition-all duration-200'
              required
            />
          </div>
          <div className='mb-6'>
            <label htmlFor='durationHours' className='block text-gray-300 text-sm font-semibold mb-2'>
              Duration (Hours)
            </label>
            <input
              type='number'
              id='durationHours'
              value={durationHours}
              onChange={(e) => setDurationHours(e.target.value)}
              min='1'
              placeholder='e.g., 24'
              className='w-full p-3 bg-gray-800 text-white rounded-lg border border-gray-700 focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none transition-all duration-200'
              required
            />
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