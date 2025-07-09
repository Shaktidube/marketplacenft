import React from 'react';
import { NavLink } from 'react-router-dom';

const Sidebar = () => {
  const linkClasses = ({ isActive }) =>
    `block py-3 px-4 rounded-md text-lg font-medium transition duration-200 ease-in-out ${
      isActive
        ? 'bg-gray-700 text-white shadow-md'
        : 'text-gray-300 hover:bg-gray-700 hover:text-white'
    }`;

  return (
    <div className='w-64 bg-black border-r-2 border-gray-700 text-white flex flex-col p-4 shadow-lg h-full'>
      <h2 className='text-3xl font-bold mb-8 text-center text-  -400'>NFT Hub</h2>
      <nav className='flex-grow'>
        <ul>
          <li className='mb-4'>
            <NavLink to="/marketplace/mint" className={linkClasses}>
              Mint NFT
            </NavLink>
          </li>
          <li className='mb-4'>
            <NavLink to="/marketplace/buy-sell" className={linkClasses}>
              Buy & Sell
            </NavLink>
          </li>
          <li className='mb-4'>
            <NavLink to="/marketplace/auction" className={linkClasses}>
              Auction
            </NavLink>
          </li>

        </ul>
      </nav>
      <div className='mt-auto text-center text-gray-500 text-sm'>
        <p>&copy; 2025 NFT Marketplace</p>
      </div>
    </div>
  );
};

export default Sidebar;
