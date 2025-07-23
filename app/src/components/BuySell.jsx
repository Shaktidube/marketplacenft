// BuySell.js
import React, { useEffect, useState, useCallback } from 'react';
import * as anchor from "@coral-xyz/anchor";
import { PublicKey, Transaction, SystemProgram, SYSVAR_RENT_PUBKEY } from '@solana/web3.js';
import { useWallet } from "@solana/wallet-adapter-react";
import toast from 'react-hot-toast';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';
import confetti from 'canvas-confetti';
import { motion, AnimatePresence } from 'framer-motion';
import { Link, useNavigate } from 'react-router-dom';

import NftCard from './NftCard';
import SellModal from './SellModal';
import AuctionModal from './AuctionModal';
import NftDetailModal from './NftDetailModal';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token'; // ASSOCIATED_TOKEN_PROGRAM_ID not explicitly used here, can remove if not needed elsewhere

import { useSolanaProgram } from '../contexts/SolanaProgramContext';
import { fetchAllDigitalAssetByOwner, fetchDigitalAsset } from '@metaplex-foundation/mpl-token-metadata'; // Import fetchDigitalAsset
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

// Custom hook for wallet popup detection
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
  const { program, provider, umi, connection, connected, publicKey } = useSolanaProgram();
  const { wallet } = useWallet();

  const [nfts, setNfts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const { setVisible } = useWalletModal();
  const navigate = useNavigate();
  const walletPopupVisible = useWalletPopupDetection();

  // Pagination states
  const [currentPage, setCurrentPage] = useState(1);
  const [nftsPerPage] = useState(20);
  const [totalNfts, setTotalNfts] = useState(0); // This will now represent total *unlisted* NFTs

  // States for Modals
  const [isSellModalOpen, setIsSellModalOpen] = useState(false);
  const [isAuctionModalOpen, setIsAuctionModalOpen] = useState(false);
  const [selectedNft, setSelectedNft] = useState(null);

  // New states for NFT Detail Modal
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [selectedNftForDetail, setSelectedNftForDetail] = useState(null);

  // Helper function for IPFS URL transformation to avoid CORS
  // Using Cloudflare's IPFS gateway for demonstration
  const transformIpfsUrl = useCallback((url) => {
      if (!url) return null;
      if (url.startsWith('https://gateway.pinata.cloud/ipfs/')) {
          const cidPath = url.substring('https://gateway.pinata.cloud/ipfs/'.length);
          return `https://cloudflare-ipfs.com/ipfs/${cidPath}`;
      }
      if (url.startsWith('ipfs://')) {
          const cid = url.substring('ipfs://'.length);
          return `https://cloudflare-ipfs.com/ipfs/${cid}`;
      }
      return url;
  }, []); // No dependencies for this simple transformation

  // Function to fetch active sales from the program
  const fetchActiveSales = useCallback(async () => {
    if (!program || !umi) return [];
    try {
      // Assuming 'listing' is the name of your account type in the IDL for direct sales
      const allListingAccounts = await program.account.listing.all();

      const activeSalesPromises = allListingAccounts.map(async (account) => {
        // You might need to add a check here if your program has an 'isSold' or 'isActive' field
        // if (account.account.isSold) return null;

        const mintAddress = account.account.mint.toBase58();
        const seller = account.account.seller.toBase58();
        const price = account.account.price.toNumber() / anchor.web3.LAMPORTS_PER_SOL;

        // Fetch metadata for the listed NFT using Umi
        const umiMint = new PublicKey(mintAddress);
        const asset = await fetchDigitalAsset(umi, umiMint);

        let imageUrl = null;
        let description = asset.metadata.description || 'No description available.';

        if (asset.metadata.uri) {
          try {
            const metadataUriToFetch = transformIpfsUrl(asset.metadata.uri);
            const metadataResponse = await fetch(metadataUriToFetch);
            if (metadataResponse.ok) {
              const fetchedMetadata = await metadataResponse.json();
              if (fetchedMetadata.image) {
                imageUrl = transformIpfsUrl(fetchedMetadata.image);
              }
              if (fetchedMetadata.description) {
                description = fetchedMetadata.description;
              }
            }
          } catch (metadataErr) {
            console.error(`Error fetching/parsing metadata for listed NFT ${mintAddress}:`, metadataErr);
          }
        } else if (asset.content && asset.content.files && asset.content.files.length > 0) {
            const imageFile = asset.content.files.find(file => file.mime && file.mime.startsWith('image/'));
            if (imageFile) {
                imageUrl = transformIpfsUrl(imageFile.uri);
            }
        }
        return { mintAddress, name: asset.metadata.name, symbol: asset.metadata.symbol, image: imageUrl, description, seller, sellPrice: price };
      });
      return (await Promise.all(activeSalesPromises)).filter(Boolean);
    } catch (err) {
      console.error("Error fetching active sales from program:", err);
      toast.error("Failed to load active sales from the blockchain.");
      return [];
    }
  }, [program, umi, transformIpfsUrl]); // Dependencies for this useCallback

  // Function to fetch active auctions from the program
  const fetchActiveAuctions = useCallback(async () => {
    if (!program || !umi) return [];
    try {
      // Assuming 'auction' is the name of your account type in the IDL for auctions
      const allAuctionAccounts = await program.account.auction.all();

      const activeAuctionsPromises = allAuctionAccounts.map(async (account) => {
        // Filter out ended auctions based on program state (e.g., 'ended' field)
        const currentTimestamp = Math.floor(Date.now() / 1000); // Current time in seconds
        if (account.account.ended || account.account.endTime.toNumber() <= currentTimestamp) return null;

        const mintAddress = account.account.nftMint.toBase58();
        const seller = account.account.seller.toBase58();
        const initialPrice = account.account.initialPrice.toNumber() / anchor.web3.LAMPORTS_PER_SOL;
        const startTime = account.account.startTime.toNumber();
        const endTime = account.account.endTime.toNumber();
        const highestBid = account.account.highestBid ? account.account.highestBid.toNumber() / anchor.web3.LAMPORTS_PER_SOL : null;
        const highestBidder = account.account.highestBidder ? account.account.highestBidder.toBase58() : null;

        // Fetch metadata for the auctioned NFT using Umi
        const umiMint = new PublicKey(mintAddress);
        const asset = await fetchDigitalAsset(umi, umiMint);

        let imageUrl = null;
        let description = asset.metadata.description || 'No description available.';

        if (asset.metadata.uri) {
          try {
            const metadataUriToFetch = transformIpfsUrl(asset.metadata.uri);
            const metadataResponse = await fetch(metadataUriToFetch);
            if (metadataResponse.ok) {
              const fetchedMetadata = await metadataResponse.json();
              if (fetchedMetadata.image) {
                imageUrl = transformIpfsUrl(fetchedMetadata.image);
              }
              if (fetchedMetadata.description) {
                description = fetchedMetadata.description;
              }
            }
          } catch (metadataErr) {
            console.error(`Error fetching/parsing metadata for auctioned NFT ${mintAddress}:`, metadataErr);
          }
        } else if (asset.content && asset.content.files && asset.content.files.length > 0) {
            const imageFile = asset.content.files.find(file => file.mime && file.mime.startsWith('image/'));
            if (imageFile) {
                imageUrl = transformIpfsUrl(imageFile.uri);
            }
        }
        return { mintAddress, name: asset.metadata.name, symbol: asset.metadata.symbol, image: imageUrl, description, seller, initialPrice, startTime, endTime, highestBid, highestBidder };
      });
      return (await Promise.all(activeAuctionsPromises)).filter(Boolean);
    } catch (err) {
      console.error("Error fetching active auctions from program:", err);
      toast.error("Failed to load active auctions from the blockchain.");
      return [];
    }
  }, [program, umi, transformIpfsUrl]); // Dependencies for this useCallback


  // Refined useEffect for wallet connection prompt
  useEffect(() => {
    if (!connected) {
      const timer = setTimeout(() => {
        toast('Please connect your wallet to view your NFTs!', { icon: '👋', id: 'connect-prompt' });
      }, 500);
      return () => clearTimeout(timer);
    } else {
      toast.dismiss('connect-prompt');
    }
  }, [connected]);

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
    if (!connected || !publicKey || !umi || !program) {
      setNfts([]);
      setTotalNfts(0);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    toast.loading(`Loading NFTs - Page ${currentPage}...`, { id: 'loading-nfts' });

    try {
      // 1. Fetch all NFTs owned by the wallet
      const allDigitalAssets = await fetchAllDigitalAssetByOwner(umi, publicKey);

      if (!allDigitalAssets || !Array.isArray(allDigitalAssets)) {
        throw new Error("Invalid response structure from Umi fetchAllDigitalAssetByOwner.");
      }

      // 2. Fetch actively listed NFTs from your Solana program
      const listedSales = await fetchActiveSales();
      const listedAuctions = await fetchActiveAuctions();

      const listedMintAddresses = new Set([
        ...listedSales.map(nft => nft.mintAddress),
        ...listedAuctions.map(nft => nft.mintAddress)
      ]);

      // 3. Filter out NFTs that are currently listed for sale or auction
      const unlistedDigitalAssets = allDigitalAssets.filter(asset =>
        !listedMintAddresses.has(toWeb3JsPublicKey(asset.publicKey).toBase58())
      );

      // Set total NFTs based on the full list length of *unlisted* assets
      setTotalNfts(unlistedDigitalAssets.length);

      // 4. Apply client-side pagination to the *unlisted* NFTs
      const startIndex = (currentPage - 1) * nftsPerPage;
      const endIndex = startIndex + nftsPerPage;
      const paginatedDigitalAssets = unlistedDigitalAssets.slice(startIndex, endIndex);

      // 5. Process the paginated, unlisted NFTs to get image/description
      const processedNftsPromises = paginatedDigitalAssets.map(async (asset) => {
        let imageUrl = null;
        let description = asset.metadata.description || 'No description available.';

        if (asset.metadata.uri) {
          try {
            const metadataUriToFetch = transformIpfsUrl(asset.metadata.uri);
            if (!metadataUriToFetch) {
                console.warn(`Invalid or unresolvable metadata URI for ${toWeb3JsPublicKey(asset.publicKey).toBase58()}`);
            } else {
                const metadataResponse = await fetch(metadataUriToFetch);
                if (!metadataResponse.ok) {
                  console.warn(`Failed to fetch metadata from ${metadataUriToFetch}: HTTP status ${metadataResponse.status}`);
                } else {
                  const fetchedMetadata = await metadataResponse.json();
                  if (fetchedMetadata.image) {
                    imageUrl = transformIpfsUrl(fetchedMetadata.image);
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
            const imageFile = asset.content.files.find(file => file.mime && file.mime.startsWith('image/'));
            if (imageFile) {
                imageUrl = transformIpfsUrl(imageFile.uri);
            }
        }

        return {
          mintAddress: toWeb3JsPublicKey(asset.publicKey).toBase58(),
          name: asset.metadata.name || `Unnamed NFT #${toWeb3JsPublicKey(asset.publicKey).toBase58().substring(0, 6)}`,
          symbol: asset.metadata.symbol || '',
          image: imageUrl,
          description: description,
        };
      });

      const fetchedNfts = await Promise.all(processedNftsPromises);
      setNfts(fetchedNfts);
      toast.success(`NFTs loaded successfully! (Page ${currentPage} of ${Math.ceil(unlistedDigitalAssets.length / nftsPerPage)})`, { id: 'loading-nfts' });

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
  }, [publicKey, connected, currentPage, nftsPerPage, program, umi, fetchActiveSales, fetchActiveAuctions, transformIpfsUrl]);


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
    setIsDetailModalOpen(false);
  }, []);

  const handleAuctionClick = useCallback((nft) => {
    setSelectedNft(nft);
    setIsAuctionModalOpen(true);
    setIsSellModalOpen(false);
    setIsDetailModalOpen(false);
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
          // Add any other necessary accounts for your createListing instruction here
          // For example, if your listing account is a PDA derived from mint + seller:
          // listingAccount: YOUR_LISTING_PDA_HERE,
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

      // Removed localStorage updates
      // Instead, trigger a refetch of NFTs from the blockchain
      fetchNfts();

      toast.success(`Successfully listed ${nft.name} for ${price} SOL!`, { id: 'sell-nft-action' });
      setIsSellModalOpen(false);
      navigate('/marketplace/live-sell'); // Navigate to the live sales page
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
  }, [publicKey, wallet, program, provider, navigate, fetchNfts]); // Added fetchNfts to dependencies

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
          // Add any other necessary accounts for your createAuction instruction here
          // e.g., auctionAccount: YOUR_AUCTION_PDA_HERE,
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

      // Removed localStorage updates
      // Instead, trigger a refetch of NFTs from the blockchain
      fetchNfts();

      toast.success(`Successfully started auction for ${nft.name}!`, { id: 'auction-nft-action' });
      setIsAuctionModalOpen(false);

      confetti({
        particleCount: 200,
        spread: 270,
        origin: { y: 0.6 },
        colors: ['#a864fd', '#29cdff', '#78ff44', '#ff718d', '#fdff6a'],
      });

      navigate('/marketplace/auction'); // Navigate to the live auctions page

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
  }, [publicKey, wallet, program, provider, navigate, fetchNfts]); // Added fetchNfts to dependencies


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
                  onCardClick={handleNftCardClick}
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