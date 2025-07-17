// BuySell.js
import React, { useEffect, useState, useCallback } from 'react';
import * as anchor from "@coral-xyz/anchor";
import idl from "../idl/marketplacenft.json";

import { PublicKey, Transaction, SystemProgram, SYSVAR_RENT_PUBKEY } from '@solana/web3.js'; // Added SystemProgram, SYSVAR_RENT_PUBKEY
import { Helius } from 'helius-sdk';
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import toast from 'react-hot-toast';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';
import confetti from 'canvas-confetti';
import { motion, AnimatePresence } from 'framer-motion';
import { Link, useNavigate } from 'react-router-dom';

import NftCard from './NftCard';
import SellModal from './SellModal';
import AuctionModal from './AuctionModal';
import { TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID } from '@solana/spl-token'; 

import { useRef } from 'react';


const HELIUS_API_KEY = "e1ed6bae-c868-4b1b-9b21-e062d5edd982";
const HELIUS_CLUSTER = "devnet";

const helius = new Helius(HELIUS_API_KEY, HELIUS_CLUSTER);
console.log("helius"  ,helius);

// Framer Motion Variants (keep these)
const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1,
    },
  },
};

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

const spinnerVariants = {
  animate: {
    rotate: 360,
    transition: {
      repeat: Infinity,
      duration: 1,
      ease: "linear",
    },
  },
};

const useWalletPopupDetection = () => {
  const [isPopupVisible, setIsPopupVisible] = useState(false);

  useEffect(() => {
    // Adjust selector based on your wallet provider
    const walletPopupSelector = '.sf-wallet-adapter-modal-wrapper'; // Solflare
    // const walletPopupSelector = '.phantom-modal'; // For Phantom

    const observer = new MutationObserver(() => {
      const popup = document.querySelector(walletPopupSelector);
      setIsPopupVisible(!!popup);
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
    });

    return () => observer.disconnect();
  }, []);

  return isPopupVisible;
};

function BuySell() {
  const { connection } = useConnection();
  const { publicKey, wallet, connected } = useWallet();
  const [nfts, setNfts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const { visible:setVisible , setVisible: setModalVisible } = useWalletModal(false);
  const isPopupVisible = useWalletPopupDetection();
  const observerRef = useRef(null);
  const navigate = useNavigate();

  // Pagination states
  const [currentPage, setCurrentPage] = useState(1);
  const [nftsPerPage] = useState(20);
  const [totalNfts, setTotalNfts] = useState(0);

  const [isSellModalOpen, setIsSellModalOpen] = useState(false);
  const [isAuctionModalOpen, setIsAuctionModalOpen] = useState(false);
  const [selectedNft, setSelectedNft] = useState(null);

  // Initialize Anchor provider and program outside of useEffect/handleConfirm functions
  // This ensures `program` is consistent and available
  const provider = new anchor.AnchorProvider(
    connection,
    wallet?.adapter, // Use optional chaining in case wallet.adapter is null initially
    anchor.AnchorProvider.defaultOptions()
  );
  anchor.setProvider(provider);
  const program = new anchor.Program(idl, provider);

  useEffect(() => {
    if (!connected) {
      const timer = setTimeout(() => {
        toast('Please connect your wallet to view your NFTs!', { icon: '👋', id: 'connect-prompt' });
        setVisible(true);
      }, 500);
      return () => clearTimeout(timer);
    } else {
        toast.dismiss('connect-prompt');
    }
  }, [connected, setVisible]);

  useEffect(() => {
    if (nfts.length > 0 && !loading && currentPage === 1) {
      confetti({
        particleCount: 200,
        spread: 270,
        origin: { y:0.6 },
        colors: ['#a864fd', '#29cdff', '#78ff44', '#ff718d', '#fdff6a'],
      });
    }
  }, [nfts, loading, currentPage]);

  const fetchNfts = useCallback(async () => {
  if (!connected || !publicKey) {
    setNfts([]);
    setTotalNfts(0);
    setLoading(false);
    return;
  }

  setLoading(true);
  setError(null);
  toast.loading(`Loading NFTs - Page ${currentPage}...`, { id: 'loading-nfts' });

  try {
    const response = await helius.rpc.getAssetsByOwner({
      ownerAddress: publicKey.toBase58(),
      page: currentPage,
      limit: nftsPerPage,
      sortBy: { sortBy: "created", sortDirection: "desc" }
    });

    console.log("Helius API response:", response); // Log the full response to inspect structure

    if (!response || typeof response.total === 'undefined' || !Array.isArray(response.items)) {
      throw new Error("Invalid response structure from Helius API.");
    }

    setTotalNfts(response.total);

    const storedListedNftsForSale = JSON.parse(localStorage.getItem('listedNftsForSale') || '[]');
    const listedForSaleMintAddresses = new Set(storedListedNftsForSale.map(nft => nft.mintAddress));

    const storedListedNftsForAuction = JSON.parse(localStorage.getItem('listedNftsForAuction') || '[]');
    const listedForAuctionMintAddresses = new Set(storedListedNftsForAuction.map(nft => nft.mintAddress));

    // Map and filter, then potentially fetch metadata if needed
    const processedNftsPromises = response.items
      .filter(item =>
        !listedForSaleMintAddresses.has(item.id) &&
        !listedForAuctionMintAddresses.has(item.id)
      )
      .map(async (item) => {
        let imageUrl = null;

        if (!imageUrl && item.content.json_uri) {
          try {
            const metadataResponse = await fetch(item.content.json_uri);
            if (!metadataResponse.ok) {
              console.warn(`Failed to fetch metadata from ${item.content.json_uri}: HTTP status ${metadataResponse.status}`);
              imageUrl = null;
            } else {
              const fetchedMetadata = await metadataResponse.json();
              if (fetchedMetadata.image) {
                imageUrl = fetchedMetadata.image;
              } else if (fetchedMetadata.properties && fetchedMetadata.properties.files && fetchedMetadata.properties.files.length > 0) {
                const imageFile = fetchedMetadata.properties.files.find(file => file.type && file.type.startsWith('image/'));
                if (imageFile) {
                  imageUrl = imageFile.uri;
                }
              }
            }
          } catch (metadataErr) {
            console.error(`Error fetching/parsing metadata from json_uri for ${item.id}:`, metadataErr);
            imageUrl = null;
          }
        }
  

        return {
          mintAddress: item.id,
          name: item.content.metadata.name || `Unnamed NFT #${item.id.substring(0, 6)}`,
          symbol: item.content.metadata.symbol || '',
          image: imageUrl, // Use the determined image URL
          description: item.content.metadata.description || 'No description available.',
        };
      });

    // Wait for all the async image fetches (if any) to complete
    const fetchedNfts = await Promise.all(processedNftsPromises);

    setNfts(fetchedNfts);
    toast.success(`NFTs loaded successfully! (Page ${currentPage} of ${Math.ceil(response.total / nftsPerPage)})`, { id: 'loading-nfts' });

  } catch (err) {
    console.error("Error fetching Solana NFTs with Helius:", err);
    let userMessage = "Failed to fetch NFTs. Please check your wallet connection or API key.";

    if (err.message.includes('Invalid response structure')) {
      userMessage = "Received an unexpected response from the NFT service. Please try again.";
    } else if (err.message.includes('401') || err.message.includes('Unauthorized')) {
      userMessage = "Invalid Helius API Key or unauthorized access. Please verify your API key.";
    } else if (err.message.includes('429') || err.message.includes('Too Many Requests')) {
      userMessage = "You are being rate-limited by Helius. Please wait a moment and try again.";
    } else if (err.message.includes('Network Error') || err.message.includes('Failed to fetch')) {
      userMessage = "Network error. Please check your internet connection.";
    } 

    setError(userMessage);
    toast.error(userMessage, { id: 'loading-nfts' });
  } finally {
    setLoading(false);
  }
}, [publicKey, connected, currentPage, nftsPerPage]);

  useEffect(() => {
    fetchNfts();
  }, [fetchNfts]);

  const handleSellClick = useCallback((nft) => {
    setSelectedNft(nft);
    setIsSellModalOpen(true);
    setIsAuctionModalOpen(false);
  }, []);

  const handleAuctionClick = useCallback((nft) => {
    setSelectedNft(nft);
    setIsAuctionModalOpen(true);
    setIsSellModalOpen(false);
  }, []);

  const handleConfirmSell = useCallback(async (nft, price) => {
    toast.loading(`Listing ${nft.name} for ${price} SOL...`, { id: 'sell-nft-action' });
    try {
      // Simulate blockchain transaction delay
      // await new Promise(resolve => setTimeout(resolve, 2000)); // Remove if you're doing a real transaction

      const listingPriceInLamports = new anchor.BN(price * anchor.web3.LAMPORTS_PER_SOL);
      console.log("createListing price : ",listingPriceInLamports.toString());
      console.log("nft mint address : " , nft.mintAddress);

      // --- Anchor Instruction Call ---
      const listNftInstruction = await program.methods.createListing(listingPriceInLamports)
        .accounts({
          seller: publicKey, // Use publicKey directly here
          mint: new PublicKey(nft.mintAddress), 
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .instruction();

      const transaction = new Transaction();
      transaction.add(listNftInstruction); // Changed variable name to avoid confusion

      const { blockhash, lastValidBlockHeight } = await provider.connection.getLatestBlockhash('finalized');
      transaction.recentBlockhash = blockhash;
      transaction.lastValidBlockHeight = lastValidBlockHeight;

      transaction.feePayer = publicKey;

      const signedTransaction = await wallet.adapter.signTransaction(transaction);
      const txSign = await provider.connection.sendRawTransaction(signedTransaction.serialize());
      await provider.connection.confirmTransaction(txSign, "confirmed");

      // --- UPDATED: Use 'listedNftsForSale' ---
      const listedNftWithPrice = { ...nft, sellPrice: price, seller: publicKey.toBase58() };
      const storedListedNfts = JSON.parse(localStorage.getItem('listedNftsForSale') || '[]');
      const updatedListedNfts = [...storedListedNfts, listedNftWithPrice];
      localStorage.setItem('listedNftsForSale', JSON.stringify(updatedListedNfts));
      // --- END UPDATED ---

      // Optimistic update: Remove NFT from current page
      setNfts(prevNfts => prevNfts.filter(item => item.mintAddress !== nft.mintAddress));
      setTotalNfts(prevTotal => prevTotal - 1);

      toast.success(`Successfully listed ${nft.name} for ${price} SOL!`, { id: 'sell-nft-action' });
      setIsSellModalOpen(false);
      
      navigate('/marketplace/live-sell'); 

    } catch (error) {
      console.error("Error listing NFT for sale:", error);
      toast.error(`Failed to list ${nft.name}. Error: ${error.message || 'Unknown error'}`, { id: 'sell-nft-action' });
    }
  }, [publicKey, wallet, program, provider, navigate]); // Added dependencies

  const handleConfirmAuction = useCallback(async (nft, initialPrice, startTime, duration) => {
    toast.loading(`Starting auction for ${nft.name}...`, { id: 'auction-nft-action' });
    try {
      // Simulate blockchain transaction delay
      // await new Promise(resolve => setTimeout(resolve, 2000) ); // Remove if doing a real transaction

      // Ensure initialPrice is in lamports and wrapped in BN
      const initialPriceLamports = new anchor.BN(initialPrice * anchor.web3.LAMPORTS_PER_SOL);
      const auctionStartTimeBN = new anchor.BN(startTime); // startTime is already in seconds
      const auctionEndTimeBN = new anchor.BN(startTime + duration); // duration is in seconds, so just add it

      console.log("start time (BN): ", auctionStartTimeBN.toString());
      console.log("initial price (lamports BN): ", initialPriceLamports.toString());
      console.log("duration (seconds): ", duration);
      console.log("end time (BN): ", auctionEndTimeBN.toString());
      console.log("NFT mint address : ", nft.mintAddress);
      console.log("Seller public key : ", publicKey.toBase58());

      // setModalVisible(true);
      // --- Anchor Instruction Call ---
      const startAuctionInstruction = await program.methods.createAuction(
        auctionStartTimeBN,
        initialPriceLamports,
        auctionEndTimeBN, // Pass the calculated end time BN
      )
      .accounts({
        seller: publicKey, // Use publicKey directly here
        nftMint: new PublicKey(nft.mintAddress), // Convert string to PublicKey
        tokenProgram: TOKEN_PROGRAM_ID,
        // Add other accounts required by your Anchor program's `createAuction`
        // Example:
        // sellerTokenAccount: yourSellerTokenAccount,
        // auctionProgramAta: yourAuctionProgramAta,
        // systemProgram: SystemProgram.programId,
        // associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        // rent: SYSVAR_RENT_PUBKEY,
      })
      .instruction();

      const transaction = new Transaction();
      transaction.add(startAuctionInstruction);

      const { blockhash, lastValidBlockHeight } = await provider.connection.getLatestBlockhash('finalized');
      transaction.recentBlockhash = blockhash;
      transaction.lastValidBlockHeight = lastValidBlockHeight;

      transaction.feePayer = publicKey;

      const signedTransaction = await wallet.adapter.signTransaction(transaction);
      const txSign = await provider.connection.sendRawTransaction(signedTransaction.serialize());

      await provider.connection.confirmTransaction(txSign, "confirmed");

      // --- UPDATED: Use 'listedNftsForAuction' ---
      const listedNftForAuction = { 
        ...nft, 
        initialPrice: initialPrice, 
        startTime: startTime, 
        duration: duration, 
        seller: publicKey.toBase58(),
        // Store end time for display if needed
        endTime: startTime + duration,
      };
      const storedListedNftsForAuction = JSON.parse(localStorage.getItem('listedNftsForAuction') || '[]');
      const updatedListedNftsForAuction = [...storedListedNftsForAuction, listedNftForAuction];
      localStorage.setItem('listedNftsForAuction', JSON.stringify(updatedListedNftsForAuction));
      // --- END UPDATED ---

      // Optimistic update: Remove NFT from current page
      setNfts(prevNfts => prevNfts.filter(item => item.mintAddress !== nft.mintAddress));
      setTotalNfts(prevTotal => prevTotal - 1);

      toast.success(`Successfully started auction for ${nft.name}!`, { id: 'auction-nft-action' });
      setIsAuctionModalOpen(false);

      confetti({
        particleCount: 200,
        spread: 270,
        origin: { y:0.6 },
        colors: ['#a864fd', '#29cdff', '#78ff44', '#ff718d', '#fdff6a'],
      });

      navigate('/marketplace/auction');

    } catch (error) {
      console.error("Error starting auction:", error);
      toast.error(`Failed to start auction for ${nft.name}. Error: ${error.message || 'Unknown error'}`, { id: 'auction-nft-action' });
    }
  }, [publicKey, wallet, program, provider, navigate]); // Added dependencies


  // const handleConfirmAuction = useCallback(async (nft, initialPrice, startTime, duration) => {
  //   toast.loading(`Starting auction for ${nft.name}...`, { id: 'auction-nft-action' });
    
  //   // Track wallet popup state
  //   let isPopupOpen = false;
  //   let observer;

  //   try {
  //     // Setup MutationObserver to detect wallet popup
  //     const setupPopupObserver = () => {
  //       observer = new MutationObserver((mutations) => {
  //         mutations.forEach((mutation) => {
  //           const popupElement = document.querySelector('.solflare-wallet-adapter-modal'); // Adjust selector as needed
            
  //           if (popupElement && !isPopupOpen) {
  //             console.log("Wallet popup appeared on screen");
  //             isPopupOpen = true;
  //           } else if (!popupElement && isPopupOpen) {
  //             console.log("Wallet popup disappeared from screen");
  //             isPopupOpen = false;
  //           }
  //         });
  //       });

  //       observer.observe(document.body, {
  //         childList: true,
  //         subtree: true
  //       });
  //     };

  //     setupPopupObserver();

  //     const initialPriceLamports = new anchor.BN(initialPrice * anchor.web3.LAMPORTS_PER_SOL);
  //     const auctionStartTimeBN = new anchor.BN(startTime);
  //     const auctionEndTimeBN = new anchor.BN(startTime + duration);

  //     // Trigger wallet popup
  //     setModalVisible(true);

  //     const startAuctionInstruction = await program.methods.createAuction(
  //       auctionStartTimeBN,
  //       initialPriceLamports,
  //       auctionEndTimeBN,
  //     )
  //     .accounts({
  //       seller: publicKey,
  //       nftMint: new PublicKey(nft.mintAddress),
  //       tokenProgram: TOKEN_PROGRAM_ID,
  //     })
  //     .instruction();

  //     const transaction = new Transaction();
  //     transaction.add(startAuctionInstruction);

  //     const { blockhash, lastValidBlockHeight } = await provider.connection.getLatestBlockhash('finalized');
  //     transaction.recentBlockhash = blockhash;
  //     transaction.lastValidBlockHeight = lastValidBlockHeight;
  //     transaction.feePayer = publicKey;

  //     const signedTransaction = await wallet.adapter.signTransaction(transaction);
  //     const txSign = await provider.connection.sendRawTransaction(signedTransaction.serialize());

  //     await provider.connection.confirmTransaction(txSign, "confirmed");

  //     // ... rest of your success handling code ...

  //   } catch (error) {
  //     console.error("Error starting auction:", error);
  //     toast.error(`Failed to start auction for ${nft.name}. Error: ${error.message || 'Unknown error'}`, { id: 'auction-nft-action' });
  //   } finally {
  //     // Clean up observer
  //     if (observer) observer.disconnect();
  //     setModalVisible(false); // Ensure popup is closed
  //   }
  // }, [publicKey, wallet, program, provider, navigate, setModalVisible]);


  const goToNextPage = () => {
    if (currentPage * nftsPerPage < totalNfts) {
      setCurrentPage(prevPage => prevPage + 1);
    }
  };

  const goToPrevPage = () => {
    if (currentPage > 1) {
      setCurrentPage(prevPage => prevPage - 1);
    }
  };

  const totalPages = Math.ceil(totalNfts / nftsPerPage);

  // Conditional Rendering with Enhanced UI ---
  if (!connected) {
    return (
      <div className='min-h-screen bg-gradient-to-br from-gray-900 to-black text-white flex flex-col items-center justify-center p-8'>
        <motion.h1 
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className='text-5xl md:text-6xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-purple-500 mb-6 text-center'
        >
          Your Solana NFT Vault
        </motion.h1>
        <motion.p 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 0.5 }}
          className='text-xl text-gray-300 text-center max-w-lg'
        >
          Connect your wallet to unlock and view your stunning NFT collection.
        </motion.p>
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => setVisible(true)}
          className="mt-8 px-8 py-3 bg-gradient-to-r from-blue-600 to-purple-600 text-white font-semibold rounded-full shadow-lg hover:shadow-xl transition-all duration-300"
        >
          Connect Wallet
        </motion.button>
        <div className="mt-8">
          <Link to="/marketplace/live-sell" className="text-gray-400 hover:text-gray-300 text-md font-semibold transition-colors duration-200">
            View Live Sales →
          </Link>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className='min-h-screen bg-gradient-to-br  text-white flex flex-col items-center justify-center p-8'>
        <h1 
          className='text-4xl md:text-5xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-green-400 to-teal-500 mb-8 text-center'
        >
          Loading Your Collection
        </h1>
        <motion.div
          className="w-16 h-16 border-4 border-t-4 border-gray-200 border-t-purple-500 rounded-full"
          variants={spinnerVariants}
          animate="animate"
        />
        <p className='text-lg text-gray-400 mt-6 animate-pulse'>Fetching digital assets...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className='min-h-screen bg-gradient-to-br  text-white flex flex-col items-center justify-center p-8'>
        <h1 className='text-4xl md:text-5xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-red-500 to-orange-500 mb-8 text-center'>
          Oops! Something Went Wrong.
        </h1>
        <p className='text-red-400 text-center text-lg mt-4 max-w-xl'>{error}</p>
        <button
          onClick={() => window.location.reload()}
          className="mt-8 px-8 py-3 bg-gradient-to-r from-red-600 to-orange-600 text-white font-semibold rounded-full shadow-lg hover:shadow-xl transition-all duration-300"
        >
          Retry
        </button>
        <div className="mt-8">
          <Link to="/marketplace/live-sell" className="text-gray-400 hover:text-gray-300 text-md font-semibold transition-colors duration-200">
            View Live Sales Instead →
          </Link>
        </div>
      </div>
    );
  }

  const displayNfts = nfts.length > 0;
  const displayNoNftsMessage = !loading && nfts.length === 0 && totalNfts === 0;

  return (
    <div className="min-h-screen bg-gradient-to-br p-8 overflow-y-auto custom-scrollbar-hidden">
      <motion.h1
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className='text-4xl md:text-5xl font-extrabold from-blue-500 to-purple-600 mb-10 text-center bg-clip-text bg-gradient-to-r  '
      >
        Your Digital Assets
      </motion.h1>
      <motion.p
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2, duration: 0.6 }}
        className='text-lg text-gray-300 text-center mb-12'
      >
        Showing NFTs for: <span className="font-mono text-purple-300 break-all">{publicKey ? publicKey.toBase58() : 'Connect Wallet'}</span>
      </motion.p>

      {/* Button to navigate to Live Sell page */}
      <div className="text-center mb-8">
        <Link to="/marketplace/live-sell"
          className="px-6 py-2 bg-gradient-to-r from-teal-500 to-emerald-600 text-white font-semibold rounded-full shadow-lg hover:shadow-xl transition-all duration-300"
        >
          View Live Sales →
        </Link>
        <Link to="/marketplace/auction"
          className="px-6 py-2 bg-gradient-to-r from-orange-500 to-red-600 text-white font-semibold rounded-full shadow-lg hover:shadow-xl transition-all duration-300 ml-4" // Added ml-4 for spacing
        >
          View Live Auctions →
        </Link>
      </div>

      {displayNoNftsMessage ? (
        <div className='flex flex-col items-center justify-center p-8'>
          <h1 className='text-4xl md:text-5xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 to-pink-500 mb-8 text-center'>
            No NFTs In Your Wallet!
          </h1>
          <p className='text-center text-lg text-gray-400 mt-8 max-w-xl'>
            It seems you don't own any NFTs on the {HELIUS_CLUSTER} network that aren't already listed for sale or auction.
          </p>
        </div>
      ) : (
        <>
          {/* NFT Grid */}
          <AnimatePresence>
            <motion.div
              className='grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-8'
              variants={containerVariants}
              initial="hidden"
              animate="visible"
            >
              {nfts.map((nft) => (
                <NftCard
                  key={nft.mintAddress}
                  nft={nft}
                  onSellClick={handleSellClick}
                  onAuctionClick={handleAuctionClick}
                />
              ))}
            </motion.div>
          </AnimatePresence>

          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div className="flex justify-center items-center mt-12 space-x-4">
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={goToPrevPage}
                disabled={currentPage === 1 || loading}
                className={`px-6 py-2 rounded-full font-semibold text-white shadow-md transition-all duration-300
                  ${currentPage === 1 || loading ? 'bg-gray-700 cursor-not-allowed' : 'bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700'}
                `}
              >
                Previous
              </motion.button>
              <span className="text-xl font-medium text-gray-300">
                Page {currentPage} of {totalPages}
              </span>
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={goToNextPage}
                disabled={currentPage === totalPages || loading}
                className={`px-6 py-2 rounded-full font-semibold text-white shadow-md transition-all duration-300
                  ${currentPage === totalPages || loading ? 'bg-gray-700 cursor-not-allowed' : 'bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700'}
                `}
              >
                Next
              </motion.button>
            </div>
          )}
        </>
      )}


      {/* Your Modals */}
      {selectedNft && (
        <>
          <SellModal
            isOpen={isSellModalOpen}
            onClose={() => setIsSellModalOpen(false)}
            nft={selectedNft}
            onConfirmSell={handleConfirmSell}
          />
          <AuctionModal
            isOpen={isAuctionModalOpen}
            onClose={() => setIsAuctionModalOpen(false)}
            nft={selectedNft}
            onConfirmAuction={handleConfirmAuction}
          />
        </>
      )}
      <style jsx>{`
        .custom-scrollbar-hidden {
          -ms-overflow-style: none; /* IE and Edge */
          scrollbar-width: none; /* Firefox */
        }

        .custom-scrollbar-hidden::-webkit-scrollbar {
          display: none; /* Chrome, Safari, Opera */
        }
      `}</style>
    </div>
  );
}

export default BuySell;