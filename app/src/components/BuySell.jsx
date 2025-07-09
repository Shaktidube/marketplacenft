import React from 'react';
import toast from 'react-hot-toast';

const BuySell = () => {
  const handlePutOnSell = () => {
    toast.info('Putting NFT on sale... (Functionality to be implemented)');
    console.log('Put on Sell button clicked');
  };

  const handleBuy = () => {
    toast.info('Buying NFT... (Functionality to be implemented)');
    console.log('Buy button clicked');
  };

  return (
    <div className='flex flex-col items-center justify-center h-full p-6 bg-gray-800 rounded-lg shadow-xl'>
      <h2 className='text-3xl font-bold mb-6 text-yellow-300'>Buy & Sell NFTs</h2>
      <p className='text-lg text-gray-300 mb-8 text-center'>
        Browse existing NFTs or list your own for sale on the marketplace.
      </p>
      <div className='flex flex-wrap justify-center gap-6'>
        <button
          onClick={handlePutOnSell}
          className='bg-gradient-to-r from-yellow-400 to-orange-500 text-white font-bold py-3 px-8 rounded-lg shadow-lg hover:from-yellow-500 hover:to-orange-600 transition duration-300 transform hover:scale-105 text-xl'
        >
          Put NFT on Sell
        </button>
        <button
          onClick={handleBuy}
          className='bg-gradient-to-r from-purple-500 to-pink-500 text-white font-bold py-3 px-8 rounded-lg shadow-lg hover:from-purple-600 hover:to-pink-600 transition duration-300 transform hover:scale-105 text-xl'
        >
          Buy NFT
        </button>
      </div>
    </div>
  );
};

export default BuySell;
