import React, { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import * as anchor from "@coral-xyz/anchor";
import {
  PublicKey,
  Transaction,
  SystemProgram,
  SYSVAR_RENT_PUBKEY,
  SYSVAR_CLOCK_PUBKEY,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import toast from "react-hot-toast";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import {
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountInstruction,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import { NavLink } from "react-router-dom";
import { useSolanaProgram } from "../contexts/SolanaProgramContext";

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
  const { program, connection, connected, publicKey } = useSolanaProgram();
  const [listedNftsForAuction, setListedNftsForAuction] = useState([]);
  const [loading, setLoading] = useState(true);
  const [currentBids, setCurrentBids] = useState({});
  const [showFullScreenSuccess, setShowFullScreenSuccess] = useState(false);
  const [successfulBidNftName, setSuccessfulBidNftName] = useState("");
  const { wallet } = useWallet();

  // State for Bid Modal Management
  const [isBidModalOpen, setIsBidModalOpen] = useState(false);
  const [selectedNftForBid, setSelectedNftForBid] = useState(null);
  const [bidAmountInput, setBidAmountInput] = useState("");
  const [minimumBidRequiredSol, setMinimumBidRequiredSol] = useState(0);
  const [currentHighestBidSol, setCurrentHighestBidSol] = useState(0);

  // State to hold the current on-chain time (updated less frequently, source of truth)
  const [onChainCurrentTime, setOnChainCurrentTime] = useState(0);
  // State for local display time (updated every second for smooth countdown)
  const [localDisplayTime, setLocalDisplayTime] = useState(
    Math.floor(Date.now() / 1000)
  );

  // Effect to fetch initial on-chain time and update it periodically
  useEffect(() => {
    const fetchOnChainTime = async () => {
      if (!connection) return;
      try {
        const clockAcc = await connection.getAccountInfo(SYSVAR_CLOCK_PUBKEY);
        if (clockAcc) {
          const unixTimestamp = new anchor.BN(
            clockAcc.data.slice(32, 40),
            "le"
          ).toNumber();
          setOnChainCurrentTime(unixTimestamp);
        }
      } catch (error) {
        console.error("Failed to fetch on-chain clock:", error);
      }
    };

    fetchOnChainTime(); // Fetch immediately on mount

    // Set up interval to fetch every 10 seconds for dynamic updates
    const intervalId = setInterval(fetchOnChainTime, 1000);

    return () => clearInterval(intervalId); // Cleanup interval on component unmount
  }, [connection]);

  // Effect to update local display time every second
  useEffect(() => {
    const interval = setInterval(() => {
      setLocalDisplayTime(Math.floor(Date.now() / 1000));
    }, 1000); // Update every 1 second
    return () => clearInterval(interval);
  }, []);


  useEffect(() => {
    const storedListedNfts = localStorage.getItem("listedNftsForAuction");
    if (storedListedNfts) {
      try {
        const parsedNfts = JSON.parse(storedListedNfts);
        setListedNftsForAuction(parsedNfts);
      } catch (e) {
        console.error("Failed to parse listed NFTs from localStorage", e);
        setListedNftsForAuction([]);
      }
    }
    setLoading(false);
  }, []);

  const delay = (ms) => new Promise((res) => setTimeout(res, ms));

  const fetchAllCurrentBids = useCallback(
    async (nfts) => {
      if (!program || nfts.length === 0) return;

      const bids = {};
      const batchSize = 5;
      const batchDelayMs = 500;

      for (let i = 0; i < nfts.length; i += batchSize) {
        const batch = nfts.slice(i, i + batchSize);
        const promises = batch.map(async (nft) => {
          try {
            const mintPublicKey = new PublicKey(nft.mintAddress);
            const [auctionPda] = PublicKey.findProgramAddressSync(
              [
                anchor.utils.bytes.utf8.encode("auction"),
                mintPublicKey.toBuffer(),
              ],
              program.programId
            );

            const auctionAcc = await program.account.auction.fetch(auctionPda);
            bids[nft.mintAddress] =
              auctionAcc.currentBid.toNumber() / LAMPORTS_PER_SOL;

            // Crucial: Re-evaluate auction end based on the latest on-chain time
            // and the fetched auction's endTime here, right after fetching.
            if (
              onChainCurrentTime !== 0 &&
              onChainCurrentTime >= auctionAcc.endTime.toNumber()
            ) {
              console.log(
                `Auction for ${nft.name} detected as ended on-chain. Removing from live list.`
              );
              setListedNftsForAuction((prev) => {
                const updated = prev.filter(
                  (item) => item.mintAddress !== nft.mintAddress
                );
                localStorage.setItem(
                  "listedNftsForAuction",
                  JSON.stringify(updated)
                );
                return updated;
              });
              setCurrentBids((prev) => {
                const newBids = { ...prev };
                delete newBids[nft.mintAddress];
                return newBids;
              });
              toast(
                `Auction for ${nft.name} has ended! Check your "My Auctions" page to settle.`,
                { duration: 5000 }
              );
            }
          } catch (error) {
            console.warn(
              `Could not fetch bid for ${nft.name} (${nft.mintAddress.substring(
                0,
                6
              )}...):`,
              error.message
            );
            bids[nft.mintAddress] = 0;
          } finally {
          }
        });

        await Promise.all(promises);
        if (i + batchSize < nfts.length) {
          await delay(batchDelayMs);
        }
      }
      setCurrentBids(bids);
    },
    [program, onChainCurrentTime]
  );

  useEffect(() => {
    if (!loading && listedNftsForAuction.length > 0 && program) {
      fetchAllCurrentBids(listedNftsForAuction);

      const subscriptions = [];
      listedNftsForAuction.forEach((nft) => {
        try {
          const mintPublicKey = new PublicKey(nft.mintAddress);
          const [auctionPda] = PublicKey.findProgramAddressSync(
            [
              anchor.utils.bytes.utf8.encode("auction"),
              mintPublicKey.toBuffer(),
            ],
            program.programId
          );

          const subscriptionId = connection.onAccountChange(
            auctionPda,
            (accountInfo) => {
              try {
                const decodedAccount = program.coder.accounts.decode(
                  "auction",
                  accountInfo.data
                );
                const newBid =
                  decodedAccount.currentBid.toNumber() / LAMPORTS_PER_SOL;

                setCurrentBids((prev) => {
                  const currentNftBid = prev[nft.mintAddress] || 0;
                  if (newBid > currentNftBid) {
                    toast(
                      `New bid on ${nft.name}! Current: ${newBid.toFixed(
                        9
                      )} SOL`,
                      {
                        icon: "🚀",
                        duration: 3000,
                      }
                    );
                    return { ...prev, [nft.mintAddress]: newBid };
                  }
                  return prev;
                });

                const checkTime = onChainCurrentTime;
                if (
                  checkTime !== 0 &&
                  checkTime >= decodedAccount.endTime.toNumber()
                ) {
                  console.log(
                    `Auction for ${nft.name} has ended via account change listener. Removing from live list.`
                  );
                  setListedNftsForAuction((prev) => {
                    const updated = prev.filter(
                      (item) => item.mintAddress !== nft.mintAddress
                    );
                    localStorage.setItem(
                      "listedNftsForAuction",
                      JSON.stringify(updated)
                    );
                    return updated;
                  });
                  setCurrentBids((prev) => {
                    const newBids = { ...prev };
                    delete newBids[nft.mintAddress];
                    return newBids;
                  });
                  toast(
                    `Auction for ${nft.name} has ended! Check your "My Auctions" page to settle.`,
                    { duration: 5000 }
                  );
                }
              } catch (decodeError) {
                console.error("Error decoding account on change:", decodeError);
              }
            },
            "confirmed"
          );
          subscriptions.push(subscriptionId);
        } catch (subError) {
          console.error(
            `Error setting up subscription for ${nft.mintAddress}:`,
            subError
          );
        }
      });

      return () => {
        subscriptions.forEach((id) =>
          connection.removeAccountChangeListener(id)
        );
      };
    }
  }, [
    loading,
    listedNftsForAuction,
    program,
    connection,
    fetchAllCurrentBids,
    onChainCurrentTime,
  ]);

  const formatTimeLeft = (seconds) => {
    if (seconds <= 0) return "0s";
    const days = Math.floor(seconds / (3600 * 24));
    seconds %= 3600 * 24;
    const hours = Math.floor(seconds / 3600);
    seconds %= 3600;
    const minutes = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);

    let parts = [];
    if (days > 0) parts.push(`${days}d`);
    if (hours > 0) parts.push(`${hours}h`);
    if (minutes > 0) parts.push(`${minutes}m`);
    if (secs > 0 || parts.length === 0) parts.push(`${secs}s`);

    return parts.join(" ");
  };

  // Modified handlePlaceBid to open the modal
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

    const mintPublicKey = new PublicKey(nft.mintAddress);
    const [auctionPda] = PublicKey.findProgramAddressSync(
      [anchor.utils.bytes.utf8.encode("auction"), mintPublicKey.toBuffer()],
      program.programId
    );

    let auctionAcc;
    try {
      auctionAcc = await program.account.auction.fetch(auctionPda);
    } catch (fetchError) {
      console.error(
        "Could not fetch auction account, it might not exist or be closed:",
        fetchError
      );
      toast.error("Auction not found on-chain or has ended/cancelled.", {
        id: "place-bid",
      });
      return;
    }

    if (onChainCurrentTime === 0) {
      toast.error(
        "Blockchain time not synchronized yet. Please wait a moment.",
        { id: "place-bid" }
      );
      return;
    }
    if (onChainCurrentTime >= auctionAcc.endTime.toNumber()) {
      toast.error("This auction has already ended!", { id: "place-bid" });
      setListedNftsForAuction((prev) => {
        const updated = prev.filter(
          (item) => item.mintAddress !== nft.mintAddress
        );
        localStorage.setItem("listedNftsForAuction", JSON.stringify(updated));
        return updated;
      });
      return;
    }
    if (onChainCurrentTime < auctionAcc.startTime.toNumber()) {
      toast.error("This auction has not started yet!", { id: "place-bid" });
      return;
    }

    const onChainCurrentBidLamports = new anchor.BN(
      auctionAcc.currentBid.toString()
    );
    const onChainInitialPriceLamports = new anchor.BN(
      auctionAcc.satrtPrice.toString()
    );

    const calculatedMinimumBidRequiredLamports = onChainCurrentBidLamports.isZero()
      ? onChainInitialPriceLamports
      : onChainCurrentBidLamports.add(new anchor.BN(1)); // Increment by 1 lamport

    const calculatedMinimumBidRequiredSol =
      calculatedMinimumBidRequiredLamports.toNumber() / LAMPORTS_PER_SOL;

    const calculatedCurrentBidForPrompt =
      onChainCurrentBidLamports.toNumber() / LAMPORTS_PER_SOL;

    // Set state for modal and open it
    setSelectedNftForBid(nft);
    setMinimumBidRequiredSol(calculatedMinimumBidRequiredSol);
    setCurrentHighestBidSol(calculatedCurrentBidForPrompt);
    setBidAmountInput(calculatedMinimumBidRequiredSol.toFixed(9)); // Pre-fill with minimum bid
    setIsBidModalOpen(true);
  };

  // New function to confirm bid from modal
  const confirmPlaceBid = async () => {
    if (!selectedNftForBid) return; // Should not happen if modal is open

    const nft = selectedNftForBid;
    const parsedBidAmount = parseFloat(bidAmountInput);

    if (isNaN(parsedBidAmount) || parsedBidAmount <= 0) {
        toast.error("Please enter a valid positive number for your bid.");
        return;
    }

    const bidAmountLamports = new anchor.BN(parsedBidAmount * LAMPORTS_PER_SOL);

    // Validate bid amount against minimum required
    if (bidAmountLamports.lt(new anchor.BN(minimumBidRequiredSol * LAMPORTS_PER_SOL))) {
        toast.error(
            `Your bid of ${parsedBidAmount} SOL is too low. Please bid at least ${minimumBidRequiredSol.toFixed(9)} SOL.`
        );
        return;
    }

    setIsBidModalOpen(false); // Close the modal immediately
    toast.loading(`Placing bid of ${parsedBidAmount} SOL for ${nft.name}...`, {
        id: "place-bid",
    });

    try {
        const mintPublicKey = new PublicKey(nft.mintAddress);
        const [auctionPda] = PublicKey.findProgramAddressSync(
            [anchor.utils.bytes.utf8.encode("auction"), mintPublicKey.toBuffer()],
            program.programId
        );

        const auctionAcc = await program.account.auction.fetch(auctionPda); // Refetch to ensure latest state

        if (
            !auctionAcc.currentBid.isZero() &&
            auctionAcc.highestBidder.toBase58() === publicKey.toBase58()
        ) {
            toast.error(
                "You are already the highest bidder. To increase your bid, you must enter a strictly higher amount."
            );
            return;
        }

        const remainingAccounts = [];
        if (
            auctionAcc.currentBid.gtn(0) &&
            auctionAcc.highestBidder.toBase58() !==
            SystemProgram.programId.toBase58()
        ) {
            remainingAccounts.push({
                pubkey: auctionAcc.highestBidder,
                isWritable: true,
                isSigner: false,
            });
        }

        const [bidPda] = PublicKey.findProgramAddressSync(
            [anchor.utils.bytes.utf8.encode("escrow"), mintPublicKey.toBuffer()],
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

        const placeBidInstruction = await program.methods
            .placeBid(bidAmountLamports)
            .accounts(accounts)
            .remainingAccounts(remainingAccounts)
            .instruction();

        const transaction = new Transaction();
        transaction.add(placeBidInstruction);

        const { blockhash, lastValidBlockHeight } =
            await program.provider.connection.getLatestBlockhash("finalized");
        transaction.recentBlockhash = blockhash;
        transaction.lastValidBlockHeight = lastValidBlockHeight;

        transaction.feePayer = publicKey;

        const signedTransaction = await wallet.adapter.signTransaction(
            transaction
        );
        const txSign = await program.provider.connection.sendRawTransaction(
            signedTransaction.serialize()
        );
        await program.provider.connection.confirmTransaction(txSign, "confirmed");

        setCurrentBids((prev) => ({
            ...prev,
            [nft.mintAddress]: parsedBidAmount,
        }));

        setListedNftsForAuction((prevNfts) => {
            const updatedNfts = prevNfts.map((item) =>
                item.mintAddress === nft.mintAddress
                    ? {
                        ...item,
                        currentBid: parsedBidAmount,
                        highestBidder: publicKey.toBase58(),
                    }
                    : item
            );
            localStorage.setItem(
                "listedNftsForAuction",
                JSON.stringify(updatedNfts)
            );
            return updatedNfts;
        });

        toast.success(
            `Successfully placed a bid of ${parsedBidAmount} SOL for ${nft.name}!`,
            { id: "place-bid" }
        );

        setSuccessfulBidNftName(nft.name);
        setShowFullScreenSuccess(true);
        setTimeout(() => setShowFullScreenSuccess(false), 3000);
    } catch (error) {
        console.error("Error placing bid:", error);
        let errorMessage = `Failed to place bid. Error: ${
            error.message || "Unknown error"
        }`;

        if (error.name === "WalletSignTransactionError" ||
            (error.name === "WalletAdapterRpcError" && error.message.includes("User rejected the request")) ||
            (error.message && (error.message.includes("User rejected") || error.message.includes("cancelled")))
        ) {
            errorMessage = "Transaction cancelled by user.";
            toast.error(errorMessage, { id: "place-bid", duration: 3000 });
            return;
        }

        if (error.logs) {
            const programLog = error.logs.find((log) =>
                log.includes("Program log: AnchorError")
            );
            if (programLog) {
                errorMessage = programLog.split("Error Message: ")[1] || errorMessage;
                if (errorMessage.includes("AuctionTimeOver")) {
                    errorMessage = "Bid failed: Auction time has ended.";
                } else if (errorMessage.includes("AuctionIsNotStarted")) {
                    errorMessage = "Bid failed: Auction has not started yet.";
                } else if (
                    errorMessage.includes("BidNotValid") ||
                    errorMessage.includes("CurrentBidIsNotValid")
                ) {
                    errorMessage =
                        "Bid failed: Please enter a strictly higher valid bid.";
                } else if (errorMessage.includes("InsufficientBalance")) {
                    errorMessage =
                        "Bid failed: Insufficient SOL balance in your wallet.";
                } else if (errorMessage.includes("CurrentBidderIsNotValid")) {
                    errorMessage =
                        "Bid failed: You are the seller or already the highest bidder (or an invalid bidder).";
                } else {
                    errorMessage = "An unexpected error occurred during bid placement.";
                }
            }
        }
        toast.error(errorMessage, { id: "place-bid", duration: 6000 });
    } finally {
        toast.dismiss("place-bid");
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

    toast.loading("Retrieving NFT...", { id: "retrieve-nft" });

    try {
      const mintPublicKey = new PublicKey(nftToRetrieve.mintAddress);

      const [auctionPda] = PublicKey.findProgramAddressSync(
        [anchor.utils.bytes.utf8.encode("auction"), mintPublicKey.toBuffer()],
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
        console.error(
          "Could not fetch auction account, it might not exist:",
          fetchError
        );
        toast.error(
          "Auction not found on-chain. It might already be cancelled or not listed.",
          { id: "retrieve-nft" }
        );
        return;
      }

      const hasEnded = onChainCurrentTime >= auctionAcc.endTime.toNumber();
      const noBids =
        auctionAcc.currentBid.isZero() ||
        auctionAcc.highestBidder.toBase58() ===
          SystemProgram.programId.toBase58();

      if (!hasEnded) {
        toast.error("Cannot retrieve NFT: Auction has not ended yet.", {
          id: "retrieve-nft",
        });
        return;
      }
      if (!noBids) {
        toast.error(
          "Cannot retrieve NFT: Bids were placed. Use the 'Settle Auction' function instead.",
          { id: "retrieve-nft" }
        );
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

      const retrieveNftInstruction = await program.methods
        .cancelAuction()
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

      const txSignature = await program.provider.sendAndConfirm(
        transaction,
        []
      );
      console.log("NFT retrieved successfully, signature:", txSignature);

      const updatedListedNfts = listedNftsForAuction.filter(
        (nft) => nft.mintAddress !== nftToRetrieve.mintAddress
      );
      setListedNftsForAuction(updatedListedNfts);
      localStorage.setItem(
        "listedNftsForAuction",
        JSON.stringify(updatedListedNfts)
      );
      setCurrentBids((prev) => {
        const newBids = { ...prev };
        delete newBids[nftToRetrieve.mintAddress];
        return newBids;
      });

      toast.success("NFT retrieved successfully!", { id: "retrieve-nft" });
    } catch (error) {
      console.error("Error retrieving NFT:", error);
      let errorMessage = `Failed to retrieve NFT. Error: ${
        error.message || "Unknown error"
      }`;

      if (error.logs) {
        const programLog = error.logs.find((log) =>
          log.includes("Program log: AnchorError")
        );
        if (programLog) {
          errorMessage = programLog.split("Error Message: ")[1] || errorMessage;
          if (errorMessage.includes("AuctionIsActive")) {
            errorMessage =
              "Retrieve failed: Auction is still active or has not ended yet.";
          } else if (errorMessage.includes("IllegalCancelAuction")) {
            errorMessage =
              "Retrieve failed: Bids are present for this auction. Cannot retrieve, must settle.";
          } else if (errorMessage.includes("AccountNotInitialized")) {
            errorMessage =
              "Retrieve failed: Auction or associated accounts not found on-chain.";
          }
        }
      }
      toast.error(errorMessage, { id: "retrieve-nft", duration: 6000 });
    } finally {
      toast.dismiss("retrieve-nft");
    }
  };

  if (loading || onChainCurrentTime === 0) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-950 to-black text-white flex justify-center items-center p-4">
        <p className="text-xl md:text-2xl font-semibold animate-pulse">
          Synchronizing with blockchain time...
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-950 to-black text-gray-100 p-4 md:p-8 custom-scrollbar-hidden">
      {/* Full-screen success animation */}
      <AnimatePresence>
        {showFullScreenSuccess && (
          <motion.div
            className="fixed inset-0 bg-transparent bg-opacity-75 backdrop-blur-lg  flex flex-col items-center justify-center z-50 text-white"
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
              className="text-5xl md:text-7xl font-extrabold bg-gradient-to-r text-teal-400 via-blue-400 to-purple-500 mb-4 text-center"
              variants={textVariants}
            >
              Bid Placed!
            </motion.h2>
            <motion.p
              className="text-2xl md:text-3xl text-center px-4"
              variants={textVariants}
            >
              Your bid on{" "}
              <span className="font-bold text-yellow-300">
                {successfulBidNftName}
              </span>{" "}
              was successful!
            </motion.p>
          </motion.div>
        )}
      </AnimatePresence>

      <motion.h1
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="text-4xl sm:text-5xl md:text-6xl font-extrabold mb-10 md:mb-12 text-center text-transparent bg-clip-text bg-gradient-to-r from-teal-100 via-blue-400 to-purple-500"
      >
        NFTs Live for Auction
      </motion.h1>

      {listedNftsForAuction.length === 0 ? (
        <div className="flex flex-col items-center justify-center p-8 text-center">
          <h1 className="text-3xl sm:text-4xl md:text-5xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-green-400 mb-6">
            No NFTs Listed for Auction Yet!
          </h1>
          <p className="text-lg md:text-xl text-gray-400 mt-4 max-w-xl mx-auto">
            List your NFTs from your collection to see them here.
          </p>
          {connected && publicKey && (
            <p className="text-gray-400 mt-4">
              Check your{" "}
              <NavLink
                to="/marketplace/my-auctions"
                className="text-purple-400 hover:underline"
              >
                My Auctions
              </NavLink>{" "}
              page for ended auctions and claims.
            </p>
          )}
        </div>
      ) : (
        <AnimatePresence>
          <motion.div
            className="grid grid-cols-1  sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-6 md:gap-8"
            variants={containerVariants}
            initial="hidden"
            animate="visible"
          >
            {listedNftsForAuction.map((nft) => {
              const auctionEndTime = nft.startTime + nft.duration;
              const hasStartedOnChain = onChainCurrentTime >= nft.startTime;
              const hasEndedOnChain = onChainCurrentTime >= auctionEndTime;

              let displayTimeLabel = "";
              let timeToCalculate = 0;
              let timeClass = "text-yellow-400 font-bold";

              if (hasEndedOnChain) {
                  displayTimeLabel = "Auction Ended";
                  timeToCalculate = 0;
                  timeClass = "text-red-900 font-bold";
              } else if (hasStartedOnChain) {
                  displayTimeLabel = "Auction ends in: ";
                  timeToCalculate = auctionEndTime - localDisplayTime;
                  if (timeToCalculate <= 0) {
                    timeClass = "text-red-900 font-bold";
                  }
              } else {
                  displayTimeLabel = "Auction starts in: ";
                  timeToCalculate = nft.startTime - localDisplayTime;
                   if (timeToCalculate <= 0) {
                    timeClass = "text-red-900 font-bold";
                  }
              }

              const nftCurrentBid = currentBids[nft.mintAddress];

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
                    <h3 className="text-xl font-bold text-white truncate mb-1">
                      {nft.name}
                    </h3>
                    <p className="text-gray-400 text-sm truncate mb-2">
                      {nft.symbol}
                    </p>
                    <p className="text-lg font-semibold text-gray-300">
                      Initial Price:{" "}
                      <span className="font-bold text-gray-400">
                        {nft.initialPrice} SOL
                      </span>
                    </p>
                    <p className="text-lg font-semibold text-blue-300 mb-2">
                      Current Bid:{" "}
                      <span className="font-bold">
                        {nftCurrentBid === undefined || nftCurrentBid === 0
                          ? "No Bids Yet"
                          : `${nftCurrentBid.toFixed(9)} SOL`}
                      </span>
                    </p>
                    <p className="text-sm text-gray-300 mt-auto">
                        {displayTimeLabel}
                        {displayTimeLabel !== "Auction Ended" && (
                            <span className={timeClass}>
                                {formatTimeLeft(timeToCalculate)}
                            </span>
                        )}
                    </p>

                    <p className="text-gray-500 text-xs mt-2 break-all">
                      Mint: {nft.mintAddress.substring(0, 6)}...
                      {nft.mintAddress.substring(nft.mintAddress.length - 6)}
                    </p>

                    <div className="mt-4">
                      {connected && publicKey ? (
                        hasEndedOnChain ? (
                          publicKey.toBase58() === nft.seller ? (
                            nftCurrentBid === undefined ||
                            nftCurrentBid === 0 ? (
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
                            <p className="text-center text-red-900 font-extrabold text-base md:text-lg">
                              Auction Ended
                            </p>
                          )
                        ) : !hasStartedOnChain ? (
                          publicKey.toBase58() === nft.seller ? (
                            <p className="text-center text-orange-400 font-extrabold text-base md:text-lg">
                              Auction Not Started Yet (Your NFT)
                            </p>
                          ) : (
                            <p className="text-center text-gray-400 text-sm">
                              Auction not started
                            </p>
                          )
                        ) :
                        publicKey.toBase58() === nft.seller ? (
                          <p className="text-center text-orange-400 font-extrabold text-base md:text-lg">
                            Auction Started (Your NFT)
                          </p>
                        ) : (
                          <motion.button
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                            onClick={() => handlePlaceBid(nft)}
                            className="w-full bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 text-white font-bold py-2 rounded-md transition-all duration-200 text-base shadow-md hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            Place Bid
                          </motion.button>
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

      {/* Bid Modal */}
      <AnimatePresence>
          {isBidModalOpen && selectedNftForBid && (
              <motion.div
                  className="fixed inset-0 bg-transparent bg-opacity-75 backdrop-blur-lg flex justify-center items-center z-50 p-4"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
              >
                  <motion.div
                      className="bg-gray-800 rounded-lg p-8 w-full max-w-md shadow-2xl border border-purple-600 text-white relative overflow-hidden" // Increased padding, stronger shadow, border
                      initial={{ scale: 0.9, y: 50 }}
                      animate={{ scale: 1, y: 0 }}
                      exit={{ scale: 0.9, y: 50 }}
                      transition={{ type: "spring", stiffness: 200, damping: 20 }}
                  >
                    {/* Decorative background element */}
                    <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 w-48 h-48 bg-purple-500 rounded-full opacity-20 blur-xl"></div>
                    <div className="absolute bottom-0 right-0 w-32 h-32 bg-blue-500 rounded-full opacity-15 blur-xl"></div>

                      <h2 className="text-4xl font-extrabold text-center mb-6 text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-purple-400 relative z-10"> {/* Larger heading */}
                          Place Your Bid
                      </h2>

                      <div className="flex flex-col items-center mb-6 relative z-10">
                          {selectedNftForBid.image ? (
                              <div className="w-36 h-36 rounded-xl overflow-hidden border-2 border-purple-500 shadow-lg"> {/* Slightly larger image, border */}
                                <img
                                    src={selectedNftForBid.image}
                                    alt={selectedNftForBid.name}
                                    className="w-full h-full object-cover"
                                />
                              </div>
                          ) : (
                              <div className="w-36 h-36 bg-gray-700 rounded-xl mb-4 flex items-center justify-center text-gray-400 text-lg border-2 border-purple-500 shadow-lg">
                                  No Image
                              </div>
                          )}
                          <h3 className="text-2xl font-semibold mt-4 mb-1 text-teal-300 text-center">{selectedNftForBid.name}</h3> {/* More prominent name */}
                          <p className="text-gray-400 text-sm">{selectedNftForBid.symbol}</p>
                      </div>

                      <div className="mb-6 pb-6 border-b border-gray-700/50 relative z-10"> {/* Added border-b */}
                          <p className="text-lg text-gray-300 mb-2">
                              Initial Price: <span className="font-bold text-gray-400">{selectedNftForBid.initialPrice} SOL</span>
                          </p>
                          <p className="text-xl font-semibold text-blue-300 mb-2">
                              Current Highest Bid: <span className="font-bold text-blue-200">{currentHighestBidSol.toFixed(9)} SOL</span>
                          </p>
                          <p className="text-lg text-yellow-300 mt-2">
                              Minimum Bid Required: <span className="font-bold text-yellow-200">{minimumBidRequiredSol.toFixed(9)} SOL</span>
                          </p>
                          {/* Auction Ends In Time */}
                          <p className="text-md text-purple-300 mt-4">
                              Auction Ends In: {" "}
                              <span className="font-bold">
                                  {formatTimeLeft(selectedNftForBid.startTime + selectedNftForBid.duration - localDisplayTime)}
                              </span>
                          </p>
                      </div>

                      <div className="mb-8 relative z-10"> {/* Increased margin-bottom */}
                          <label htmlFor="bidAmount" className="block text-gray-300 text-sm font-bold mb-2">
                              Your Bid (SOL)
                          </label>
                          <input
                              type="number"
                              id="bidAmount"
                              value={bidAmountInput}
                              onChange={(e) => setBidAmountInput(e.target.value)}
                              placeholder={minimumBidRequiredSol.toFixed(9)}
                              step="0.000001" // Changed step for slightly larger increments, still allows fine-tuning
                              min={minimumBidRequiredSol}
                              className="shadow appearance-none border border-gray-700 rounded-lg w-full py-3 px-4 text-white leading-tight focus:outline-none focus:ring-2 focus:ring-purple-500 bg-gray-700 focus:border-transparent transition-all duration-200" // Rounded corners for input
                          />
                      </div>

                      <div className="flex justify-end gap-4 relative z-10">
                          <button
                              onClick={() => {
                                  setIsBidModalOpen(false);
                                  setBidAmountInput("");
                                  setSelectedNftForBid(null);
                              }}
                              className="bg-gray-600 hover:bg-gray-700 text-white font-bold py-2 px-6 rounded-md transition-colors duration-200 text-lg" // Increased padding, text size
                          >
                              Cancel
                          </button>
                          <button
                              onClick={confirmPlaceBid}
                              disabled={!bidAmountInput || parseFloat(bidAmountInput) < minimumBidRequiredSol}
                              className="bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 text-white font-bold py-2 px-6 rounded-md transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed text-lg" // Increased padding, text size
                          >
                              Confirm Bid
                          </button>
                      </div>
                  </motion.div>
              </motion.div>
          )}
      </AnimatePresence>

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