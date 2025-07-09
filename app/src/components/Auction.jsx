import React from 'react';
import toast from 'react-hot-toast';

const Auction = () => {
  const handleStartAuction = () => {
    toast.info('Starting auction... (Functionality to be implemented)');
    console.log('Start Auction button clicked');
  };

  const handlePlaceBid = () => {
    toast.info('Placing bid... (Functionality to be implemented)');
    console.log('Place Bid button clicked');
  };

  const handleCancelBid = () => {
    toast.info('Cancelling bid... (Functionality to be implemented)');
    console.log('Cancel Bid button clicked');
  };

  const handleClaimNft = () => {
    toast.info('Claiming NFT... (Functionality to be implemented)');
    console.log('Claim NFT button clicked');
  };

  return (
    <div className='flex flex-col items-center justify-center h-full p-6 bg-gray-800 rounded-lg shadow-xl'>
      <h2 className='text-3xl font-bold mb-6 text-red-300'>NFT Auctions & Bidding</h2>
      <p className='text-lg text-gray-300 mb-8 text-center'>
        Participate in auctions, place bids, or manage your ongoing auctions.
      </p>
      <div className='flex flex-wrap justify-center gap-6'>
        <button
          onClick={handleStartAuction}
          className='bg-gradient-to-r from-red-500 to-purple-600 text-white font-bold py-3 px-8 rounded-lg shadow-lg hover:from-red-600 hover:to-purple-700 transition duration-300 transform hover:scale-105 text-xl'
        >
          Start Auction
        </button>
        <button
          onClick={handlePlaceBid}
          className='bg-gradient-to-r from-teal-400 to-cyan-500 text-white font-bold py-3 px-8 rounded-lg shadow-lg hover:from-teal-500 hover:to-cyan-600 transition duration-300 transform hover:scale-105 text-xl'
        >
          Place Bid
        </button>
        <button
          onClick={handleCancelBid}
          className='bg-gradient-to-r from-gray-500 to-gray-700 text-white font-bold py-3 px-8 rounded-lg shadow-lg hover:from-gray-600 hover:to-gray-800 transition duration-300 transform hover:scale-105 text-xl'
        >
          Cancel Bid
        </button>
        <button
          onClick={handleClaimNft}
          className='bg-gradient-to-r from-indigo-500 to-purple-500 text-white font-bold py-3 px-8 rounded-lg shadow-lg hover:from-indigo-600 hover:to-purple-600 transition duration-300 transform hover:scale-105 text-xl'
        >
          Claim NFT
        </button>
      </div>
    </div>
  );
};

export default Auction;
