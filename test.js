import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import * as anchor from "@coral-xyz/anchor";
import { PublicKey, Transaction, SystemProgram, SYSVAR_RENT_PUBKEY, LAMPORTS_PER_SOL, SYSVAR_CLOCK_PUBKEY } from '@solana/web3.js';
import idl from "../idl/marketplacenft.json";
import toast from 'react-hot-toast';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID, createAssociatedTokenAccountInstruction, getAssociatedTokenAddressSync } from '@solana/spl-token';
import { PROGRAM_ID as TOKEN_METADATA_PROGRAM_ID, Metadata } from '@metaplex-foundation/mpl-token-metadata';

const METADATA_PROGRAM_ID = new PublicKey(
  "metaqbxxUerdq28cj1RbTFW3DvdbRrVfadqotrsmoBH"
);

// Enhanced animation variants
const cardVariants = {
  hidden: { opacity: 0, y: 50, scale: 0.95 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: {
      type: "spring",
      stiffness: 100,
      damping: 15,
    },
  },
  hover: {
    y: -5,
    boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.3)",
    transition: { duration: 0.2 }
  }
};

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1,
      delayChildren: 0.2,
    },
  },
};

const successVariants = {
  hidden: { opacity: 0, scale: 0.9 },
  visible: {
    opacity: 1,
    scale: 1,
    transition: {
      type: "spring",
      stiffness: 120,
      damping: 12,
    },
  },
  exit: {
    opacity: 0,
    scale: 1.1,
    transition: { duration: 0.4 }
  }
};

function MyAuctions() {
  const [endedAuctions, setEndedAuctions] = useState([]);
  const [loading, setLoading] = useState(true);
  const { connection } = useConnection();
  const { publicKey, wallet, connected } = useWallet();
  const [showFullScreenSuccess, setShowFullScreenSuccess] = useState(false);
  const [successfulTxNftName, setSuccessfulTxNftName] = useState("");
  const [successMessageType, setSuccessMessageType] = useState("");
  const [isTransactionPending, setIsTransactionPending] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const programRef = useRef(null);

  const getProgram = useCallback(() => {
    if (!connection || !wallet?.adapter) return null;
    if (programRef.current) return programRef.current;
    
    const provider = new anchor.AnchorProvider(
      connection,
      wallet.adapter,
      { commitment: "confirmed" }
    );
    anchor.setProvider(provider);
    const programInstance = new anchor.Program(idl, provider);
    programRef.current = programInstance;
    return programInstance;
  }, [connection, wallet]);

  const program = getProgram();

  // Enhanced auction fetching with better error handling
  const fetchMyEndedAuctions = useCallback(async (isBackgroundRefresh = false) => {
    if (!program || !publicKey) {
      if (!isBackgroundRefresh) setLoading(false);
      return;
    }

    try {
      if (!isBackgroundRefresh) setLoading(true);
      else setIsRefreshing(true);

      const [allAuctionAccounts, clockAcc] = await Promise.all([
        program.account.auction.all(),
        connection.getAccountInfo(SYSVAR_CLOCK_PUBKEY).catch(() => null)
      ]);

      const onChainNow = clockAcc ? 
        new anchor.BN(clockAcc.data.slice(32, 40), "le").toNumber() : 
        Math.floor(Date.now() / 1000);

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const startOfTodayTimestamp = Math.floor(today.getTime() / 1000);

      const relevantAuctions = await Promise.all(
        allAuctionAccounts
          .filter(account => {
            const auctionData = account.account;
            const isEnded = onChainNow >= auctionData.endTime.toNumber();
            const isSeller = publicKey.equals(auctionData.seller);
            const isHighestBidder = publicKey.equals(auctionData.highestBidder);
            return isEnded && (isSeller || isHighestBidder);
          })
          .map(async account => {
            const auctionData = account.account;
            const mintAddress = auctionData.nftMint.toBase58();
            
            const nftDetails = {
              mintAddress,
              seller: auctionData.seller.toBase58(),
              initialPrice: auctionData.satrtPrice.toNumber() / LAMPORTS_PER_SOL,
              currentBid: auctionData.currentBid.toNumber() / LAMPORTS_PER_SOL,
              highestBidder: auctionData.highestBidder.toBase58(),
              endTime: auctionData.endTime.toNumber(),
              isSeller: publicKey.equals(auctionData.seller),
              isHighestBidder: publicKey.equals(auctionData.highestBidder),
              name: "Unknown NFT",
              symbol: "",
              image: "",
              auctionPda: account.publicKey.toBase58(),
              isTodayEnded: auctionData.endTime.toNumber() >= startOfTodayTimestamp && 
                           auctionData.endTime.toNumber() <= onChainNow,
            };

            try {
              const [metadataPda] = PublicKey.findProgramAddressSync(
                [Buffer.from("metadata"), METADATA_PROGRAM_ID.toBuffer(), new PublicKey(mintAddress).toBuffer()],
                METADATA_PROGRAM_ID
              );
              
              const metadataAccountInfo = await connection.getAccountInfo(metadataPda);
              if (metadataAccountInfo) {
                const metadata = Metadata.fromAccountInfo(metadataAccountInfo)[0];
                nftDetails.name = metadata.data.name.replace(/\0/g, '');
                nftDetails.symbol = metadata.data.symbol.replace(/\0/g, '');
                
                const uri = metadata.data.uri.replace(/\0/g, '');
                if (uri) {
                  const response = await fetch(uri);
                  if (response.ok) {
                    const json = await response.json();
                    nftDetails.image = json.image;
                  }
                }
              }
            } catch (error) {
              console.warn(`Metadata fetch error for ${mintAddress}:`, error);
            }

            return nftDetails;
          })
      );

      setEndedAuctions(relevantAuctions.sort((a, b) => b.endTime - a.endTime));
    } catch (error) {
      console.error("Error fetching auctions:", error);
      toast.error("Failed to load auctions. Please try again.");
    } finally {
      if (!isBackgroundRefresh) setLoading(false);
      setIsRefreshing(false);
    }
  }, [program, publicKey, connection]);

  useEffect(() => {
    if (connected && program) {
      fetchMyEndedAuctions();
      const intervalId = setInterval(() => fetchMyEndedAuctions(true), 30000);
      return () => clearInterval(intervalId);
    } else if (!connected) {
      setEndedAuctions([]);
      setLoading(false);
    }
  }, [connected, program, fetchMyEndedAuctions]);

  // Enhanced transaction handling
  const handleTransaction = async (action, nft, instructionBuilder) => {
    if (!connected || !publicKey) {
      toast.error("Wallet not connected");
      return;
    }

    setIsTransactionPending(true);
    const toastId = toast.loading(`Preparing ${action} transaction...`);

    try {
      const transaction = new Transaction();
      const instruction = await instructionBuilder();
      transaction.add(instruction);

      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
      transaction.recentBlockhash = blockhash;
      transaction.lastValidBlockHeight = lastValidBlockHeight;
      transaction.feePayer = publicKey;

      const signedTx = await wallet.adapter.signTransaction(transaction);
      const txSignature = await connection.sendRawTransaction(signedTx.serialize());
      await connection.confirmTransaction(txSignature, "confirmed");

      setEndedAuctions(prev => prev.filter(item => item.mintAddress !== nft.mintAddress));
      setSuccessfulTxNftName(nft.name);
      setSuccessMessageType(action);
      setShowFullScreenSuccess(true);
      setTimeout(() => setShowFullScreenSuccess(false), 3000);

      toast.success(`${action} successful!`, { id: toastId });
    } catch (error) {
      console.error(`${action} error:`, error);
      
      let errorMessage = error.message || 'Transaction failed';
      if (error.logs?.some(log => log.includes("AnchorError"))) {
        const anchorError = error.logs.find(log => log.includes("AnchorError"));
        errorMessage = anchorError.split("Error Message: ")[1] || errorMessage;
      }

      toast.error(errorMessage, { id: toastId, duration: 5000 });
    } finally {
      setIsTransactionPending(false);
    }
  };

  const handleSettleAuction = async (nft) => {
    await handleTransaction("settle", nft, async () => {
      const mintPublicKey = new PublicKey(nft.mintAddress);
      const auctionAccountPda = new PublicKey(nft.auctionPda);
      const sellerPublicKey = new PublicKey(nft.seller);
      const highestBidderPublicKey = new PublicKey(nft.highestBidder);

      const [bidPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("bid"), auctionAccountPda.toBuffer()],
        program.programId
      );

      return program.methods.winnerNft()
        .accounts({
          seller:sellerPublicKey,
          bidder:highestBidderPublicKey,
          signer:publicKey,
          mint:mintPublicKey,
          tokenProgram:TOKEN_PROGRAM_ID,
        })
        .instruction();
    });
  };

  const handleRetrieveNft = async (nft) => {
    await handleTransaction("retrieve", nft, async () => {
      const mintPublicKey = new PublicKey(nft.mintAddress);
      const auctionPda = new PublicKey(nft.auctionPda);

      return program.methods.cancelAuction()
        .accounts({
          seller: publicKey,
        mint: mintPublicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
        })
        .instruction();
    });
  };

  if (loading || isTransactionPending) {
    return (
      <div className="min-h-screen bg-gray-900 text-white flex flex-col justify-center items-center p-4">
        <motion.div
          className="w-16 h-16 border-4 border-t-4 border-gray-200 border-t-purple-500 rounded-full"
          animate={{ rotate: 360 }}
          transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
        />
        <h1 className="text-2xl md:text-3xl font-bold mt-6 text-center">
          {isTransactionPending ? "Processing transaction..." : "Loading your auctions..."}
        </h1>
        <p className="text-gray-400 mt-2 text-center">
          {isTransactionPending ? "Please check your wallet" : "This may take a moment"}
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 text-gray-100 p-4 md:p-8">
      <AnimatePresence>
        {showFullScreenSuccess && (
          <motion.div
            className="fixed inset-0 bg-black bg-opacity-90 backdrop-blur-md flex flex-col items-center justify-center z-50"
            variants={successVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
          >
            <motion.div
              className="w-24 h-24 bg-green-500 rounded-full flex items-center justify-center mb-6"
              animate={{ scale: [1, 1.1, 1] }}
              transition={{ duration: 0.6 }}
            >
              <svg className="w-16 h-16 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
              </svg>
            </motion.div>
            <motion.h2 className="text-3xl md:text-4xl font-bold mb-2 text-center">
              {successMessageType === "settle" ? "Auction Settled!" : "NFT Retrieved!"}
            </motion.h2>
            <motion.p className="text-xl text-gray-300 text-center max-w-md px-4">
              {successMessageType === "settle"
                ? `You've successfully settled ${successfulTxNftName}`
                : `You've retrieved ${successfulTxNftName} back to your wallet`}
            </motion.p>
          </motion.div>
        )}
      </AnimatePresence>

      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-7xl mx-auto"
      >
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8">
          <motion.h1 className="text-3xl md:text-4xl font-extrabold bg-clip-text text-transparent bg-gradient-to-r from-purple-400 to-pink-600">
            Ended Auctions
          </motion.h1>
          
          {isRefreshing && (
            <motion.div
              className="flex items-center text-sm text-blue-400 mt-2 md:mt-0"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <motion.div
                className="w-4 h-4 border-2 border-blue-200 border-t-blue-500 rounded-full mr-2"
                animate={{ rotate: 360 }}
                transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
              />
              Refreshing data...
            </motion.div>
          )}
        </div>

        {!connected ? (
          <div className="text-center py-12">
            <h2 className="text-xl text-gray-400 mb-4">Connect your wallet to view ended auctions</h2>
          </div>
        ) : endedAuctions.length === 0 ? (
          <div className="text-center py-12">
            <h2 className="text-xl text-gray-400">No ended auctions to display</h2>
            <p className="text-gray-500 mt-2">Auctions you've participated in will appear here when they end</p>
          </div>
        ) : (
          <motion.div
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6"
            variants={containerVariants}
            initial="hidden"
            animate="visible"
          >
            <AnimatePresence>
              {endedAuctions.map((nft) => (
                <motion.div
                  key={nft.mintAddress}
                  className="bg-gray-800 rounded-xl overflow-hidden border border-gray-700 hover:border-purple-500 transition-colors"
                  variants={cardVariants}
                  whileHover="hover"
                  layout
                >
                  {nft.isTodayEnded && (
                    <div className="absolute top-3 right-3 bg-purple-600 text-white text-xs font-bold px-2 py-1 rounded-full z-10">
                      Ended Today
                    </div>
                  )}
                  
                  <div className="h-48 bg-gray-700 overflow-hidden">
                    {nft.image ? (
                      <img
                        src={nft.image}
                        alt={nft.name}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-gray-400">
                        No Image
                      </div>
                    )}
                  </div>
                  
                  <div className="p-4">
                    <h3 className="text-lg font-bold truncate">{nft.name}</h3>
                    <p className="text-sm text-gray-400 truncate mb-3">{nft.symbol}</p>
                    
                    <div className="space-y-2 mb-4">
                      <div className="flex justify-between">
                        <span className="text-gray-400">Initial Price:</span>
                        <span className="font-medium">{nft.initialPrice} SOL</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-400">Final Bid:</span>
                        <span className={nft.currentBid > 0 ? "text-blue-400 font-medium" : "text-gray-400"}>
                          {nft.currentBid > 0 ? `${nft.currentBid} SOL` : "No bids"}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-400">Ended:</span>
                        <span className="text-gray-300">
                          {new Date(nft.endTime * 1000).toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                    
                    <div className="mt-4 space-y-2">
                      {nft.isSeller && nft.currentBid > 0 && (
                        <motion.button
                          whileTap={{ scale: 0.98 }}
                          onClick={() => handleSettleAuction(nft)}
                          disabled={isTransactionPending}
                          className="w-full bg-gradient-to-r from-green-500 to-teal-500 text-white py-2 rounded-lg font-medium disabled:opacity-50"
                        >
                          Settle as Seller
                        </motion.button>
                      )}
                      
                      {nft.isHighestBidder && nft.currentBid > 0 && (
                        <motion.button
                          whileTap={{ scale: 0.98 }}
                          onClick={() => handleSettleAuction(nft)}
                          disabled={isTransactionPending}
                          className="w-full bg-gradient-to-r from-blue-500 to-indigo-500 text-white py-2 rounded-lg font-medium disabled:opacity-50"
                        >
                          Settle as Buyer
                        </motion.button>
                      )}
                      
                      {nft.isSeller && nft.currentBid === 0 && (
                        <motion.button
                          whileTap={{ scale: 0.98 }}
                          onClick={() => handleRetrieveNft(nft)}
                          disabled={isTransactionPending}
                          className="w-full bg-gradient-to-r from-purple-500 to-pink-500 text-white py-2 rounded-lg font-medium disabled:opacity-50"
                        >
                          Retrieve NFT
                        </motion.button>
                      )}
                    </div>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </motion.div>
        )}
      </motion.div>
    </div>
  );
}

export default MyAuctions;