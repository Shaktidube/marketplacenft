import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import * as anchor from "@coral-xyz/anchor";
import { PublicKey, Transaction, SystemProgram, SYSVAR_RENT_PUBKEY, SYSVAR_CLOCK_PUBKEY, LAMPORTS_PER_SOL } from '@solana/web3.js';
import idl from "../idl/marketplacenft.json";
import toast from 'react-hot-toast';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID, createAssociatedTokenAccountInstruction, getAssociatedTokenAddressSync } from '@solana/spl-token';
import { NavLink } from 'react-router-dom';

const cardVariants = {
  hidden: { opacity: 0, y: 50, scale: 0.8 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: {
      type: "spring",
      stiffness: 120,
      damping: 14,
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

// Full-screen success animation variants
const fullScreenSuccessVariants = {
  hidden: { opacity: 0, scale: 0.8 },
  visible: {
    opacity: 1,
    scale: 1,
    transition: {
      type: "spring",
      stiffness: 150,
      damping: 10,
      when: "beforeChildren",
      staggerChildren: 0.1,
    },
  },
  exit: {
    opacity: 0,
    scale: 1.2,
    transition: {
      duration: 0.5,
    },
  },
};

const textVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0 },
};

function Auction() {
  const [listedNftsForAuction, setListedNftsForAuction] = useState([]);
  const [loading, setLoading] = useState(true);
  const { connection } = useConnection();
  const [currentBids, setCurrentBids] = useState({});
  const [bidLoadingStates, setBidLoadingStates] = useState({});
  const [showFullScreenSuccess, setShowFullScreenSuccess] = useState(false);
  const [successfulBidNftName, setSuccessfulBidNftName] = useState("");
  const { publicKey, wallet, connected } = useWallet();

  // State to hold the current on-chain time (updated less frequently, source of truth)
  const [onChainCurrentTime, setOnChainCurrentTime] = useState(0);
  // State for local display time (updated every second for smooth countdown)
  const [localDisplayTime, setLocalDisplayTime] = useState(Math.floor(Date.now() / 1000));

  const programRef = useRef(null);

  const getProgram = useCallback(() => {
    if (!connection || !wallet?.adapter) return null;

    if (programRef.current) {
        return programRef.current;
    }

    const provider = new anchor.AnchorProvider(
      connection,
      wallet.adapter,
      anchor.AnchorProvider.defaultOptions()
    );
    anchor.setProvider(provider);
    const programInstance = new anchor.Program(idl, provider);
    programRef.current = programInstance;
    console.log("Program initialized:", programInstance);
    return programInstance;
  }, [connection, wallet]);

  const program = getProgram();

  // Effect to fetch initial on-chain time and update it periodically
  useEffect(() => {
    const fetchOnChainTime = async () => {
      if (!connection) return;
      try {
        const clockAcc = await connection.getAccountInfo(SYSVAR_CLOCK_PUBKEY);
        if (clockAcc) {
          // Solana clock data structure:
          // 0-7: slot (u64)
          // 8-15: epoch_start_timestamp (i64)
          // 16-23: epoch (u64)
          // 24-31: leader_schedule_epoch (u64)
          // 32-39: unix_timestamp (i64) -> This is the one we want for current time
          const unixTimestamp = new anchor.BN(clockAcc.data.slice(32, 40), "le").toNumber();
          setOnChainCurrentTime(unixTimestamp);
        }
      } catch (error) {
        console.error("Failed to fetch on-chain clock:", error);
      }
    };

    fetchOnChainTime(); // Fetch immediately on mount

    // const intervalId = setInterval(fetchOnChainTime, 15000); // Update on-chain time every 15 seconds
// 
    // return () => clearInterval(intervalId); // Cleanup interval
  }, [connection]);

  // Effect to update local display time every second
  useEffect(() => {
    const interval = setInterval(() => {
      setLocalDisplayTime(Math.floor(Date.now() / 1000));
    }, 1000); // Update every 1 second
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const storedListedNfts = localStorage.getItem('listedNftsForAuction');
    if (storedListedNfts) {
      try {
        const parsedNfts = JSON.parse(storedListedNfts);
        // Filter out auctions that have already ended based on current local time initially
        // This will be refined by onChainCurrentTime below when bids are fetched
        const now = Math.floor(Date.now() / 1000); // Use local time for initial filter
        const activeAuctions = parsedNfts.filter(nft => (nft.startTime + nft.duration) > now);
        setListedNftsForAuction(activeAuctions);
      } catch (e) {
        console.error("Failed to parse listed NFTs from localStorage", e);
        setListedNftsForAuction([]);
      }
    }
    setLoading(false);
  }, []);

  const delay = ms => new Promise(res => setTimeout(res, ms));

  const fetchAllCurrentBids = useCallback(async (nfts) => {
    if (!program || nfts.length === 0) return;

    const bids = {};
    const batchSize = 5;
    const batchDelayMs = 500;

    for (let i = 0; i < nfts.length; i += batchSize) {
      const batch = nfts.slice(i, i + batchSize);
      const promises = batch.map(async (nft) => {
        try {
          setBidLoadingStates(prev => ({ ...prev, [nft.mintAddress]: true }));

          const mintPublicKey = new PublicKey(nft.mintAddress);
          const [auctionPda] = PublicKey.findProgramAddressSync(
            [
              anchor.utils.bytes.utf8.encode("auction"),
              mintPublicKey.toBuffer()
            ],
            program.programId
          );

          const auctionAcc = await program.account.auction.fetch(auctionPda);
          bids[nft.mintAddress] = auctionAcc.currentBid.toNumber() / LAMPORTS_PER_SOL;

          // Crucial: Re-evaluate auction end based on the latest on-chain time
          // and the fetched auction's endTime here, right after fetching.
          if (onChainCurrentTime !== 0 && onChainCurrentTime >= auctionAcc.endTime.toNumber()) {
            console.log(`Auction for ${nft.name} detected as ended on-chain. Removing from live list.`);
            setListedNftsForAuction(prev => {
                const updated = prev.filter(item => item.mintAddress !== nft.mintAddress);
                localStorage.setItem('listedNftsForAuction', JSON.stringify(updated));
                return updated;
            });
            setCurrentBids(prev => {
                const newBids = { ...prev };
                delete newBids[nft.mintAddress];
                return newBids;
            });
            toast(`Auction for ${nft.name} has ended! Check your "My Auctions" page to settle.`, { duration: 5000 });
          }

        } catch (error) {
          console.warn(`Could not fetch bid for ${nft.name} (${nft.mintAddress.substring(0, 6)}...):`, error.message);
          bids[nft.mintAddress] = 0;
        } finally {
          setBidLoadingStates(prev => ({ ...prev, [nft.mintAddress]: false }));
        }
      });

      await Promise.all(promises);
      if (i + batchSize < nfts.length) {
        await delay(batchDelayMs);
      }
    }
    setCurrentBids(bids);
  }, [program, onChainCurrentTime]); // Add onChainCurrentTime to dependencies here too

  useEffect(() => {
    if (!loading && listedNftsForAuction.length > 0 && program) {
      // Fetch bids only for currently active auctions after initial load/filter
      fetchAllCurrentBids(listedNftsForAuction);

      const subscriptions = [];
      listedNftsForAuction.forEach(nft => {
        try {
          const mintPublicKey = new PublicKey(nft.mintAddress);
          const [auctionPda] = PublicKey.findProgramAddressSync(
            [
              anchor.utils.bytes.utf8.encode("auction"),
              mintPublicKey.toBuffer()
            ],
            program.programId
          );

          const subscriptionId = connection.onAccountChange(
            auctionPda,
            (accountInfo) => {
              try {
                const decodedAccount = program.coder.accounts.decode("auction", accountInfo.data);
                const newBid = decodedAccount.currentBid.toNumber() / LAMPORTS_PER_SOL;
                // const newHighestBidder = decodedAccount.highestBidder.toBase58(); // Not directly used here, but good to know

                setCurrentBids(prev => {
                  const currentNftBid = prev[nft.mintAddress] || 0;
                  if (newBid > currentNftBid) {
                      toast(`New bid on ${nft.name}! Current: ${newBid.toFixed(9)} SOL`, {
                          icon: '🚀',
                          duration: 3000,
                      });
                      return { ...prev, [nft.mintAddress]: newBid };
                  }
                  return prev;
                });

                // Check if auction ended based on on-chain data
                // Use onChainCurrentTime for more accurate check if available
                const checkTime = onChainCurrentTime; // Use the most recently fetched onChainCurrentTime
                if (checkTime !== 0 && checkTime >= decodedAccount.endTime.toNumber()) {
                    console.log(`Auction for ${nft.name} has ended via account change listener. Removing from live list.`);
                    setListedNftsForAuction(prev => {
                        const updated = prev.filter(item => item.mintAddress !== nft.mintAddress);
                        localStorage.setItem('listedNftsForAuction', JSON.stringify(updated));
                        return updated;
                    });
                    setCurrentBids(prev => { // Also remove its bid from state
                      const newBids = { ...prev };
                      delete newBids[nft.mintAddress];
                      return newBids;
                    });
                    toast(`Auction for ${nft.name} has ended! Check your "My Auctions" page to settle.`, { duration: 5000 });
                }

              } catch (decodeError) {
                console.error("Error decoding account on change:", decodeError);
              }
            },
            "confirmed"
          );
          subscriptions.push(subscriptionId);
        } catch (subError) {
          console.error(`Error setting up subscription for ${nft.mintAddress}:`, subError);
        }
      });

      return () => {
        subscriptions.forEach(id => connection.removeAccountChangeListener(id));
      };

    }
  }, [loading, listedNftsForAuction, program, connection, fetchAllCurrentBids, onChainCurrentTime]); // Add onChainCurrentTime to dependencies

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
        true
      );

      const sellerTokenAccount = getAssociatedTokenAddressSync(
        mintPublicKey,
        publicKey
      );

      let auctionAcc;
      try {
          auctionAcc = await program.account.auction.fetch(auctionAccountPda);
      } catch (fetchError) {
          console.error("Could not fetch auction account, it might not exist:", fetchError);
          toast.error("Auction not found on-chain. It might already be cancelled or not listed.", { id: 'cancel-auction' });
          return;
      }

      // Check for bids BEFORE trying to cancel.
      // Use the actual highestBidder from on-chain data.
      if (auctionAcc.currentBid.gtn(0) || auctionAcc.highestBidder.toBase58() !== SystemProgram.programId.toBase58()) {
          toast.error("Cannot cancel auction with active bids. Wait for it to end, then use 'Settle Auction'.", { id: 'cancel-auction' });
          return;
      }

      const transaction = new Transaction();

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
          clock: SYSVAR_CLOCK_PUBKEY,
        })
        .instruction();

      transaction.add(cancelAuctionInstruction);

      const txSignature = await program.provider.sendAndConfirm(transaction, []);
      console.log("Cancel auction successful, signature:", txSignature);

      // Remove from the live list immediately
      const updatedListedNfts = listedNftsForAuction.filter(nft => nft.mintAddress !== nftToCancel.mintAddress);
      setListedNftsForAuction(updatedListedNfts);
      localStorage.setItem('listedNftsForAuction', JSON.stringify(updatedListedNfts)); // Update local storage too
      setCurrentBids(prev => {
        const newBids = { ...prev };
        delete newBids[nftToCancel.mintAddress];
        return newBids;
      });
      toast.success('Auction cancelled successfully!', { id: 'cancel-auction' });

    } catch (error) {
      console.error("Error cancelling auction:", error);
      let errorMessage = `Failed to cancel auction. Error: ${error.message || 'Unknown error'}`;

      if (error.logs) {
          const programLog = error.logs.find(log => log.includes("Program log: AnchorError"));
          if (programLog) {
              errorMessage = programLog.split("Error Message: ")[1] || errorMessage;
              if (errorMessage.includes("AccountNotInitialized")) {
                  errorMessage = "Cancel failed: Auction listing not found on-chain. Did it fail to start initially or already cancelled?";
              } else if (errorMessage.includes("AuctionIsActive")) {
                  errorMessage = "Cannot cancel: Auction is still active or has not ended yet. If there are bids, settle instead.";
              } else if (errorMessage.includes("IllegalCancelAuction")) {
                  errorMessage = "Cannot cancel: Bids are present for this auction. Must settle instead.";
              }
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

    setBidLoadingStates(prev => ({ ...prev, [nft.mintAddress]: true }));

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
    } catch (fetchError) {
      console.error("Could not fetch auction account, it might not exist or be closed:", fetchError);
      toast.error("Auction not found on-chain or has ended/cancelled.", { id: 'place-bid' });
      setBidLoadingStates(prev => ({ ...prev, [nft.mintAddress]: false }));
      return;
    }

    // Use the onChainCurrentTime state variable for accurate start/end checks
    if (onChainCurrentTime === 0) { // Should not happen if loading state is handled
        toast.error("Blockchain time not synchronized yet. Please wait a moment.", { id: 'place-bid' });
        setBidLoadingStates(prev => ({ ...prev, [nft.mintAddress]: false }));
        return;
    }
    if (onChainCurrentTime >= auctionAcc.endTime.toNumber()) {
      toast.error("This auction has already ended!", { id: 'place-bid' });
      // Remove from UI if it ended
      setListedNftsForAuction(prev => {
        const updated = prev.filter(item => item.mintAddress !== nft.mintAddress);
        localStorage.setItem('listedNftsForAuction', JSON.stringify(updated));
        return updated;
      });
      setBidLoadingStates(prev => ({ ...prev, [nft.mintAddress]: false }));
      return;
    }
    if (onChainCurrentTime < auctionAcc.startTime.toNumber()) {
        toast.error("This auction has not started yet!", { id: 'place-bid' });
        setBidLoadingStates(prev => ({ ...prev, [nft.mintAddress]: false }));
        return;
    }

    const onChainCurrentBidLamports = new anchor.BN(auctionAcc.currentBid.toString());
    const onChainInitialPriceLamports = new anchor.BN(auctionAcc.satrtPrice.toString());

    const minimumBidRequiredLamports = onChainCurrentBidLamports.isZero()
        ? onChainInitialPriceLamports
        : onChainCurrentBidLamports.add(new anchor.BN(1)); // Increment by 1 lamport

    const minimumBidRequiredSol = minimumBidRequiredLamports.toNumber() / LAMPORTS_PER_SOL;

    const currentBidForPrompt = (onChainCurrentBidLamports.toNumber() / LAMPORTS_PER_SOL);
    const currentBidPromptText = currentBidForPrompt > 0
        ? `Current highest bid: ${currentBidForPrompt.toFixed(9)} SOL.`
        : `Starting price: ${nft.initialPrice} SOL (no bids yet).`;

    const bidAmountSol = prompt(
        `Enter your bid amount for ${nft.name}.\n` +
        `${currentBidPromptText}\n` +
        `Minimum bid required: ${minimumBidRequiredSol.toFixed(9)} SOL.`
    );

    if (!bidAmountSol) {
        toast("Bid cancelled.", { icon: '👋' });
        setBidLoadingStates(prev => ({ ...prev, [nft.mintAddress]: false }));
        return;
    }

    const parsedBidAmount = parseFloat(bidAmountSol);
    if (isNaN(parsedBidAmount) || parsedBidAmount <= 0) {
        toast.error("Please enter a valid positive number for your bid.");
        setBidLoadingStates(prev => ({ ...prev, [nft.mintAddress]: false }));
        return;
    }

    const bidAmountLamports = new anchor.BN(parsedBidAmount * LAMPORTS_PER_SOL);

    if (bidAmountLamports.lt(minimumBidRequiredLamports)) {
        toast.error(`Your bid of ${parsedBidAmount} SOL is too low. Please bid at least ${minimumBidRequiredSol.toFixed(9)} SOL.`);
        setBidLoadingStates(prev => ({ ...prev, [nft.mintAddress]: false }));
        return;
    }

    if (!onChainCurrentBidLamports.isZero() && auctionAcc.highestBidder.toBase58() === publicKey.toBase58()) {
        toast.error("You are already the highest bidder. To increase your bid, you must enter a strictly higher amount.");
        setBidLoadingStates(prev => ({ ...prev, [nft.mintAddress]: false }));
        return;
    }

    toast.loading(`Placing bid of ${parsedBidAmount} SOL for ${nft.name}...`, { id: 'place-bid' });
    try {
      const remainingAccounts = [];
      // If there's an existing highest bidder (and it's not the SystemProgram default, which means no bids yet),
      // add them to remaining accounts for SOL refund.
      if (auctionAcc.currentBid.gtn(0) && auctionAcc.highestBidder.toBase58() !== SystemProgram.programId.toBase58()) {
        remainingAccounts.push({
          pubkey: auctionAcc.highestBidder,
          isWritable: true,
          isSigner: false,
        });
      }

      const [bidPda] = PublicKey.findProgramAddressSync(
          [
              anchor.utils.bytes.utf8.encode("escrow"),
              mintPublicKey.toBuffer(),
          ],
          program.programId
      );

      const accounts = {
        bidder: publicKey,
        nftMint: mintPublicKey,
        auctionAccount: auctionPda,
        bidPda: bidPda,
        systemProgram: SystemProgram.programId,
        rent: SYSVAR_RENT_PUBKEY,
        clock: SYSVAR_CLOCK_PUBKEY,
      };

      const placeBidInstruction = await program.methods.placeBid(
        bidAmountLamports
      ).accounts(accounts)
      .remainingAccounts(remainingAccounts)
      .instruction();

      const transaction = new Transaction();
      transaction.add(placeBidInstruction);

      const { blockhash, lastValidBlockHeight } = await program.provider.connection.getLatestBlockhash('finalized');
      transaction.recentBlockhash = blockhash;
      transaction.lastValidBlockHeight = lastValidBlockHeight;

      transaction.feePayer = publicKey;

      const signedTransaction = await wallet.adapter.signTransaction(transaction);
      const txSign = await program.provider.connection.sendRawTransaction(signedTransaction.serialize());
      await program.provider.connection.confirmTransaction(txSign, "confirmed");

      // Update bids immediately in UI for optimistic display
      setCurrentBids(prev => ({
        ...prev,
        [nft.mintAddress]: parsedBidAmount,
      }));

      // Update listedNftsForAuction with the new bid and highest bidder
      setListedNftsForAuction(prevNfts => {
          const updatedNfts = prevNfts.map(item =>
              item.mintAddress === nft.mintAddress
                  ? { ...item, currentBid: parsedBidAmount, highestBidder: publicKey.toBase58() } // Update highestBidder as well
                  : item
          );
          localStorage.setItem('listedNftsForAuction', JSON.stringify(updatedNfts));
          return updatedNfts;
      });

      toast.success(`Successfully placed a bid of ${parsedBidAmount} SOL for ${nft.name}!`, { id: 'place-bid' });

      setSuccessfulBidNftName(nft.name);
      setShowFullScreenSuccess(true);
      setTimeout(() => setShowFullScreenSuccess(false), 3000);

    } catch (error) {
      console.error("Error placing bid:", error);
      let errorMessage = `Failed to place bid. Error: ${error.message || 'Unknown error'}`;

      // --- NEW LOGIC FOR HANDLING USER CANCELLATION ---
      if (error.name === 'WalletSignTransactionError') {
          // This is a common error message for rejection across many adapters
          errorMessage = "Transaction cancelled by user.";
          toast.error(errorMessage, { id: 'place-bid', duration: 3000 });
          return; // Exit early, no need for further error parsing or general error toast
      }
      if (error.name === 'WalletAdapterRpcError' && error.message.includes('User rejected the request')) {
          // Some adapters might throw an RpcError with rejection message
          errorMessage = "Transaction cancelled by user.";
          toast.error(errorMessage, { id: 'place-bid', duration: 3000 });
          return; // Exit early
      }
      // Often, a simple click outside might just be a generic "transaction rejected" or "cancelled"
      if (error.message && (error.message.includes('User rejected') || error.message.includes('cancelled'))) {
          errorMessage = "Transaction cancelled by user.";
          toast.error(errorMessage, { id: 'place-bid', duration: 3000 });
          return; // Exit early
      }
      // --- END NEW LOGIC ---

      if (error.logs) {
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
              } else {
            errorMessage = "user rejected place bid"
          }
          } 
      }
      toast.error(errorMessage, { id: 'place-bid', duration: 6000 });
    } finally {
      setBidLoadingStates(prev => ({ ...prev, [nft.mintAddress]: false }));
      toast.dismiss('place-bid');
    }
  };

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

      const [auctionPda] = PublicKey.findProgramAddressSync(
        [
          anchor.utils.bytes.utf8.encode("auction"),
          mintPublicKey.toBuffer()
        ],
        program.programId
      );

      const programNftAccount = getAssociatedTokenAddressSync(
        mintPublicKey,
        auctionPda,
        true
      );

      const sellerTokenAccount = getAssociatedTokenAddressSync(
        mintPublicKey,
        publicKey
      );

      let auctionAcc;
      try {
          auctionAcc = await program.account.auction.fetch(auctionPda);
      } catch (fetchError) {
          console.error("Could not fetch auction account, it might not exist:", fetchError);
          toast.error("Auction not found on-chain. It might already be cancelled or not listed.", { id: 'retrieve-nft' });
          return;
      }

      // Use the onChainCurrentTime state variable for consistency
      const hasEnded = onChainCurrentTime >= auctionAcc.endTime.toNumber();
      const noBids = auctionAcc.currentBid.isZero() || auctionAcc.highestBidder.toBase58() === SystemProgram.programId.toBase58();

      if (!hasEnded) {
          toast.error("Cannot retrieve NFT: Auction has not ended yet.", { id: 'retrieve-nft' });
          return;
      }
      if (!noBids) {
          toast.error("Cannot retrieve NFT: Bids were placed. Use the 'Settle Auction' function instead.", { id: 'retrieve-nft' });
          return;
      }

      const transaction = new Transaction();

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

      // Assuming `cancelAuction` is designed to also handle retrieval for no-bid ended auctions
      // If you have a separate instruction like `retrieveNoBidAuction`, use that instead.
      const retrieveNftInstruction = await program.methods.cancelAuction()
        .accounts({
          seller: publicKey,
          nftMint: mintPublicKey,
          auctionAccount: auctionPda,
          programNftAccount: programNftAccount,
          sellerTokenAccount: sellerTokenAccount,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          clock: SYSVAR_CLOCK_PUBKEY,
        })
        .instruction();

      transaction.add(retrieveNftInstruction);

      const txSignature = await program.provider.sendAndConfirm(transaction, []);
      console.log("NFT retrieved successfully, signature:", txSignature);

      // Remove from the live list and local storage
      const updatedListedNfts = listedNftsForAuction.filter(nft => nft.mintAddress !== nftToRetrieve.mintAddress);
      setListedNftsForAuction(updatedListedNfts);
      localStorage.setItem('listedNftsForAuction', JSON.stringify(updatedListedNfts));
      setCurrentBids(prev => {
        const newBids = { ...prev };
        delete newBids[nftToRetrieve.mintAddress];
        return newBids;
      });

      toast.success('NFT retrieved successfully!', { id: 'retrieve-nft' });

    } catch (error) {
      console.error("Error retrieving NFT:", error);
      let errorMessage = `Failed to retrieve NFT. Error: ${error.message || 'Unknown error'}`;

      if (error.logs) {
          const programLog = error.logs.find(log => log.includes("Program log: AnchorError"));
          if (programLog) {
              errorMessage = programLog.split("Error Message: ")[1] || errorMessage;
              if (errorMessage.includes("AuctionIsActive")) {
                  errorMessage = "Retrieve failed: Auction is still active or has not ended yet.";
              } else if (errorMessage.includes("IllegalCancelAuction")) { // This error suggests bids exist.
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


  if (loading || onChainCurrentTime === 0) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-950 to-black text-white flex justify-center items-center p-4">
        <p className="text-xl md:text-2xl font-semibold animate-pulse">Synchronizing with blockchain time...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-950 to-black text-gray-100 p-4 md:p-8 custom-scrollbar-hidden">
      {/* Full-screen success animation */}
      <AnimatePresence>
        {showFullScreenSuccess && (
          <motion.div
            className="fixed inset-0 bg-black bg-opacity-70 backdrop-blur-lg  flex flex-col items-center justify-center z-50 text-white"
            variants={fullScreenSuccessVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
          >
            <motion.svg
              className="w-32 h-32 text-white mb-6"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              xmlns="http://www.w3.org/2000/svg"
              variants={textVariants}
            >
              <motion.path
                initial={{ pathLength: 0 }}
                animate={{ pathLength: 1 }}
                transition={{ duration: 0.8, ease: "easeInOut" }}
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
              ></motion.path>
            </motion.svg>
            <motion.h2
              className="text-5xl md:text-7xl font-extrabold bg-gradient-to-r from-teal-400 via-blue-400 to-purple-500 mb-4 text-center"
              variants={textVariants}
            >
              Bid Placed!
            </motion.h2>
            <motion.p
              className="text-2xl md:text-3xl text-center px-4"
              variants={textVariants}
            >
              Your bid on <span className="font-bold text-yellow-300">{successfulBidNftName}</span> was successful!
            </motion.p>
          </motion.div>
        )}
      </AnimatePresence>

      <motion.h1
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className='text-4xl sm:text-5xl md:text-6xl font-extrabold mb-10 md:mb-12 text-center text-transparent bg-clip-text bg-gradient-to-r from-teal-100 via-blue-400 to-purple-500'
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
          {/* Optional: Add a link to the settlement page here */}
          {connected && publicKey && (
            <p className="text-gray-400 mt-4">
              Check your <NavLink to="/marketplace/my-auctions" className="text-purple-400 hover:underline">My Auctions</NavLink> page for ended auctions and claims.
            </p>
          )}
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
              // Use localDisplayTime for the visual countdown
              const timeLeftForDisplay = auctionEndTime - localDisplayTime;
              // Use onChainCurrentTime for the definitive auction state logic (hasStarted, hasEnded)
              const hasStartedOnChain = onChainCurrentTime >= nft.startTime;
              const hasEndedOnChain = onChainCurrentTime >= auctionEndTime;

              const nftCurrentBid = currentBids[nft.mintAddress];
              const isBidLoading = bidLoadingStates[nft.mintAddress];

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
                      Current Bid: <span className="font-bold">
                        {isBidLoading ? 'Loading...' : (
                          (nftCurrentBid === undefined || nftCurrentBid === 0) ? "No Bids Yet" : `${nftCurrentBid.toFixed(9)} SOL`
                        )}
                      </span>
                    </p>
                    <p className="text-sm text-gray-300 mt-auto">
                      Time Left: <span className={timeLeftForDisplay <= 0 ? "text-red-900 font-bold" : "text-yellow-400 font-bold"}>
                        {formatTimeLeft(timeLeftForDisplay)}
                      </span>
                    </p>
                    <p className="text-gray-500 text-xs mt-2 break-all">
                      Mint: {nft.mintAddress.substring(0, 6)}...{nft.mintAddress.substring(nft.mintAddress.length - 6)}
                    </p>

                    <div className="mt-4">
                      {connected && publicKey ? (
                        hasEndedOnChain ? ( // Use onChainCurrentTime for definitive end check
                          publicKey.toBase58() === nft.seller ? (
                              (nftCurrentBid === undefined || nftCurrentBid === 0) ? (
                                  <motion.button
                                      whileHover={{ scale: 1.05 }}
                                      whileTap={{ scale: 0.95 }}
                                      onClick={() => handleRetrieveNft(nft)}
                                      className="w-full bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white font-bold py-2 rounded-md transition-all duration-200 text-base shadow-md hover:shadow-lg"
                                  >
                                      Retrieve NFT (No Bids)
                                  </motion.button>
                              ) : (
                                  <p className="text-center text-green-400 font-extrabold text-base md:text-lg animate-pulse">
                                      Auction Ended (Seller: Settle/Claim)
                                  </p>
                              )
                          ) : (
                              <p className="text-center text-red-900 font-extrabold text-base md:text-lg">Auction Ended</p>
                          )
                        ) : !hasStartedOnChain ? ( // Use onChainCurrentTime for definitive start check
                          publicKey.toBase58() === nft.seller ? (
                            <p className="text-center text-orange-400 font-extrabold text-base md:text-lg">Auction Not Started Yet (Your NFT)</p>
                          ) : (
                            <p className="text-center text-gray-400 text-sm">Auction not started</p>
                          )
                        ) : ( // Auction is live and started (on-chain)
                          publicKey.toBase58() === nft.seller ? (
                            <p className="text-center text-orange-400 font-extrabold text-base md:text-lg">Auction Started (Your NFT)</p>
                            // <motion.button
                            //     whileHover={{ scale: 1.05 }}
                            //     whileTap={{ scale: 0.95 }}
                            //     onClick={() => handleCancelAuction(nft)}
                            //     className="w-full bg-gradient-to-r from-red-500 to-red-700 hover:from-red-600 hover:to-red-800 text-white font-bold py-2 rounded-md transition-all duration-200 text-base shadow-md hover:shadow-lg"
                            // >
                            //     Cancel Auction
                            // </motion.button>
                          ) : (
                            <motion.button
                              whileHover={{ scale: 1.05 }}
                              whileTap={{ scale: 0.95 }}
                              onClick={() => handlePlaceBid(nft)}
                              disabled={isBidLoading}
                              className="w-full bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 text-white font-bold py-2 rounded-md transition-all duration-200 text-base shadow-md hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              {isBidLoading ? "Placing Bid..." : "Place Bid"}
                            </motion.button>
                          )
                        )
                      ) : (
                        <p className="mt-4 text-center text-gray-400 text-sm">
                          Connect wallet to interact
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