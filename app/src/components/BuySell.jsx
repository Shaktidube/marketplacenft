// BuySell.js
import React, { useEffect, useState, useCallback } from 'react';
import * as anchor from "@coral-xyz/anchor"; // Still needed for anchor.BN and anchor.web3.LAMPORTS_PER_SOL
import { PublicKey, Transaction, SystemProgram, SYSVAR_RENT_PUBKEY } from '@solana/web3.js';
import { useWallet } from "@solana/wallet-adapter-react"; // Keep useWallet for 'wallet' and 'connected'
import toast from 'react-hot-toast';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';
import confetti from 'canvas-confetti';
import { motion, AnimatePresence } from 'framer-motion';
import { Link, useNavigate } from 'react-router-dom';

import NftCard from './NftCard';
import SellModal from './SellModal';
import AuctionModal from './AuctionModal';
import NftDetailModal from './NftDetailModal'; // Ensure this is imported
import { TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID } from '@solana/spl-token';

import { useSolanaProgram } from '../contexts/SolanaProgramContext'; // Import the context hook
import { fetchAllDigitalAssetByOwner } from '@metaplex-foundation/mpl-token-metadata';
import { toWeb3JsPublicKey } from '@metaplex-foundation/umi-web3js-adapters';

// Framer Motion Variants
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

// Custom hook for wallet popup detection (can remain here)
const useWalletPopupDetection = () => {
  const [isPopupVisible, setIsPopupVisible] = useState(false);

  useEffect(() => {
    const walletPopupSelector = '.sf-wallet-adapter-modal-wrapper';
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
  // Destructure from the context hook
  const { program, provider, helius, umi,connection, connected, publicKey } = useSolanaProgram();
  const { wallet } = useWallet(); // Still need wallet object for adapter access

  const [nfts, setNfts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const { setVisible } = useWalletModal(); // For opening the wallet modal manually
  const navigate = useNavigate();
  const walletPopupVisible = useWalletPopupDetection(); // Using the custom hook

  // Pagination states
  const [currentPage, setCurrentPage] = useState(1);
  const [nftsPerPage] = useState(20);
  const [totalNfts, setTotalNfts] = useState(0);

  // States for Modals
  const [isSellModalOpen, setIsSellModalOpen] = useState(false);
  const [isAuctionModalOpen, setIsAuctionModalOpen] = useState(false);
  const [selectedNft, setSelectedNft] = useState(null); // Used for Sell/Auction modals

  // New states for NFT Detail Modal
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [selectedNftForDetail, setSelectedNftForDetail] = useState(null);

  // Refined useEffect for wallet connection prompt
  useEffect(() => {
    if (!connected) {
      const timer = setTimeout(() => {
        toast('Please connect your wallet to view your NFTs!', { icon: '👋', id: 'connect-prompt' });
        // Removed setVisible(true) from here to avoid auto-opening modal
      }, 500);
      return () => clearTimeout(timer);
    } else {
      toast.dismiss('connect-prompt');
    }
  }, [connected]); // Dependency array updated

  useEffect(() => {
    if (nfts.length > 0 && !loading && currentPage === 1) {
      confetti({
        particleCount: 200,
        spread: 270,
        origin: { y: 0.6 },
        colors: ['#a864fd', '#29cdff', '#78ff44', '#ff718d', '#fdff6a'],
      });
    }
  }, [nfts, loading, currentPage]);

  const fetchNfts = useCallback(async () => {
    // Ensure necessary context values are available
    if (!connected || !publicKey || !umi) { // Check for umi instead of helius
      setNfts([]);
      setTotalNfts(0);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    toast.loading(`Loading NFTs - Page ${currentPage}...`, { id: 'loading-nfts' });

    try {
      // Use Umi's fetchAllDigitalAssetByOwner
      // Note: This fetches ALL NFTs, pagination is done client-side.
      const allDigitalAssets = await fetchAllDigitalAssetByOwner(umi, publicKey );

      console.log("Umi fetchAllDigitalAssetByOwner response (full list):", allDigitalAssets);

      if (!allDigitalAssets || !Array.isArray(allDigitalAssets)) {
        throw new Error("Invalid response structure from Umi fetchAllDigitalAssetByOwner.");
      }

      // Set total NFTs based on the full list length
      setTotalNfts(allDigitalAssets.length);

      const storedListedNftsForSale = JSON.parse(localStorage.getItem('listedNftsForSale') || '[]');
      const listedForSaleMintAddresses = new Set(storedListedNftsForSale.map(nft => nft.mintAddress));

      const storedListedNftsForAuction = JSON.parse(localStorage.getItem('listedNftsForAuction') || '[]');
      const listedForAuctionMintAddresses = new Set(storedListedNftsForAuction.map(nft => nft.mintAddress));

      // Filter out listed NFTs *before* pagination
      const unlistedDigitalAssets = allDigitalAssets.filter(asset =>
        !listedForSaleMintAddresses.has(toWeb3JsPublicKey(asset.publicKey).toBase58()) &&
        !listedForAuctionMintAddresses.has(toWeb3JsPublicKey(asset.publicKey).toBase58())
      );

      // Apply client-side pagination to the unlisted NFTs
      const startIndex = (currentPage - 1) * nftsPerPage;
      const endIndex = startIndex + nftsPerPage;
      const paginatedDigitalAssets = unlistedDigitalAssets.slice(startIndex, endIndex);

      const processedNftsPromises = paginatedDigitalAssets.map(async (asset) => {
    let imageUrl = null;
    let description = asset.metadata.description || 'No description available.';

    // Define a function to transform IPFS URLs
    const transformIpfsUrl = (url) => {
        if (!url) return null;
        // Check if it's a Pinata public gateway URL
        if (url.startsWith('https://gateway.pinata.cloud/ipfs/')) {
            const cidPath = url.substring('https://gateway.pinata.cloud/ipfs/'.length);
            // Use Cloudflare's public gateway, which is generally more CORS-friendly
            return `https://cloudflare-ipfs.com/ipfs/${cidPath}`;
        }
        // Add more gateway transformations if needed (e.g., from other providers)
        // For example, if it's 'ipfs://' protocol
        if (url.startsWith('ipfs://')) {
            const cid = url.substring('ipfs://'.length);
            return `https://cloudflare-ipfs.com/ipfs/${cid}`;
        }
        return url; // Return as is if it's not a known IPFS gateway or is already fine
    };


    // 1. Fetch the metadata JSON
    if (asset.metadata.uri) {
      try {
        const metadataUriToFetch = transformIpfsUrl(asset.metadata.uri); // Transform the metadata URI
        if (!metadataUriToFetch) { // Handle case where transform returns null
            console.warn(`Invalid or unresolvable metadata URI for ${toWeb3JsPublicKey(asset.publicKey).toBase58()}`);
        } else {
            const metadataResponse = await fetch(metadataUriToFetch);
            if (!metadataResponse.ok) {
              console.warn(`Failed to fetch metadata from ${metadataUriToFetch}: HTTP status ${metadataResponse.status}`);
            } else {
              const fetchedMetadata = await metadataResponse.json();
              if (fetchedMetadata.image) {
                imageUrl = transformIpfsUrl(fetchedMetadata.image); // Transform the image URL from metadata
              }
              if (fetchedMetadata.description) {
                description = fetchedMetadata.description;
              }
            }
        }
      } catch (metadataErr) {
        console.error(`Error fetching/parsing metadata from json_uri for ${toWeb3JsPublicKey(asset.publicKey).toBase58()}:`, metadataErr);
      }
    } else if (asset.content && asset.content.files && asset.content.files.length > 0) {
        // Fallback: sometimes image URI might be directly in content.files
        const imageFile = asset.content.files.find(file => file.mime && file.mime.startsWith('image/'));
        if (imageFile) {
            imageUrl = transformIpfsUrl(imageFile.uri); // Transform this fallback URL too
        }
    }

    return {
      mintAddress: toWeb3JsPublicKey(asset.publicKey).toBase58(),
      name: asset.metadata.name || `Unnamed NFT #${toWeb3JsPublicKey(asset.publicKey).toBase58().substring(0, 6)}`,
      symbol: asset.metadata.symbol || '',
      image: imageUrl, // This is the transformed URL
      description: description,
    };
});

const fetchedNfts = await Promise.all(processedNftsPromises);

      setNfts(fetchedNfts);
      toast.success(`NFTs loaded successfully! (Page ${currentPage} of ${Math.ceil(unlistedDigitalAssets.length / nftsPerPage)})`, { id: 'loading-nfts' }); // Use unlistedDigitalAssets.length for total pages

    } catch (err) {
      console.error("Error fetching Solana NFTs with Umi:", err);
      let userMessage = "Failed to fetch NFTs. Please check your wallet connection or an issue with Umi.";

      if (err.message.includes('Invalid response structure')) {
        userMessage = "Received an unexpected response from the NFT service. Please try again.";
      } else if (err.message.includes('Network Error') || err.message.includes('Failed to fetch')) {
        userMessage = "Network error. Please check your internet connection.";
      }

      setError(userMessage);
      toast.error(userMessage, { id: 'loading-nfts' });
    } finally {
      setLoading(false);
    }
  }, [publicKey, connected, currentPage, nftsPerPage, helius]); // helius must be a dependency here

  useEffect(() => {
    fetchNfts();
  }, [fetchNfts]);

  // Handle NFT card click to open detail modal
  const handleNftCardClick = useCallback((nft) => {
    setSelectedNftForDetail(nft);
    setIsDetailModalOpen(true);
  }, []);

  const handleSellClick = useCallback((nft) => {
    setSelectedNft(nft);
    setIsSellModalOpen(true);
    setIsAuctionModalOpen(false);
    setIsDetailModalOpen(false); // Close detail modal if open
  }, []);

  const handleAuctionClick = useCallback((nft) => {
    setSelectedNft(nft);
    setIsAuctionModalOpen(true);
    setIsSellModalOpen(false);
    setIsDetailModalOpen(false); // Close detail modal if open
  }, []);

  const handleConfirmSell = useCallback(async (nft, price) => {
    if (!program || !provider || !publicKey || !wallet?.adapter) {
      toast.error("Wallet not connected or program not initialized.");
      return;
    }
    toast.loading(`Listing ${nft.name} for ${price} SOL...`, { id: 'sell-nft-action' });

    try {
      const listingPriceInLamports = new anchor.BN(price * anchor.web3.LAMPORTS_PER_SOL);
      const listNftInstruction = await program.methods.createListing(listingPriceInLamports)
        .accounts({
          seller: publicKey,
          mint: new PublicKey(nft.mintAddress),
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .instruction();

      const transaction = new Transaction();
      transaction.add(listNftInstruction);

      const { blockhash, lastValidBlockHeight } = await provider.connection.getLatestBlockhash('finalized');
      transaction.recentBlockhash = blockhash;
      transaction.lastValidBlockHeight = lastValidBlockHeight;
      transaction.feePayer = publicKey;

      const signedTransaction = await wallet.adapter.signTransaction(transaction);

      const txSign = await provider.connection.sendRawTransaction(signedTransaction.serialize());
      await provider.connection.confirmTransaction(txSign, "confirmed");

      // Update localStorage and UI
      const listedNftWithPrice = { ...nft, sellPrice: price, seller: publicKey.toBase58() };
      const storedListedNfts = JSON.parse(localStorage.getItem('listedNftsForSale') || '[]');
      const updatedListedNfts = [...storedListedNfts, listedNftWithPrice];
      localStorage.setItem('listedNftsForSale', JSON.stringify(updatedListedNfts));

      setNfts(prevNfts => prevNfts.filter(item => item.mintAddress !== nft.mintAddress));
      setTotalNfts(prevTotal => prevTotal - 1);

      toast.success(`Successfully listed ${nft.name} for ${price} SOL!`, { id: 'sell-nft-action' });
      setIsSellModalOpen(false);
      navigate('/marketplace/live-sell');
    } catch (error) {
      console.error("Error listing NFT for sale:", error);
      let errorMessage = `Failed to list ${nft.name}. Error: ${error.message || 'Unknown error'}`;
      if (error.message.includes("User rejected the request")) {
        errorMessage = "Transaction cancelled by user.";
      } else if (error.logs) {
        const programLog = error.logs.find(log => log.includes("Program log: AnchorError"));
        if (programLog) {
          errorMessage = programLog.split("Error Message: ")[1] || errorMessage;
        }
      }
      toast.error(errorMessage, { id: 'sell-nft-action' });
    }
  }, [publicKey, wallet, program, provider, navigate]);

  const handleConfirmAuction = useCallback(async (nft, initialPrice, startTime, duration) => {
    if (!program || !provider || !publicKey || !wallet?.adapter) {
      toast.error("Wallet not connected or program not initialized.");
      return;
    }
    toast.loading(`Starting auction for ${nft.name}...`, { id: 'auction-nft-action' });
    try {

      const initialPriceLamports = new anchor.BN(initialPrice * anchor.web3.LAMPORTS_PER_SOL);

      const auctionStartTimeBN = new anchor.BN(startTime);
      const durationBN = new anchor.BN(duration);


      const calculatedEndTimeSeconds = startTime + duration;
      const auctionEndTimeBN = new anchor.BN(calculatedEndTimeSeconds);

      console.log("DEBUG: Initial Price (SOL):", initialPrice);
      console.log("DEBUG: Initial Price (Lamports BN):", initialPriceLamports.toString());
      console.log("DEBUG: Auction Start Time (raw seconds):", startTime);
      console.log("DEBUG: Auction Start Time (BN):", auctionStartTimeBN.toString());
      console.log("DEBUG: Auction Duration (raw seconds):", duration);
      console.log("DEBUG: Auction Duration (BN):", new anchor.BN(duration).toString());
      console.log("DEBUG: Calculated End Time (raw seconds):", calculatedEndTimeSeconds);
      console.log("DEBUG: Auction End Time (BN):", auctionEndTimeBN.toString());
      console.log("DEBUG: NFT Mint Address:", nft.mintAddress);
      console.log("DEBUG: Seller Public Key:", publicKey.toBase58());


      const startAuctionInstruction = await program.methods.createAuction(
        auctionStartTimeBN,
        initialPriceLamports,
        durationBN,
      )
        .accounts({
          seller: publicKey,
          nftMint: new PublicKey(nft.mintAddress),
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
          rent: SYSVAR_RENT_PUBKEY,
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

      const listedNftForAuction = {
        ...nft,
        initialPrice: initialPrice,
        startTime: startTime,
        duration: duration,
        seller: publicKey.toBase58(),
        endTime: startTime + duration,
      };
      const storedListedNftsForAuction = JSON.parse(localStorage.getItem('listedNftsForAuction') || '[]');
      const updatedListedNftsForAuction = [...storedListedNftsForAuction, listedNftForAuction];
      localStorage.setItem('listedNftsForAuction', JSON.stringify(updatedListedNftsForAuction));

      setNfts(prevNfts => prevNfts.filter(item => item.mintAddress !== nft.mintAddress));
      setTotalNfts(prevTotal => prevTotal - 1);

      toast.success(`Successfully started auction for ${nft.name}!`, { id: 'auction-nft-action' });
      setIsAuctionModalOpen(false);

      confetti({
        particleCount: 200,
        spread: 270,
        origin: { y: 0.6 },
        colors: ['#a864fd', '#29cdff', '#78ff44', '#ff718d', '#fdff6a'],
      });

      navigate('/marketplace/auction');

    } catch (error) {
      console.error("Error starting auction:", error);
      let errorMessage = `Failed to start auction for ${nft.name}. Error: ${error.message || 'Unknown error'}`;
      if (error.message.includes("User rejected the request")) {
        errorMessage = "Transaction cancelled by user.";
      } else if (error.logs) {
        const programLog = error.logs.find(log => log.includes("Program log: AnchorError"));
        if (programLog) {
          errorMessage = programLog.split("Error Message: ")[1] || errorMessage;
        }
      }
      toast.error(errorMessage, { id: 'auction-nft-action' });
    }
  }, [publicKey, wallet, program, provider, navigate]);


  // Pagination functions
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

  // Conditional Rendering with Enhanced UI
  // Note: The primary wallet connection check for route access is now handled by ProtectedRoute
  // This 'if (!connected)' block serves as a more user-friendly prompt *within* the BuySell component
  // if a user lands here without a wallet, but ProtectedRoute should have already redirected.
  // It provides an immediate UI for connecting if they haven't.
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
          onClick={() => setVisible(true)} // This triggers the wallet modal
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
      <div className='min-h-screen bg-gradient-to-br from-gray-950 to-black text-white flex flex-col items-center justify-center p-8'>
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
      <div className='min-h-screen bg-gradient-to-br from-gray-950 to-black text-white flex flex-col items-center justify-center p-8'>
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
    <div className="min-h-screen bg-gradient-to-br from-gray-950 to-black p-4 md:p-8 overflow-y-auto custom-scrollbar-hidden">
      <motion.h1
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className='text-4xl md:text-5xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-blue-500 to-purple-600 mb-10 text-center'
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

      {/* Button to navigate to Live Sell page - Made more responsive */}
      <div className="text-center mb-8 flex flex-col sm:flex-row justify-center items-center space-y-4 sm:space-y-0 sm:space-x-4">
        <Link to="/marketplace/live-sell"
          className="px-6 py-2 bg-gradient-to-r from-teal-500 to-emerald-600 text-white font-semibold rounded-full shadow-lg hover:shadow-xl transition-all duration-300 w-full sm:w-auto"
        >
          View Live Sales →
        </Link>
        <Link to="/marketplace/auction"
          className="px-6 py-2 bg-gradient-to-r from-orange-500 to-red-600 text-white font-semibold rounded-full shadow-lg hover:shadow-xl transition-all duration-300 w-full sm:w-auto"
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
            It seems you don't own any NFTs on the Devnet network that aren't already listed for sale or auction.
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
                  onCardClick={handleNftCardClick} // Make sure this prop is passed to NftCard
                />
              ))}
            </motion.div>
          </AnimatePresence>

          {/* Pagination Controls - This is where your "next page" logic is displayed */}
          {totalPages > 1 && (
            <div className="flex justify-center items-center mt-12 space-x-4">
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={goToPrevPage}
                disabled={currentPage === 1 || loading}
                className={`px-6 py-2 rounded-full font-semibold text-white shadow-md transition-all duration-300
                  ${currentPage === 1 || loading ? 'bg-gray-100 cursor-not-allowed' : 'bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700'}
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
                  ${currentPage === totalPages || loading ? 'bg-gray-100 cursor-not-allowed' : 'bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700'}
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

      {/* NFT Detail Modal */}
      <NftDetailModal
        isOpen={isDetailModalOpen}
        onClose={() => setIsDetailModalOpen(false)}
        nft={selectedNftForDetail}
      />

      {walletPopupVisible && (
        <div
          className="fixed inset-0 bg-black bg-opacity-60 z-[9999] pointer-events-auto flex items-center justify-center"
          style={{ backdropFilter: 'blur(3px)' }}
        >
          <p className="text-white text-xl font-semibold animate-pulse">
            🔐 Waiting for wallet confirmation...
          </p>
        </div>
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