// LiveAuction.jsx

import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import * as anchor from "@coral-xyz/anchor";
import { PublicKey, Transaction, SystemProgram, SYSVAR_RENT_PUBKEY, LAMPORTS_PER_SOL } from '@solana/web3.js';
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
      stiffness: 120, // Slightly stronger spring
      damping: 14,    // Slightly more damping
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
  const [currentBid, setCurrentBid] = useState(null);
  const { publicKey, wallet, connected } = useWallet();

  // Initialize Anchor provider and program once using useCallback for memoization
  // const getProgram = useCallback(() => {
  //   if (!connection || !wallet?.adapter) return null; // Ensure connection and wallet are available
  //   // Ensure idl is a valid object before passing
  //   if (!idl || !idl.metadata || !idl.metadata.address) {
  //       console.error("IDL is invalid or missing program ID.");
  //       return null;
  //   }
  //   const provider = new anchor.AnchorProvider(
  //     connection,
  //     wallet.adapter,
  //     anchor.AnchorProvider.defaultOptions()
  //   );
  //   // Use the program ID from the IDL metadata
  //   return new anchor.Program(idl, provider);
  // }, [connection, wallet]);


  const provider = new anchor.AnchorProvider(
    connection,
    wallet.adapter,
    anchor.AnchorProvider.defaultOptions()
  );
  anchor.setProvider(provider);
  const program = new anchor.Program(idl, provider);
  console.log("program : ", program);


  // const program = getProgram(); // Get the program instance


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
    if (!program) { 
      toast.error("Program not initialized. Please connect your wallet.");
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
        true // Allow owner to be a PDA
      );

      const sellerTokenAccount = getAssociatedTokenAddressSync(
        mintPublicKey,
        publicKey
      );

      // Fetch the auction state to get precise current_bid and highest_bidder
      let auctionAcc;
      try {
          auctionAcc = await program.account.auction.fetch(auctionAccountPda);
          console.log("Fetched auction account for cancel:", auctionAcc);
      } catch (fetchError) {
          console.error("Could not fetch auction account, it might not exist:", fetchError);
          toast.error("Auction not found on-chain. It might already be cancelled or not listed.", { id: 'cancel-auction' });
          return;
      }
      
      // Ensure there are no bids before attempting to cancel an active auction
      // Or ensure it's ended with no bids for a "retrieve" type of cancel
      if (auctionAcc.currentBid.gtn(0) || auctionAcc.highestBidder.toBase58() !== PublicKey.default().toBase58()) { 
          toast.error("Cannot cancel auction with active bids. Wait for it to end.", { id: 'cancel-auction' });
          return;
      }


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
          clock: SYSVAR_RENT_PUBKEY, 
        })
        .instruction();

      transaction.add(cancelAuctionInstruction);

      const txSignature = await program.provider.sendAndConfirm(transaction, []); 
      console.log("Cancel auction successful, signature:", txSignature);

      const updatedListedNfts = listedNftsForAuction.filter(nft => nft.mintAddress !== nftToCancel.mintAddress);
      setListedNftsForAuction(updatedListedNfts);
      localStorage.setItem('listedNftsForAuction', JSON.stringify(updatedNfts));
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
              } else if (errorMessage.includes("AuctionIsActive")) {
                  errorMessage = "Cannot cancel: Auction is still active or has not ended yet.";
              } else if (errorMessage.includes("IllegalCancelAuction")) { 
                  errorMessage = "Cannot cancel: Bids are present for this auction. Must settle instead.";
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
    if (!program) { 
      toast.error("Program not initialized. Please connect your wallet.");
      return;
    }
    if (publicKey.toBase58() === nft.seller) {
      toast.error("You cannot bid on your own NFT auction!");
      return;
    }

    // --- Start Simplified Bid Logic ---

    // Fetch the current auction state from chain for accuracy
    const mintPublicKey = new PublicKey(nft.mintAddress);
    const [auctionPda] = PublicKey.findProgramAddressSync(
      [
        anchor.utils.bytes.utf8.encode("auction"),
        mintPublicKey.toBuffer()
      ],
      program.programId
    );

    let auctionAcc;
    try {
      auctionAcc = await program.account.auction.fetch(auctionPda);
      console.log("Fetched auction account for bid:", auctionAcc);
      setCurrentBid(auctionAcc.currentBid.toNumber())
    } catch (fetchError) {
      console.error("Could not fetch auction account, it might not exist or be closed:", fetchError);
      setCurrentBid(null);
      toast.error("Auction not found on-chain or has ended/cancelled.", { id: 'place-bid' });
      return;
    }

    // Convert fetched current bid and start price to BN for comparison
    const onChainCurrentBidLamports = new anchor.BN(auctionAcc.currentBid.toString());
    const onChainInitialPriceLamports = new anchor.BN(auctionAcc.satrtPrice.toString()); 

    // Determine the minimum bid required by the smart contract
    const minimumBidRequiredLamports = onChainCurrentBidLamports.isZero()
        ? onChainInitialPriceLamports
        : onChainCurrentBidLamports.add(new anchor.BN(1));

    // Convert the minimum required bid to SOL for user display
    const minimumBidRequiredSol = minimumBidRequiredLamports.toNumber() / LAMPORTS_PER_SOL; 

    // Prompt for bid amount
    const bidAmountSol = prompt(
        `Enter your bid amount for ${nft.name}.\n` +
        `Current highest bid: ${currentBid? `${currentBid} SOL` : `${nft.initialPrice} SOL (starting price)`}.\n` +
        `Minimum bid required: ${minimumBidRequiredSol.toFixed(9)} SOL.`
    );

    if (!bidAmountSol) {
        toast("Bid cancelled.", { icon: '👋' });
        return;
    }

    const parsedBidAmount = parseFloat(bidAmountSol);
    if (isNaN(parsedBidAmount) || parsedBidAmount <= 0) {
        toast.error("Please enter a valid positive number for your bid.");
        return;
    }

    const bidAmountLamports = new anchor.BN(parsedBidAmount * LAMPORTS_PER_SOL);

    // Primary validation check: Is the bid amount sufficient based on the calculated minimum?
    if (bidAmountLamports.lt(minimumBidRequiredLamports)) {
        toast.error(`Your bid of ${parsedBidAmount} SOL is too low. Please bid at least ${minimumBidRequiredSol.toFixed(9)} SOL.`);
        return;
    }
    
    // Check if bidder is already the highest bidder (if not first bid)
    if (!onChainCurrentBidLamports.isZero() && auctionAcc.highestBidder.toBase58() === publicKey.toBase58()) {
        toast.error("You are already the highest bidder. To increase your bid, you must enter a strictly higher amount.");
        return;
    }


    toast.loading(`Placing bid of ${bidAmountSol} SOL for ${nft.name}...`, { id: 'place-bid' });
    try {
      // Determine remaining accounts dynamically
      const remainingAccounts = [];
      // Only add prevHighestBidder if there was a previous highest bidder and they are not Pubkey::default()
      if (onChainCurrentBidLamports.gtn(0) && auctionAcc.highestBidder.toBase58() !== SystemProgram.programId.toBase58()) {
        remainingAccounts.push({
          pubkey: auctionAcc.highestBidder,
          isWritable: true,
          isSigner: false,
        });
      }
      
      console.log("Place Bid - Bidder: ", publicKey.toBase58());
      console.log("Place Bid - Mint: ", mintPublicKey.toBase58());
      console.log("Place Bid - Auction PDA: ", auctionPda.toBase58());
      console.log("Place Bid - Bid Amount (Lamports): ", bidAmountLamports.toString());
      console.log("Place Bid - Remaining Accounts (Prev Highest Bidder):", remainingAccounts.length > 0 ? remainingAccounts[0].pubkey.toBase58() : "None");


      const bidPda = PublicKey.findProgramAddressSync(
          [
              anchor.utils.bytes.utf8.encode("escrow"),
              mintPublicKey.toBuffer(),
          ],
          program.programId
      )[0]; 

      // Construct accounts object for placeBid
      const accounts = {
        bidder: publicKey,
        nftMint: mintPublicKey,
      };

      const placeBidInstruction = await program.methods.placeBid(
        bidAmountLamports
      ).accounts(accounts)
      .remainingAccounts(remainingAccounts)
      .instruction();

      const transaction = new Transaction();
      transaction.add(placeBidInstruction);

      const { blockhash, lastValidBlockHeight } = await provider.connection.getLatestBlockhash('finalized');
      transaction.recentBlockhash = blockhash;
      transaction.lastValidBlockHeight = lastValidBlockHeight;

      transaction.feePayer = publicKey;

      const signedTransaction = await wallet.adapter.signTransaction(transaction);
      const txSign = await provider.connection.sendRawTransaction(signedTransaction.serialize());
      await provider.connection.confirmTransaction(txSign, "confirmed");

      console.log("current bid is : ", currentBid);

      // Update local storage with the new highest bid (simulate)
      setListedNftsForAuction(prevNfts =>
        prevNfts.map(item =>
          item.mintAddress === nft.mintAddress
            ? { ...item, currentBid: parseFloat(bidAmountSol), highestBidder: publicKey.toBase58() }
            : item
        )
      );
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
              if (errorMessage.includes("AuctionTimeOver")) {
                  errorMessage = "Bid failed: Auction time has ended.";
              } else if (errorMessage.includes("AuctionIsNotStarted")) {
                  errorMessage = "Bid failed: Auction has not started yet.";
              } else if (errorMessage.includes("BidNotValid") || errorMessage.includes("CurrentBidIsNotValid")) { 
                  errorMessage = "Bid failed: Please enter a strictly higher valid bid.";
              } else if (errorMessage.includes("InsufficientBalance")) {
                  errorMessage = "Bid failed: Insufficient SOL balance in your wallet.";
              } else if (errorMessage.includes("CurrentBidderIsNotValid")) {
                  errorMessage = "Bid failed: You are the seller or already the highest bidder (or an invalid bidder).";
              }
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
    if (!program) { 
      toast.error("Program not initialized. Please connect your wallet.");
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

      const [bidPda] = PublicKey.findProgramAddressSync(
          [
              anchor.utils.bytes.utf8.encode("escrow"), 
              mintPublicKey.toBuffer(),
          ],
          program.programId
      );


      // Fetch the auction state to get precise current_bid and highest_bidder
      let auctionAcc;
      try {
          auctionAcc = await program.account.auction.fetch(auctionAccountPda);
          console.log("Fetched auction account for retrieve:", auctionAcc);
      } catch (fetchError) {
          console.error("Could not fetch auction account, it might not exist:", fetchError);
          toast.error("Auction not found on-chain. It might already be cancelled or not listed.", { id: 'retrieve-nft' });
          return;
      }
      
      // Ensure auction has ended AND no bids were placed
      const now = Math.floor(Date.now() / 1000); 
      const hasEnded = now >= auctionAcc.endTime.toNumber(); 
      const noBids = auctionAcc.currentBid.isZero() || auctionAcc.highestBidder.toBase58() === PublicKey.default().toBase58();

      if (!hasEnded) {
          toast.error("Cannot retrieve NFT: Auction has not ended yet.", { id: 'retrieve-nft' });
          return;
      }
      if (!noBids) {
          toast.error("Cannot retrieve NFT: Bids were placed. Use the 'Settle Auction' function instead.", { id: 'retrieve-nft' });
          return;
      }

      console.log("Retrieve NFT - Seller: ", publicKey.toBase58());
      console.log("Retrieve NFT - Mint: ", mintPublicKey.toBase58());
      console.log("Retrieve NFT - Auction PDA: ", auctionAccountPda.toBase58());
      console.log("Retrieve NFT - Program NFT Account: ", programNftAccount.toBase58());
      console.log("Retrieve NFT - Seller Token Account (ATA): ", sellerTokenAccount.toBase58());
      console.log("Retrieve NFT - Bid PDA (SOL Escrow): ", bidPda.toBase58());


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
      
      const retrieveNftInstruction = await program.methods.cancelAuction() 
        .accounts({
          seller: publicKey,
          nftMint: mintPublicKey, 
          auctionAccount: auctionAccountPda,
          programNftAccount: programNftAccount, 
          sellerTokenAccount: sellerTokenAccount, 
          bidPda: bidPda, 
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          clock: SYSVAR_RENT_PUBKEY, 
        })
        .instruction();

      transaction.add(retrieveNftInstruction);

      const txSignature = await program.provider.sendAndConfirm(transaction, []);
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
              if (errorMessage.includes("AuctionIsActive")) {
                  errorMessage = "Retrieve failed: Auction is still active or has not ended yet.";
              } else if (errorMessage.includes("IllegalCancelAuction")) { 
                  errorMessage = "Retrieve failed: Bids are present for this auction. Cannot retrieve, must settle.";
              } else if (errorMessage.includes("AccountNotInitialized")) {
                  errorMessage = "Retrieve failed: Auction or associated accounts not found on-chain.";
              }
          }
      }
      toast.error(errorMessage, { id: 'retrieve-nft', duration: 6000 });

    } finally {
      toast.dismiss('retrieve-nft');
    }
  };


  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-950 to-black text-white flex justify-center items-center p-4">
        <p className="text-xl md:text-2xl font-semibold animate-pulse">Loading live auctions...</p>
      </div>
    );
  }

  const now = Math.floor(Date.now() / 1000); 

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-950 to-black text-gray-100 p-4 md:p-8 custom-scrollbar-hidden">
      <motion.h1
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className='text-4xl sm:text-5xl md:text-6xl font-extrabold mb-10 md:mb-12 text-center text-transparent bg-clip-text bg-gradient-to-r from-purple-400 via-pink-500 to-red-500'
      >
        NFTs Live for Auction
      </motion.h1>

      {listedNftsForAuction.length === 0 ? (
        <div className='flex flex-col items-center justify-center p-8 text-center'>
          <h1 className='text-3xl sm:text-4xl md:text-5xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-green-400 mb-6'>
            No NFTs Listed for Auction Yet!
          </h1>
          <p className='text-lg md:text-xl text-gray-400 mt-4 max-w-xl mx-auto'>
            List your NFTs from your collection to see them here.
          </p>
        </div>
      ) : (
        <AnimatePresence>
          <motion.div
            className='grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-6 md:gap-8'
            variants={containerVariants}
            initial="hidden"
            animate="visible"
          >
            {listedNftsForAuction.map((nft) => {
              const auctionEndTime = nft.startTime + nft.duration;
              const timeLeft = auctionEndTime - now;
              const hasStarted = now >= nft.startTime;
              const hasEnded = now >= auctionEndTime;
              const noBids = !currentBid || currentBid === 0; 

              return (
                <motion.div
                  key={nft.mintAddress}
                  className="bg-gray-800/60 backdrop-blur-sm rounded-xl shadow-lg hover:shadow-2xl hover:border-purple-500 border border-gray-700 transition-all duration-300 relative overflow-hidden flex flex-col"
                  variants={cardVariants}
                  layout
                >
                  {nft.image ? (
                    <img
                      src={nft.image}
                      alt={nft.name}
                      className="w-full h-48 object-cover rounded-t-xl"
                    />
                  ) : (
                    <div className="w-full h-48 bg-gray-700 flex items-center justify-center text-gray-400 text-lg">
                      No Image
                    </div>
                  )}
                  <div className="p-4 flex flex-col flex-grow"> 
                    <h3 className="text-xl font-bold text-white truncate mb-1">{nft.name}</h3>
                    <p className="text-gray-400 text-sm truncate mb-2">{nft.symbol}</p>
                    <p className="text-lg font-semibold text-gray-300">
                      Initial Price: <span className="font-bold text-gray-500">{nft.initialPrice} SOL</span>
                    </p>
                    <p className="text-lg font-semibold text-blue-300 mb-2">
                      {/* Current Bid: <span className="font-bold">{currentBid ? `${currentBid} SOL` : "No Bids Yet"}</span> */}
                    </p>
                    <p className="text-sm text-gray-300 mt-auto">
                      Time Left: <span className={hasEnded ? "text-red-900 font-bold" : "text-yellow-400 font-bold"}>
                        {formatTimeLeft(timeLeft)}
                      </span>
                    </p>
                    <p className="text-gray-500 text-xs mt-2 break-all">
                      Mint: {nft.mintAddress.substring(0, 6)}...{nft.mintAddress.substring(nft.mintAddress.length - 6)}
                    </p>

                    <div className="mt-4">
                      {connected && publicKey ? (
                        hasEnded ? (
                          publicKey.toBase58() === nft.seller ? (
                              noBids ? (
                                  <motion.button
                                      whileHover={{ scale: 1.05 }}
                                      whileTap={{ scale: 0.95 }}
                                      onClick={() => handleRetrieveNft(nft)}
                                      className="w-full bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white font-bold py-2 rounded-md transition-all duration-200 text-base shadow-md hover:shadow-lg"
                                  >
                                      Retrieve NFT
                                  </motion.button>
                              ) : (
                                  <p className="text-center text-green-400 font-extrabold text-base md:text-lg animate-pulse">
                                      Auction Ended (Claim/Settle)
                                  </p>
                              )
                          ) : (
                                  <p className="text-center text-red-900 font-extrabold text-base md:text-lg">Auction Ended</p>
                          )
                        ) : !hasStarted ? (
                          publicKey.toBase58() === nft.seller ? (
                            <p className="text-center text-orange-400 font-extrabold text-base md:text-lg">Auction Not Started</p>

                          ) : (
                            <p className="text-center text-orange-400 font-extrabold text-base md:text-lg">Auction Not Started Yet</p>
                          )
                        ) : (
                          publicKey.toBase58() === nft.seller ? (
                            <p className="text-center text-red-500 font-extrabold text-base md:text-lg">Auction Live (Your NFT)</p>
                            
                          ) : (
                            <motion.button
                              whileHover={{ scale: 1.05 }}
                              whileTap={{ scale: 0.95 }}
                              onClick={() => handlePlaceBid(nft)}
                              className="w-full bg-gradient-to-r from-green-500 to-blue-500 hover:from-green-600 hover:to-blue-600 text-white font-bold py-2 rounded-md transition-all duration-200 text-base shadow-md hover:shadow-lg"
                            >
                              Place Bid
                            </motion.button>
                          )
                        )
                      ) : (
                        <p className="text-center text-gray-400 text-sm py-2">
                          Connect wallet to participate
                        </p>
                      )}
                    </div>
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