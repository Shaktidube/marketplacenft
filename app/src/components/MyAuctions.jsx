// pages/my-auctions.jsx (or MyAuctions.jsx in a React Router setup)
import React, { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import * as anchor from "@coral-xyz/anchor";
import {
  PublicKey,
  Transaction,
  SystemProgram,
  SYSVAR_RENT_PUBKEY,
  LAMPORTS_PER_SOL,
  SYSVAR_CLOCK_PUBKEY,
} from "@solana/web3.js";
import idl from "../idl/marketplacenft.json";
import toast from "react-hot-toast";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import {
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountInstruction,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import {
  fetchDigitalAsset,
  Metadata,
  MPL_TOKEN_METADATA_PROGRAM_ID,
  
} from '@metaplex-foundation/mpl-token-metadata';
import { Helius } from "helius-sdk";
// import { publicKey } from "@metaplex-foundation/umi";

const METADATA_PROGRAM_ID = new PublicKey(
  "metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s"
);

const HELIUS_API_KEY = "e1ed6bae-c868-4b1b-9b21-e062d5edd982";
const HELIUS_CLUSTER = "devnet";

const helius = new Helius(HELIUS_API_KEY, HELIUS_CLUSTER);
console.log("helius"  ,helius);

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

// Full-screen success animation variants (similar to Auction.jsx)
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

function MyAuctions() {
  const [endedAuctions, setEndedAuctions] = useState([]);
  const [loading, setLoading] = useState(true);
  const { connection } = useConnection();
  const { publicKey, wallet, connected } = useWallet();
  const [showFullScreenSuccess, setShowFullScreenSuccess] = useState(false);
  const [successfulTxNftName, setSuccessfulTxNftName] = useState("");
  const [successMessageType, setSuccessMessageType] = useState(""); // "settle" or "retrieve"

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
    return programInstance;
  }, [connection, wallet]);

  const program = getProgram();

  // Function to fetch all auction accounts associated with the program
  // and filter them for the connected user.
  const fetchMyEndedAuctions = useCallback(async () => {
    if (!program || !publicKey) {
      setLoading(false); // Ensure loading is false if prerequisites are not met
      return;
    }

    setLoading(true); // Set loading true at the start of fetch
    try {
      const allAuctionAccounts = await program.account.auction.all();

      // Fetch on-chain time once at the beginning for consistency
      let onChainNow = Math.floor(Date.now() / 1000); // Fallback to local time
      try {
        const clockAcc = await connection.getAccountInfo(SYSVAR_CLOCK_PUBKEY);
        if (clockAcc) {
          onChainNow = new anchor.BN(
            clockAcc.data.slice(32, 40),
            "le"
          ).toNumber(); // Correct offset for unix_timestamp
        }
      } catch (clockError) {
        console.warn(
          "Failed to fetch on-chain clock, using local time:",
          clockError
        );
      }

      const relevantAuctions = [];
      console.log(allAuctionAccounts);
      for (const account of allAuctionAccounts) {
        const auctionData = account.account;
        const mintAddress = auctionData.nftMint.toBase58();
        const sellerAddress = auctionData.seller.toBase58();
        const highestBidderAddress = auctionData.highestBidder.toBase58();
        const auctionEndTime = auctionData.endTime.toNumber();

        const isSeller = publicKey.toBase58() === sellerAddress;
        const isHighestBidder = publicKey.toBase58() === highestBidderAddress;

        const isEnded = onChainNow >= auctionEndTime;
        const isSettled = auctionData.auctionStatus.settled !== undefined;
        const isCancelled = auctionData.auctionStatus.cancelled !== undefined;
        // const isActive = auctionData.auctionStatus.active !== undefined; // Not used in this block
        // const end = auctionData.auctionStatus.ended !== undefined; // Not used in this block

        if (
          isEnded &&
          (isSeller || isHighestBidder) &&
          !isSettled &&
          !isCancelled
        ) {
          let nftDetails = {
            mintAddress: mintAddress,
            seller: sellerAddress,
            initialPrice: auctionData.satrtPrice.toNumber() / LAMPORTS_PER_SOL,
            currentBid: auctionData.currentBid.toNumber() / LAMPORTS_PER_SOL,
            highestBidder: highestBidderAddress,
            endTime: auctionEndTime,
            isSeller: isSeller,
            isHighestBidder: isHighestBidder,
            name: "Loading...", // Initial state
            symbol: "", // Initial state
            image: "", // Initial state
            auctionPda: account.publicKey.toBase58(),
          };

          try {
            console.log("mint address : ", mintAddress);
            const response = await helius.rpc.getAsset({id:mintAddress});
            console.log(response);

            nftDetails.name  = response.content.metadata.name.replace(/\0/g, '')
            nftDetails.symbol = response.content.metadata.symbol.replace(/\0/g, '')

            const uri = response.content.json_uri;
            if(uri) {
              const res = await fetch(uri);
              const json = await res.json();

              nftDetails.image = json.image;
            }
          } catch (metaError) {
            console.warn(`Could not fetch metadata or process URI for ${nftDetails.mintAddress}:`, metaError);
            nftDetails.name = "NFT (Error)";
            nftDetails.symbol = "ERROR";
            nftDetails.image = "/error-image.png"; // Specific fallback for errors
          }
          relevantAuctions.push(nftDetails);
        }
      }

      relevantAuctions.sort((a, b) => b.endTime - a.endTime);

      setEndedAuctions(relevantAuctions);
    } catch (error) {
      console.error("Error fetching ended auction accounts:", error);
      toast.error("Failed to load your ended auctions.");
    } finally {
      setLoading(false);
    }
}, [program, publicKey, connection]);

  useEffect(() => {
    if (connected && program) {
      fetchMyEndedAuctions();
    } else if (!connected) {
      setEndedAuctions([]);
      setLoading(false);
    }
  }, [connected, program, fetchMyEndedAuctions]);

  const handleSettleAuction = async (nftToSettle) => {
    if (!connected || !publicKey) {
      toast.error("Wallet not connected to settle auction.");
      return;
    }
    if (!program) {
      toast.error("Program not initialized. Please connect your wallet.");
      return;
    }

    toast.loading("Settling auction...", { id: "settle-auction" });

    try {
      const mintPublicKey = new PublicKey(nftToSettle.mintAddress);
      const auctionAccountPda = new PublicKey(nftToSettle.auctionPda); // Use the PDA fetched earlier
      const sellerPublicKey = new PublicKey(nftToSettle.seller);
      const highestBidderPublicKey = new PublicKey(nftToSettle.highestBidder); // Already a PublicKey string

      const programNftAccount = getAssociatedTokenAddressSync(
        mintPublicKey,
        auctionAccountPda,
        true
      );

      const sellerTokenAccount = getAssociatedTokenAddressSync(
        mintPublicKey,
        sellerPublicKey
      );

      const highestBidderTokenAccount = getAssociatedTokenAddressSync(
        mintPublicKey,
        highestBidderPublicKey // Highest Bidder's ATA for receiving NFT
      );

      // PDA for the escrow of the highest bidder's funds
      const [bidPda] = PublicKey.findProgramAddressSync(
        [anchor.utils.bytes.utf8.encode("escrow"), mintPublicKey.toBuffer()],
        program.programId
      );

      // Check if the current user is the highest bidder or the seller
      if (
        publicKey.toBase58() !== highestBidderPublicKey.toBase58() &&
        publicKey.toBase58() !== sellerPublicKey.toBase58()
      ) {
        toast.error(
          "You are neither the highest bidder nor the seller for this auction. Cannot settle."
        );
        return;
      }

      // Fetch the auction account again to get latest data
      const auctionAcc = await program.account.auction.fetch(auctionAccountPda);

      // Ensure auction has ended and there's a highest bidder
      const clockAcc = await connection.getAccountInfo(SYSVAR_CLOCK_PUBKEY);
      const onChainNow = new anchor.BN(
        clockAcc.data.slice(32, 40),
        "le"
      ).toNumber(); // Correct offset for unix_timestamp

      const transaction = new Transaction();

      // Ensure seller and highest bidder have their ATAs
      const signerIsSeller =
        publicKey.toBase58() === sellerPublicKey.toBase58();
      const signerIsHighestBidder =
        publicKey.toBase58() === highestBidderPublicKey.toBase58();

      if (signerIsSeller) {
        const sellerAtaInfo = await connection.getAccountInfo(
          sellerTokenAccount
        );
        if (!sellerAtaInfo) {
          transaction.add(
            createAssociatedTokenAccountInstruction(
              publicKey, // Fee payer for this ATA creation
              sellerTokenAccount,
              sellerPublicKey,
              mintPublicKey
            )
          );
        }
      }
      if (signerIsHighestBidder) {
        const highestBidderAtaInfo = await connection.getAccountInfo(
          highestBidderTokenAccount
        );
        if (!highestBidderAtaInfo) {
          transaction.add(
            createAssociatedTokenAccountInstruction(
              publicKey, // Fee payer for this ATA creation
              highestBidderTokenAccount,
              highestBidderPublicKey,
              mintPublicKey
            )
          );
        }
      }

      const settleAuctionInstruction = await program.methods
        .winnerNft()
        .accounts({
          seller: sellerPublicKey,
          bidder: highestBidderPublicKey,
          signer: publicKey,
          mint: mintPublicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .instruction();

      transaction.add(settleAuctionInstruction);

      const txSignature = await program.provider.sendAndConfirm(
        transaction,
        []
      );
      console.log("Auction settled successfully, signature:", txSignature);

      // Remove from the list after successful settlement
      setEndedAuctions((prev) =>
        prev.filter((nft) => nft.mintAddress !== nftToSettle.mintAddress)
      );
      toast.success("Auction settled successfully!", { id: "settle-auction" });

      setSuccessfulTxNftName(nftToSettle.name);
      setSuccessMessageType("settle");
      setShowFullScreenSuccess(true);
      setTimeout(() => setShowFullScreenSuccess(false),3000);
    } catch (error) {
      console.error("Error settling auction:", error);
      let errorMessage = `Failed to settle auction. Error: ${
        error.message || "Unknown error"
      }`;

      // --- ADDED: User cancellation handling for settle auction ---
      const errorMessageString = error.message
        ? error.message.toLowerCase()
        : "";
      if (
        errorMessageString.includes("user rejected") ||
        errorMessageString.includes("transaction cancelled") ||
        errorMessageString.includes("request rejected") ||
        (error.name === "WalletAdapterWalletError" &&
          errorMessageString.includes("operation cancelled")) ||
        (error.name === "WalletAdapterRpcError" &&
          errorMessageString.includes("cancelled")) ||
        (error.name === "Error" && errorMessageString.includes("cancelled"))
      ) {
        toast.dismiss("settle-auction");
        toast.error("Transaction cancelled by user.", {
          id: "user-cancelled-settle",
          duration: 3000,
        });
        return; // Exit
      }
      // --- END user cancellation handling ---

      if (error.logs) {
        const programLog = error.logs.find((log) =>
          log.includes("Program log: AnchorError")
        );
        if (programLog) {
          errorMessage = programLog.split("Error Message: ")[1] || errorMessage;
          if (errorMessage.includes("AuctionIsNotOver")) {
            errorMessage = "Settle failed: Auction has not ended yet.";
          } else if (errorMessage.includes("NoBidsPlaced")) {
            errorMessage =
              "Settle failed: No bids were placed. Seller should retrieve NFT.";
          } else if (errorMessage.includes("InvalidBidder")) {
            errorMessage = "Settle failed: Not the highest bidder.";
          } else if (errorMessage.includes("Unauthorized")) {
            errorMessage =
              "Settle failed: You are not authorized to settle this auction (not seller or highest bidder).";
          }
        }
      }
      toast.error(errorMessage, { id: "settle-auction", duration: 6000 });
    } finally {
      toast.dismiss("settle-auction");
    }
  };

  // This handleRetrieveNft is for when the auction has ended with NO bids.
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

      const clockAcc = await connection.getAccountInfo(SYSVAR_CLOCK_PUBKEY);
      const onChainNow = new anchor.BN(
        clockAcc.data.slice(32, 40),
        "le"
      ).toNumber(); // Correct offset

      // const hasEnded = onChainNow >= auctionAcc.endTime.toNumber();
      // Ensure currentBid is checked against 0 and highestBidder against SystemProgram.programId
      const noBids =
        auctionAcc.currentBid.isZero() ||
        auctionAcc.highestBidder.toBase58() ===
          SystemProgram.programId.toBase58();

      // if (!hasEnded) { // This check relies on clock, not auctionStatus directly.
      //                  // Your program should also have a check for this.
      //     toast.error("Cannot retrieve NFT: Auction has not ended yet.", { id: 'retrieve-nft' });
      //     return;
      // }
      // if (!noBids) {
      //   // This means there WAS a bid
      //   toast.error(
      //     "Cannot retrieve NFT: Bids were placed. Use the 'Settle Auction' function instead.",
      //     { id: "retrieve-nft" }
      //   );
      //   return;
      // }
      // Also ensure it's not already settled or cancelled before attempting to retrieve
      // if (auctionAcc.auctionStatus.settled !== undefined) {
      //   toast.error("Auction is already settled.", { id: "retrieve-nft" });
      //   return;
      // }
      // if (auctionAcc.auctionStatus.cancelled !== undefined) {
      //   toast.error("Auction is already cancelled.", { id: "retrieve-nft" });
      //   return;
      // }

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

      // Re-using cancelAuction for no-bid retrieval. Ensure your Anchor program's
      // `cancel_auction` instruction logic correctly handles both early cancel and
      // post-end-no-bid retrieval.
      const retrieveNftInstruction = await program.methods
        .cancelAuction() // Assuming this is the correct instruction
        .accounts({
          seller: publicKey,
          mint: mintPublicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .instruction();

      transaction.add(retrieveNftInstruction);

      const txSignature = await program.provider.sendAndConfirm(
        transaction,
        []
      );
      console.log("NFT retrieved successfully, signature:", txSignature);

      // Remove from the list after successful retrieval
      setEndedAuctions((prev) =>
        prev.filter((nft) => nft.mintAddress !== nftToRetrieve.mintAddress)
      );
      toast.success("NFT retrieved successfully!", { id: "retrieve-nft" });

      setSuccessfulTxNftName(nftToRetrieve.name);
      setSuccessMessageType("retrieve");
      setShowFullScreenSuccess(true);
      setTimeout(() => setShowFullScreenSuccess(false), 3000);
    } catch (error) {
      console.error("Error retrieving NFT:", error);
      let errorMessage = `Failed to retrieve NFT. Error: ${
        error.message || "Unknown error"
      }`;

      // --- ADDED: User cancellation handling for retrieve NFT ---
      const errorMessageString = error.message
        ? error.message.toLowerCase()
        : "";
      if (
        errorMessageString.includes("user rejected") ||
        errorMessageString.includes("transaction cancelled") ||
        errorMessageString.includes("request rejected") ||
        (error.name === "WalletAdapterWalletError" &&
          errorMessageString.includes("operation cancelled")) ||
        (error.name === "WalletAdapterRpcError" &&
          errorMessageString.includes("cancelled")) ||
        (error.name === "Error" && errorMessageString.includes("cancelled"))
      ) {
        toast.dismiss("retrieve-nft");
        toast.error("Transaction cancelled by user.", {
          id: "user-cancelled-retrieve",
          duration: 3000,
        });
        return; // Exit
      }
      // --- END user cancellation handling ---

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

  const formatTimeLeft = (seconds) => {
    if (seconds <= 0) return "Auction Ended";
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

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-950 to-black text-white flex justify-center items-center p-4">
        <p className="text-xl md:text-2xl font-semibold animate-pulse">
          Loading your ended auctions...
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
            className="fixed inset-0 bg-transparent bg-opacity-75 backdrop-blur-lg flex flex-col items-center justify-center z-50 text-white"
            variants={fullScreenSuccessVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
          >
            <motion.svg
              className="w-32 h-32 text-green-300 mb-6"
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
              className="text-5xl md:text-7xl font-extrabold mb-4 text-center"
              variants={textVariants}
            >
              {successMessageType === "settle"
                ? "Auction Settled!"
                : "NFT Retrieved!"}
            </motion.h2>
            <motion.p
              className="text-2xl md:text-3xl text-center px-4"
              variants={textVariants}
            >
              {successMessageType === "settle"
                ? `You have successfully settled the auction for ${successfulTxNftName}!`
                : `You have successfully retrieved ${successfulTxNftName}!`}
            </motion.p>
          </motion.div>
        )}
      </AnimatePresence>

      <motion.h1
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="text-4xl sm:text-5xl md:text-6xl font-extrabold mb-10 md:mb-12 text-center text-transparent bg-clip-text bg-gradient-to-r from-green-400 via-yellow-400 to-red-500"
      >
        Ended Auctions & Claims
      </motion.h1>

      {!connected ? (
        <div className="text-center text-xl text-gray-400">
          Please connect your wallet to view your ended auctions.
        </div>
      ) : endedAuctions.length === 0 ? (
        <div className="flex flex-col items-center justify-center p-8 text-center">
          <h1 className="text-3xl sm:text-4xl md:text-5xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-gray-400 to-gray-600 mb-6">
            No Ended Auctions to Settle
          </h1>
          <p className="text-lg md:text-xl text-gray-400 mt-4 max-w-xl mx-auto">
            Any auctions you sold or bid on that have ended will appear here for
            settlement.
          </p>
        </div>
      ) : (
        <AnimatePresence>
          <motion.div
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-6 md:gap-8"
            variants={containerVariants}
            initial="hidden"
            animate="visible"
          >
            {endedAuctions.map((nft) => (
              <motion.div
                key={nft.mintAddress}
                className="bg-gray-800/60 backdrop-blur-sm rounded-xl shadow-lg hover:shadow-2xl hover:border-blue-500 border border-gray-700 transition-all duration-300 relative overflow-hidden flex flex-col"
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
                    <span className="font-bold text-gray-500">
                      {nft.initialPrice} SOL
                    </span>
                  </p>
                  <p className="text-lg font-semibold text-blue-300 mb-2">
                    Final Bid:{" "}
                    <span className="font-bold">
                      {nft.currentBid === 0
                        ? "No Bids Placed"
                        : `${nft.currentBid.toFixed(9)} SOL`}
                    </span>
                  </p>
                  <p className="text-sm text-gray-300">
                    Auction Ended{" "}
                    <span className="font-bold text-red-500">
                      {/* {new Date(nft.endTime * 1000).toLocaleString()} */}
                    </span>
                  </p>
                  {nft.isSeller && (
                    <p className="text-sm text-green-400 font-semibold mt-1">
                      You are the Seller
                    </p>
                  )}
                  {nft.isHighestBidder && (
                    <p className="text-sm text-yellow-400 font-semibold mt-1">
                      You are the Highest Bidder
                    </p>
                  )}

                  <p className="text-gray-500 text-xs mt-2 break-all">
                    Mint: {nft.mintAddress.substring(0, 6)}...
                    {nft.mintAddress.substring(nft.mintAddress.length - 6)}
                  </p>

                  <div className="mt-4">
                    {/* Render action buttons based on user role and bid status */}
                    {nft.isSeller &&
                      (nft.currentBid === 0 ||
                      nft.highestBidder ===
                        SystemProgram.programId.toBase58() ? ( // No bids placed
                        <motion.button
                          whileHover={{ scale: 1.05 }}
                          whileTap={{ scale: 0.95 }}
                          onClick={() => handleRetrieveNft(nft)}
                          className="w-full bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white font-bold py-2 rounded-md transition-all duration-200 text-base shadow-md hover:shadow-lg"
                        >
                          Retrieve NFT
                        </motion.button>
                      ) : (
                        // Bids were placed, seller can settle
                        <motion.button
                          whileHover={{ scale: 1.05 }}
                          whileTap={{ scale: 0.95 }}
                          onClick={() => handleSettleAuction(nft)}
                          className="w-full bg-gradient-to-r from-green-500 to-blue-500 hover:from-green-600 hover:to-blue-600 text-white font-bold py-2 rounded-md transition-all duration-200 text-base shadow-md hover:shadow-lg"
                        >
                          Settle Auction (Seller)
                        </motion.button>
                      ))}

                    {/* Corrected line: nft.highestBidder is already a string here */}
                    {nft.isHighestBidder &&
                      nft.highestBidder !==
                        SystemProgram.programId.toBase58() && (
                        <motion.button
                          whileHover={{ scale: 1.05 }}
                          whileTap={{ scale: 0.95 }}
                          onClick={() => handleSettleAuction(nft)}
                          className="w-full bg-gradient-to-r from-yellow-500 to-orange-500 hover:from-yellow-600 hover:to-orange-600 text-white font-bold py-2 rounded-md transition-all duration-200 text-base shadow-md hover:shadow-lg mt-2"
                        >
                          Settle Auction (Buyer)
                        </motion.button>
                      )}
                    {!nft.isSeller && !nft.isHighestBidder && (
                      <p className="text-center text-gray-400 text-sm mt-2">
                        Auction ended. You are not the seller or highest bidder.
                      </p>
                    )}
                  </div>
                </div>
              </motion.div>
            ))}
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

export default MyAuctions;
