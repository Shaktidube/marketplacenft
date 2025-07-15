// LiveAuction.jsx (assuming you've renamed the file)

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import * as anchor from "@coral-xyz/anchor";
import { PublicKey, Transaction, SystemProgram, SYSVAR_RENT_PUBKEY } from '@solana/web3.js';
import idl from "../idl/marketplacenft.json";
import toast from 'react-hot-toast';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID, createAssociatedTokenAccountInstruction, getAssociatedTokenAddressSync } from '@solana/spl-token';


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

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1,
    },
  },
};

function Auction() {
  const [listedNftsForAuction, setListedNftsForAuction] = useState([]);
  const [loading, setLoading] = useState(true);
  const { connection } = useConnection();
  const { publicKey, wallet, connected } = useWallet();

  // Initialize Anchor provider and program once
  const provider = new anchor.AnchorProvider(
    connection,
    wallet?.adapter,
    anchor.AnchorProvider.defaultOptions()
  );
  anchor.setProvider(provider);
  const program = new anchor.Program(idl, provider);

  useEffect(() => {
    const storedListedNfts = localStorage.getItem('listedNftsForAuction');
    if (storedListedNfts) {
      try {
        setListedNftsForAuction(JSON.parse(storedListedNfts));
      } catch (e) {
        console.error("Failed to parse listed NFTs from localStorage", e);
        setListedNftsForAuction([]);
      }
    }
    setLoading(false);
  }, []);

  // Helper for time formatting
  const formatTimeLeft = (seconds) => {
    if (seconds <= 0) return "Auction Ended";
    const days = Math.floor(seconds / (3600 * 24));
    seconds %= (3600 * 24);
    const hours = Math.floor(seconds / 3600);
    seconds %= 3600;
    const minutes = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);

    let parts = [];
    if (days > 0) parts.push(`${days}d`);
    if (hours > 0) parts.push(`${hours}h`);
    if (minutes > 0) parts.push(`${minutes}m`);
    if (secs > 0 || parts.length === 0) parts.push(`${secs}s`);

    return parts.join(' ');
  };

  const handleCancelAuction = async (nftToCancel) => {
    if (!connected || !publicKey) {
      toast.error("Wallet not connected to cancel auction.");
      return;
    }

    if (publicKey.toBase58() !== nftToCancel.seller) {
      toast.error("You are not the seller of this NFT. Cannot cancel auction.");
      return;
    }

    toast.loading('Cancelling auction...', { id: 'cancel-auction' });

    try {
      const mintPublicKey = new PublicKey(nftToCancel.mintAddress);
      
      const [auctionAccountPda] = PublicKey.findProgramAddressSync(
        [
          anchor.utils.bytes.utf8.encode("auction"),
          mintPublicKey.toBuffer()
        ],
        program.programId
      );

      const programNftAccount = getAssociatedTokenAddressSync(
        mintPublicKey,
        auctionAccountPda,
        true
      );

      const sellerTokenAccount = getAssociatedTokenAddressSync(
        mintPublicKey,
        publicKey
      );

      console.log("Cancel Auction - Seller: ", publicKey.toBase58());
      console.log("Cancel Auction - Mint: ", mintPublicKey.toBase58());
      console.log("Cancel Auction - Auction PDA: ", auctionAccountPda.toBase58());
      console.log("Cancel Auction - Program NFT Account: ", programNftAccount.toBase58());
      console.log("Cancel Auction - Seller Token Account (ATA): ", sellerTokenAccount.toBase58());

      const transaction = new Transaction();

      // Add a check if sellerTokenAccount needs to be created
      const sellerAtaInfo = await connection.getAccountInfo(sellerTokenAccount);
      if (!sellerAtaInfo) {
          transaction.add(
              createAssociatedTokenAccountInstruction(
                  publicKey,
                  sellerTokenAccount,
                  publicKey,
                  mintPublicKey
              )
          );
      }

      const cancelAuctionInstruction = await program.methods.cancelAuction()
        .accounts({
          seller: publicKey,
          nftMint: mintPublicKey,
          auctionAccount: auctionAccountPda,
          programNftAccount: programNftAccount,
          sellerTokenAccount: sellerTokenAccount,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        })
        .instruction();

      transaction.add(cancelAuctionInstruction);

      const txSignature = await provider.sendAndConfirm(transaction, []);
      console.log("Cancel auction successful, signature:", txSignature);

      const updatedListedNfts = listedNftsForAuction.filter(nft => nft.mintAddress !== nftToCancel.mintAddress);
      setListedNftsForAuction(updatedListedNfts);
      localStorage.setItem('listedNftsForAuction', JSON.stringify(updatedListedNfts));
      toast.success('Auction cancelled successfully!', { id: 'cancel-auction' });
      
    } catch (error) {
      console.error("Error cancelling auction:", error);
      let errorMessage = `Failed to cancel auction. Error: ${error.message || 'Unknown error'}`;

      if (error.logs) {
          console.error("Transaction logs:", error.logs);
          const programLog = error.logs.find(log => log.includes("Program log: AnchorError"));
          if (programLog) {
              errorMessage = programLog.split("Error Message: ")[1] || errorMessage;
              if (errorMessage.includes("AccountNotInitialized")) {
                  errorMessage = "Cancel failed: Auction listing not found on-chain. Did it fail to start initially or already cancelled?";
              }
          } else {
              errorMessage = `Cancel failed: Simulation failed. Logs: ${error.logs.join('\n')}`;
          }
      }
      toast.error(errorMessage, { id: 'cancel-auction', duration: 6000 });

    } finally {
      toast.dismiss('cancel-auction');
    }
  };

  const handlePlaceBid = async (nft) => {
    if (!connected || !publicKey) {
      toast.error("Please connect your wallet to place a bid.");
      return;
    }
    if (publicKey.toBase58() === nft.seller) {
      toast.error("You cannot bid on your own NFT auction!");
      return;
    }

    const bidAmountSol = prompt(`Enter your bid amount for ${nft.name} (Current highest bid: ${nft.currentBid || nft.initialPrice} SOL):`);
    if (!bidAmountSol) {
        toast("Bid cancelled.", { icon: '👋' });
        return;
    }
    const bidAmountLamports = new anchor.BN(parseFloat(bidAmountSol) * anchor.web3.LAMPORTS_PER_SOL);
    console.log(" bid amount : ", bidAmountLamports);
    // Ensure bid is valid and higher than current highest bid/initial price
    const currentHighestBidLamports = new anchor.BN((nft.currentBid || nft.initialPrice) * anchor.web3.LAMPORTS_PER_SOL);
    if (isNaN(parseFloat(bidAmountSol)) || bidAmountLamports.isZero() || bidAmountLamports.lt(currentHighestBidLamports)) {
      toast.error("Please enter a valid bid amount strictly higher than the current highest bid/initial price.");
      return;
    }
    console.log(" bid amount currentHighestBidLamports : ", currentHighestBidLamports);

    toast.loading(`Placing bid of ${bidAmountSol} SOL for ${nft.name}...`, { id: 'place-bid' });
    try {
      const mintPublicKey = new PublicKey(nft.mintAddress);

      const [auctionPda] = PublicKey.findProgramAddressSync(
        [
          anchor.utils.bytes.utf8.encode("auction"),
          mintPublicKey.toBuffer()
        ],
        program.programId
      );
      const auctionAcc = await program.account.auction.fetch(auctionPda);
      console.log(auctionAcc.highestBidder);

      const prevHighestBidder = auctionAcc.highestBidder;
      console.log("previous bidder :" , prevHighestBidder);
      
      const bidderTokenAccount = getAssociatedTokenAddressSync(
        mintPublicKey,
        publicKey
      );

      console.log("Place Bid - Buyer: ", publicKey.toBase58());
      console.log("Place Bid - Mint: ", mintPublicKey.toBase58());
      console.log("Place Bid - Auction PDA: ", auctionPda.toBase58());
      console.log("Place Bid - Bid Amount (Lamports): ", bidAmountLamports.toString());

      const remainingAccounts = [
      { pubkey: prevHighestBidder, isWritable: true, isSigner: false },
    ];      

      const placeBidInstruction = await program.methods.placeBid(
        bidAmountLamports
      ).accounts({
        bidder: publicKey,
        nftMint: mintPublicKey,
      })
      .remainingAccounts(remainingAccounts)
      .instruction();

      const transaction = new Transaction();
      transaction.add(placeBidInstruction);

      const txSignature = await provider.sendAndConfirm(transaction, [wallet]);
      console.log("Bid transaction successful:", txSignature);

      // Update local storage with the new highest bid (simulate)
      setListedNftsForAuction(prevNfts =>
        prevNfts.map(item =>
          item.mintAddress === nft.mintAddress
            ? { ...item, currentBid: parseFloat(bidAmountSol), highestBidder: publicKey.toBase58() }
            : item
        )
      );
      // It's important to set the updated array back to localStorage
      localStorage.setItem('listedNftsForAuction', JSON.stringify(listedNftsForAuction));

      toast.success(`Successfully placed a bid of ${bidAmountSol} SOL for ${nft.name}!`, { id: 'place-bid' });

    } catch (error) {
      console.error("Error placing bid:", error);
      let errorMessage = `Failed to place bid. Error: ${error.message || 'Unknown error'}`;
      if (error.logs) {
          console.error("Transaction logs:", error.logs);
          const programLog = error.logs.find(log => log.includes("Program log: AnchorError"));
          if (programLog) {
              errorMessage = programLog.split("Error Message: ")[1] || errorMessage;
          }
      }
      toast.error(errorMessage, { id: 'place-bid', duration: 6000 });
    } finally {
      toast.dismiss('place-bid');
    }
  };

  // --- NEW: Handle Retrieve NFT (for ended auctions with no bids) ---
  const handleRetrieveNft = async (nftToRetrieve) => {
    if (!connected || !publicKey) {
      toast.error("Wallet not connected to retrieve NFT.");
      return;
    }

    if (publicKey.toBase58() !== nftToRetrieve.seller) {
      toast.error("You are not the seller of this NFT. Cannot retrieve.");
      return;
    }

    toast.loading('Retrieving NFT...', { id: 'retrieve-nft' });

    try {
      const mintPublicKey = new PublicKey(nftToRetrieve.mintAddress);
      
      const [auctionAccountPda] = PublicKey.findProgramAddressSync(
        [
          anchor.utils.bytes.utf8.encode("auction"),
          mintPublicKey.toBuffer()
        ],
        program.programId
      );

      const programNftAccount = getAssociatedTokenAddressSync(
        mintPublicKey,
        auctionAccountPda,
        true
      );

      const sellerTokenAccount = getAssociatedTokenAddressSync(
        mintPublicKey,
        publicKey
      );

      console.log("Retrieve NFT - Seller: ", publicKey.toBase58());
      console.log("Retrieve NFT - Mint: ", mintPublicKey.toBase58());
      console.log("Retrieve NFT - Auction PDA: ", auctionAccountPda.toBase58());
      console.log("Retrieve NFT - Program NFT Account: ", programNftAccount.toBase58());
      console.log("Retrieve NFT - Seller Token Account (ATA): ", sellerTokenAccount.toBase58());

      const transaction = new Transaction();

      // Ensure seller's ATA exists
      const sellerAtaInfo = await connection.getAccountInfo(sellerTokenAccount);
      if (!sellerAtaInfo) {
          transaction.add(
              createAssociatedTokenAccountInstruction(
                  publicKey,
                  sellerTokenAccount,
                  publicKey,
                  mintPublicKey
              )
          );
      }
      const retrieveNftInstruction = await program.methods.cancelAuction() // Example instruction name
        .accounts({
          seller: publicKey,
          mint: mintPublicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .instruction();

      transaction.add(retrieveNftInstruction);

      const txSignature = await provider.sendAndConfirm(transaction, []);
      console.log("NFT retrieved successfully, signature:", txSignature);

      // Remove the NFT from listedNftsForAuction after successful retrieval
      const updatedListedNfts = listedNftsForAuction.filter(nft => nft.mintAddress !== nftToRetrieve.mintAddress);
      setListedNftsForAuction(updatedListedNfts);
      localStorage.setItem('listedNftsForAuction', JSON.stringify(updatedListedNfts));

      toast.success('NFT retrieved successfully!', { id: 'retrieve-nft' });
      
    } catch (error) {
      console.error("Error retrieving NFT:", error);
      let errorMessage = `Failed to retrieve NFT. Error: ${error.message || 'Unknown error'}`;

      if (error.logs) {
          console.error("Transaction logs:", error.logs);
          const programLog = error.logs.find(log => log.includes("Program log: AnchorError"));
          if (programLog) {
              errorMessage = programLog.split("Error Message: ")[1] || errorMessage;
              if (errorMessage.includes("AuctionNotEnded") || errorMessage.includes("BidsPresent")) {
                  errorMessage = "Retrieve failed: Auction is not ended or bids are present.";
              }
          } else {
              errorMessage = `Retrieve failed: Simulation failed. Logs: ${error.logs.join('\n')}`;
          }
      }
      toast.error(errorMessage, { id: 'retrieve-nft', duration: 6000 });

    } finally {
      toast.dismiss('retrieve-nft');
    }
  };
  // --- END NEW ---


  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br text-white flex justify-center items-center">
        <p>Loading listed NFTs for auction...</p>
      </div>
    );
  }

  const now = Math.floor(Date.now() / 1000); // Current epoch time in seconds

  return (
    <div className="min-h-screen bg-gradient-to-br text-white p-8 custom-scrollbar-hidden">
      <motion.h1
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className='text-4xl md:text-5xl font-extrabold mb-10 text-center text-transparent bg-clip-text bg-gradient-to-r from-green-400 to-cyan-400'
      >
        NFTs Live for Auction
      </motion.h1>

      {listedNftsForAuction.length === 0 ? (
        <div className='flex flex-col items-center justify-center p-8'>
          <h1 className='text-4xl md:text-5xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 to-pink-500 mb-8 text-center'>
            No NFTs Listed for Auction Yet!
          </h1>
          <p className='text-center text-lg text-gray-400 mt-8 max-w-xl'>
            List your NFTs from your collection to see them here.
          </p>
        </div>
      ) : (
        <AnimatePresence>
          <motion.div
            className='grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-8'
            variants={containerVariants}
            initial="hidden"
            animate="visible"
          >
            {listedNftsForAuction.map((nft) => {
              const auctionEndTime = nft.startTime + nft.duration;
              const timeLeft = auctionEndTime - now;
              const hasStarted = now >= nft.startTime;
              const hasEnded = now >= auctionEndTime;
              const noBids = !nft.currentBid || nft.currentBid === 0; // Check if currentBid is 0 or falsy

              return (
                <motion.div
                  key={nft.mintAddress}
                  className="bg-gray-800 rounded-lg shadow-xl overflow-hidden transform hover:scale-105 transition-transform duration-300 relative border border-gray-700"
                  variants={cardVariants}
                  layout
                >
                  {nft.image ? (
                    <img
                      src={nft.image}
                      alt={nft.name}
                      className="w-full h-48 object-cover"
                    />
                  ) : (
                    <div className="w-full h-48 bg-gray-700 flex items-center justify-center text-gray-400">
                      No Image
                    </div>
                  )}
                  <div className="p-4">
                    <h3 className="text-xl font-bold text-white truncate">{nft.name}</h3>
                    <p className="text-gray-400 text-sm truncate">{nft.symbol}</p>
                    <p className="text-lg font-semibold text-gray-400  mt-2">
                      Initial Price: {nft.initialPrice} SOL
                    </p>
                    {/* Display Current Bid, "No Bids Yet", or "Sold For" */}
                    <p className="text-lg font-semibold text-blue-300">
                      Current Bid: {nft.currentBid ? `${nft.currentBid} SOL` : "No Bids Yet"}
                    </p>
                    <p className="text-sm text-gray-300 mt-2">
                      Time Left: <span className={hasEnded ? "text-red-900 font-bold" : "text-yellow-400 font-bold"}>
                        {formatTimeLeft(timeLeft)}
                      </span>
                    </p>
                    <p className="text-gray-500 text-xs mt-1 break-all">
                      Mint: {nft.mintAddress.substring(0, 6)}...{nft.mintAddress.substring(nft.mintAddress.length - 6)}
                    </p>

                    {/* Conditional Rendering for Buttons */}
                    {connected && publicKey ? (
                      hasEnded ? (
                        // Auction Ended Logic
                        publicKey.toBase58() === nft.seller ? (
                            noBids ? (
                                // Seller, Auction Ended, No Bids: Show Retrieve Button
                                <motion.button
                                    whileHover={{ scale: 1.05 }}
                                    whileTap={{ scale: 0.95 }}
                                    onClick={() => handleRetrieveNft(nft)}
                                    className="mt-4 w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 rounded-md transition-colors duration-200"
                                >
                                    Retrieve NFT
                                </motion.button>
                            ) : (
                                // Seller, Auction Ended, Has Bids: Show "Auction Ended (Sold/Claim)" button
                                // You'll need to implement handleSettleAuction or similar
                                <p className="mt-4 text-center text-green-500 font-bold text-lg">
                                    Auction Ended (Claim/Settle)
                                </p>
                            )
                        ) : (
                            // Not Seller, Auction Ended: Show "Auction Ended" message
                                <p className="mt-4 text-center text-red-900 font-bold text-lg">Auction Ended</p>
                        )
                      ) : !hasStarted ? (
                        // Auction Not Started Logic
                        publicKey.toBase58() === nft.seller ? (
                          // <motion.button
                          //   whileHover={{ scale: 1.05 }}
                          //   whileTap={{ scale: 0.95 }}
                          //   onClick={() => handleCancelAuction(nft)}
                          //   className="mt-4 w-full bg-red-600 hover:bg-red-700 text-white font-semibold py-2 rounded-md transition-colors duration-200"
                          // >
                          //   Cancel Auction
                          // </motion.button>
                          <p className="mt-4 text-center text-orange-400 font-bold text-lg">Auction Not Started</p>

                        ) : (
                          <p className="mt-4 text-center text-orange-400 font-bold text-lg">Auction Not Started Yet</p>
                        )
                      ) : (
                        // Auction Active Logic
                        publicKey.toBase58() === nft.seller ? (
                          // Seller, Auction Active: Show Cancel Button
                          // <motion.button
                          //   whileHover={{ scale: 1.05 }}
                          //   whileTap={{ scale: 0.95 }}
                          //   onClick={() => handleCancelAuction(nft)}
                          //   className="mt-4 w-full bg-red-600 hover:bg-red-700 text-white font-semibold py-2 rounded-md transition-colors duration-200"
                          // >
                          //   Auction started
                          // </motion.button>
                                <p className="mt-4 text-center text-red-500 font-bold text-lg">Auction start</p>
                          
                        ) : (
                          // Not Seller, Auction Active: Show Place Bid Button
                          <motion.button
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                            onClick={() => handlePlaceBid(nft)}
                            className="mt-4 w-full bg-green-600 hover:bg-green-700 text-white font-semibold py-2 rounded-md transition-colors duration-200"
                          >
                            Place Bid
                          </motion.button>
                        )
                      )
                    ) : (
                      // Not connected
                      <p className="mt-4 text-center text-gray-400 text-sm">
                        Connect wallet to participate
                      </p>
                    )}
                  </div>
                </motion.div>
              );
            })}
          </motion.div>
        </AnimatePresence>
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

export default Auction;