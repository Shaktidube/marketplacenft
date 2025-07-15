import React from 'react';
import { NavLink } from 'react-router-dom';

const Sidebar = () => {
  const linkClasses = ({ isActive }) =>
    `relative flex items-center py-3 px-5 rounded-xl text-lg font-semibold transition-all duration-300 ease-in-out transform
     ${
       isActive
         ? 'bg-gradient-to-r from-blue-600 to-purple-700 text-white shadow-2xl translate-x-3 ring-2 ring-indigo-500/50' // Active link: Blue-to-Purple gradient, slightly stronger ring
         : 'text-gray-300 hover:bg-gray-800 hover:text-blue-200 hover:shadow-xl hover:translate-x-2' // Enhanced hover effect, text slightly lighter for contrast
     }`;

  return (
    <div className='w-72 bg-gray-900 border-r-2 border-gray-800 text-white flex flex-col p-6 shadow-2xl h-full transition-all duration-300 ease-in-out'>
      {/* Dynamic Header with subtle animation */}
      <h2 className='text-4xl font-extrabold mb-12 text-center text-blue-400 tracking-wide animate-pulse-light'>
        Marketplace
      </h2>

      <nav className='flex-grow'>
        <ul>
          <li className='mb-5 group'>
            <NavLink to="/marketplace/mint" className={linkClasses}>
              <svg className="w-7 h-7 mr-4 text-indigo-300 group-hover:text-blue-100 transition-colors duration-300" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3-.895 3-2-1.343-2-3-2zM12 14c-4 0-8 3-8 4v1h16v-1c0-1-4-4-8-4z"></path></svg>
              Mint Assets
              <span className="absolute bottom-0 left-0 w-0 h-0.75 bg-indigo-400 transition-all duration-300 group-hover:w-full group-hover:scale-x-100 origin-left"></span>
            </NavLink>
          </li>
          <li className='mb-5 group'>
            <NavLink to="/marketplace/buy-sell" className={linkClasses}>
              <svg className="w-7 h-7 mr-4 text-indigo-300 group-hover:text-blue-100 transition-colors duration-300" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 10h18M7 15h10m-9-6h8m4 0h-4M7 9v6m10-6v6M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"></path></svg>
              Your NFT
              <span className="absolute bottom-0 left-0 w-0 h-0.75 bg-indigo-400 transition-all duration-300 group-hover:w-full group-hover:scale-x-100 origin-left"></span>
            </NavLink>
          </li>
          {/* NEW LIVE SALES LINK */}
          <li className='mb-5 group'>
            <NavLink to="/marketplace/live-sell" className={linkClasses}>
              <svg className="w-7 h-7 mr-4 text-indigo-300 group-hover:text-blue-100 transition-colors duration-300" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path></svg> {/* Example icon: Lightning bolt */}
              Live Sales
              <span className="absolute bottom-0 left-0 w-0 h-0.75 bg-indigo-400 transition-all duration-300 group-hover:w-full group-hover:scale-x-100 origin-left"></span>
            </NavLink>
          </li>
          <li className='mb-5 group'>
            <NavLink to="/marketplace/auction" className={linkClasses}>
              <svg className="w-7 h-7 mr-4 text-indigo-300 group-hover:text-blue-100 transition-colors duration-300" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14.752 11.168l-3.197 3.197m0 0l-3.197-3.197m3.197 3.197v4.5m0 0H5.5m9 0h-9m11.5-6.5a7 7 0 10-14 0 7 7 0 0014 0z"></path></svg>
              Live Auctions
              <span className="absolute bottom-0 left-0 w-0 h-0.75 bg-indigo-400 transition-all duration-300 group-hover:w-full group-hover:scale-x-100 origin-left"></span>
            </NavLink>
          </li>
        </ul>
      </nav>

      <div className='mt-auto text-center text-gray-500 text-xs py-5 border-t border-gray-800 opacity-70'>
        <p>&copy; 2025 Marketplace. All rights reserved.</p>
      </div>
    </div>
  );
};

export default Sidebar;