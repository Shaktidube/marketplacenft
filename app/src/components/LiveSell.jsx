// LiveSell.jsx
import React, { useState, useEffect, useCallback } from "react"; // Added useCallback
import { motion, AnimatePresence } from "framer-motion";
import * as anchor from "@coral-xyz/anchor";
import {
  PublicKey,
  Transaction,
  SystemProgram,
} from "@solana/web3.js";
import toast from "react-hot-toast";
import { useWallet } from "@solana/wallet-adapter-react"; // Keep useWallet for 'wallet'
import {
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountInstruction,
  getAssociatedTokenAddressSync, // Using Sync for simpler PDA derivations where possible
} from "@solana/spl-token";
import {
  fetchDigitalAsset,
} from "@metaplex-foundation/mpl-token-metadata";
import { useSolanaProgram } from "../contexts/SolanaProgramContext";
import NftDetailModal from "./NftDetailModal"; // Ensure NftDetailModal is imported correctly if it's external

// Card animation variants (unchanged)
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

// Container animation variants for the grid (unchanged)
const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1,
    },
  },
};

// REFINED Full-Screen Success/Delist Animation Variants (minor adjustment for better flow)
const successOverlayVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      when: "beforeChildren", // Animate overlay in first, then its children
      duration: 0.3, // Overlay fades in quickly
    },
  },
  exit: {
    opacity: 0,
    transition: {
      duration: 0.7, // Longer exit duration for a smoother fade out
      when: "afterChildren", // Children fade out first, then overlay
    },
  },
};

const successEmojiVariants = {
  hidden: { opacity: 0, scale: 0 },
  visible: {
    opacity: 1,
    scale: 1,
    transition: {
      type: "spring",
      stiffness: 200,
      damping: 15,
      delay: 0.1, // Slight delay for a pop effect
    },
  },
  exit: { opacity: 0, scale: 0, transition: { duration: 0.2 } },
};

const successContentVariants = {
  hidden: { opacity: 0, y: 30 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      type: "spring",
      stiffness: 150,
      damping: 10,
      delay: 0.2, // Delayed entry after emoji
    },
  },
  exit: { opacity: 0, y: -30, transition: { duration: 0.2 } },
};

function LiveSell() {
  const { program, provider, umi, connection, connected, publicKey } = useSolanaProgram();
  const { wallet } = useWallet(); // Use useWallet for signing transactions

  const [listedNfts, setListedNfts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null); // Added error state
  const [showSuccessAnimation, setShowSuccessAnimation] = useState(false);
  const [successfulTxNftName, setSuccessfulTxNftName] = useState("");
  const [isDelistAnimation, setIsDelistAnimation] = useState(false);

  const [selectedNft, setSelectedNft] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  // NEW: useEffect to automatically dismiss the animation after a set time
  useEffect(() => {
    let timer;
    if (showSuccessAnimation) {
      timer = setTimeout(() => {
        setShowSuccessAnimation(false);
        setIsDelistAnimation(false); // Reset animation type
        setSuccessfulTxNftName(""); // Clear NFT name
      }, 2500);
    }
    return () => {
      if (timer) {
        clearTimeout(timer);
      }
    };
  }, [showSuccessAnimation]);


  // --- NEW: Fetch listed NFTs directly from the blockchain ---
  const fetchListedNfts = useCallback(async () => {
    if (!program || !connection || !umi) {
      setListedNfts([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    toast.loading("Fetching live listings...", { id: "fetch-listings" });

    try {
      // Fetch all 'listing' accounts from your program
      const allListingAccounts = await program.account.listing.all();
      console.log("Fetched raw listing accounts:", allListingAccounts);

      const processedListingsPromises = allListingAccounts.map(async (account) => {
        const mintAddress = account.account.mint.toBase58();
        const sellerAddress = account.account.seller.toBase58();
        const priceLamports = account.account.price; // This is an Anchor BN

        let nftData = {
          mintAddress: mintAddress,
          seller: sellerAddress,
          sellPrice: priceLamports.toNumber() / anchor.web3.LAMPORTS_PER_SOL, // Convert lamports to SOL
          name: "Loading...",
          symbol: "",
          image: null,
          description: "Fetching NFT details...",
          // Include raw price for transaction if needed
          rawPriceLamports: priceLamports,
        };

        try {
          // Fetch Metaplex DigitalAsset data using Umi
          const digitalAsset = await fetchDigitalAsset(umi, new PublicKey(mintAddress));
          console.log(`Fetched digital asset for ${mintAddress}:`, digitalAsset);

          nftData.name = digitalAsset.metadata.name || `Unnamed NFT #${mintAddress.substring(0, 6)}`;
          nftData.symbol = digitalAsset.metadata.symbol || '';
          nftData.description = digitalAsset.metadata.description || 'No description available.';
          nftData.sellerFeeBasisPoints = digitalAsset.metadata.sellerFeeBasisPoints; // Get royalty info
          nftData.creators = digitalAsset.metadata.creators.map(creator => ({
            address: creator.address.toString(),
            share: creator.share,
          }));

          if (digitalAsset.metadata.uri) {
            const metadataResponse = await fetch(digitalAsset.metadata.uri);
            if (metadataResponse.ok) {
              const fetchedMetadata = await metadataResponse.json();
              if (fetchedMetadata.image) {
                nftData.image = fetchedMetadata.image;
              }
              if (fetchedMetadata.description) {
                // Prioritize fetched description if more detailed
                nftData.description = fetchedMetadata.description;
              }
            }
          } else if (digitalAsset.content && digitalAsset.content.files && digitalAsset.content.files.length > 0) {
            const imageFile = digitalAsset.content.files.find(file => file.mime && file.mime.startsWith('image/'));
            if (imageFile) {
                nftData.image = imageFile.uri;
            }
          }
        } catch (nftFetchError) {
          console.warn(`Could not fetch full NFT data for ${mintAddress}:`, nftFetchError);
          nftData.name = `NFT Not Found (${mintAddress.substring(0, 6)})`;
          nftData.description = "NFT metadata could not be retrieved.";
        }
        return nftData;
      });

      const fetchedListedNfts = await Promise.all(processedListingsPromises);
      setListedNfts(fetchedListedNfts);
      toast.success(`${fetchedListedNfts.length} NFTs loaded successfully!`, { id: "fetch-listings" });

    } catch (err) {
      console.error("Error fetching live listings:", err);
      let userMessage = "Failed to fetch live listings. Please try again later.";
      if (err.message.includes("Account does not exist") || err.message.includes("could not be fetched")) {
        userMessage = "No active listings found or a network issue occurred.";
      }
      setError(userMessage);
      toast.error(userMessage, { id: "fetch-listings" });
    } finally {
      setLoading(false);
    }
  }, [program, connection, umi]); // Dependencies for useCallback

  useEffect(() => {
    fetchListedNfts();
  }, [fetchListedNfts]); // Call fetchListedNfts when it changes (which it won't unless dependencies change)


  const handleDelist = async (nftToDelist) => {
    if (!connected || !publicKey || !program || !provider || !wallet?.adapter) {
      toast.error("Wallet not connected or program not initialized.");
      return;
    }

    if (publicKey.toBase58() !== nftToDelist.seller) {
      toast.error("You are not the seller of this NFT. Cannot delist.");
      return;
    }

    toast.loading("Delisting NFT...", { id: "delist-nft" });

    try {
      const mintPublicKey = new PublicKey(nftToDelist.mintAddress);

      // Derive the listing PDA
      const [listingPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("listing"), mintPublicKey.toBuffer()],
        program.programId
      );

      // Derive the escrow ATA (controlled by the listing PDA)
      const escrowAta = getAssociatedTokenAddressSync(
        mintPublicKey,
        listingPda,
        true // allow owner off curve
      );

      // Derive the seller's destination ATA
      const sellerTokenAccount = getAssociatedTokenAddressSync(
        mintPublicKey,
        publicKey
      );

      const transaction = new Transaction();

      // Check if seller's ATA exists, if not, add instruction to create it
      // This is crucial if the seller didn't have the ATA when they delisted the NFT
      const sellerAtaInfo = await connection.getAccountInfo(sellerTokenAccount);
      if (!sellerAtaInfo) {
          transaction.add(
              createAssociatedTokenAccountInstruction(
                  publicKey,          // Payer
                  sellerTokenAccount, // ATA to create
                  publicKey,          // Owner of the ATA
                  mintPublicKey,      // Mint address
                  TOKEN_PROGRAM_ID,
                  ASSOCIATED_TOKEN_PROGRAM_ID
              )
          );
      }

      const delistInstruction = await program.methods
        .cancelListing()
        .accounts({
          seller: publicKey,
          mint: mintPublicKey,
          sellerTokenAccount: sellerTokenAccount,
          escrowAta: escrowAta,
          listingAccount: listingPda, // Program's listing account
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .instruction();

      transaction.add(delistInstruction);

      const { blockhash, lastValidBlockHeight } = await provider.connection.getLatestBlockhash('finalized');
      transaction.recentBlockhash = blockhash;
      transaction.lastValidBlockHeight = lastValidBlockHeight;
      transaction.feePayer = publicKey;

      const signedTransaction = await wallet.adapter.signTransaction(transaction);
      const txSign = await provider.connection.sendRawTransaction(signedTransaction.serialize());

      await provider.connection.confirmTransaction({
          signature: txSign,
          blockhash: blockhash,
          lastValidBlockHeight: lastValidBlockHeight,
      }, "confirmed");

      // On successful delist, trigger re-fetch to update UI based on blockchain state
      toast.success("NFT delisted successfully!", { id: "delist-nft" });
      setSuccessfulTxNftName(nftToDelist.name);
      setIsDelistAnimation(true);
      setShowSuccessAnimation(true);
      fetchListedNfts(); // Re-fetch the list

    } catch (error) {
      console.error("Error delisting NFT:", error);
      let errorMessage = `Failed to delist NFT. Error: ${error.message || "Unknown error"}`;
      if (error.message.includes("User rejected the request")) {
        errorMessage = "Transaction cancelled by user.";
      } else if (error.logs) {
        const programLog = error.logs.find((log) => log.includes("Program log: AnchorError"));
        if (programLog) {
          errorMessage = `Delist failed: ${programLog.split("Error Message: ")[1] || errorMessage}`;
        }
      }
      toast.error(errorMessage, { id: "delist-nft", duration: 6000 });
    }
  };


  const handleBuy = async (nft) => {
    if (!connected || !publicKey || !program || !provider || !wallet?.adapter) {
      toast.error("Please connect your wallet to buy this NFT.");
      return;
    }
    if (publicKey.toBase58() === nft.seller) {
      toast.error("You cannot buy your own NFT!");
      return;
    }

    toast.loading(`Buying ${nft.name} for ${nft.sellPrice} SOL...`, { id: "buy-nft" });
    try {
      const mintPublicKey = new PublicKey(nft.mintAddress);
      const sellerPublicKey = new PublicKey(nft.seller);

      // Derive the listing PDA
      const [listingPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("listing"), mintPublicKey.toBuffer()],
        program.programId
      );

      // Fetch the listing account to get the actual price
      const listingAccount = await program.account.listing.fetch(listingPda);
      const priceInLamports = listingAccount.price; // This is an Anchor BN

      // Derive the escrow ATA (controlled by the listing PDA)
      const escrowAta = getAssociatedTokenAddressSync(
        mintPublicKey,
        listingPda,
        true // allow owner off curve
      );

      // Derive the buyer's destination ATA
      const buyerTokenAccount = getAssociatedTokenAddressSync(
        mintPublicKey,
        publicKey
      );

      const transaction = new Transaction();

      // Check if buyer's ATA exists, if not, add instruction to create it
      const buyerAtaInfo = await connection.getAccountInfo(buyerTokenAccount);
      if (!buyerAtaInfo) {
        const createBuyerAtaInstruction = createAssociatedTokenAccountInstruction(
          publicKey, // Payer
          buyerTokenAccount, // ATA to create
          publicKey, // Owner of the ATA
          mintPublicKey, // Mint address
          TOKEN_PROGRAM_ID,
          ASSOCIATED_TOKEN_PROGRAM_ID
        );
        transaction.add(createBuyerAtaInstruction);
      }

      // Prepare remainingAccounts for royalties
      let remainingAccounts = [];
      let totalRoyaltyLamports = new anchor.BN(0);

      if (nft.sellerFeeBasisPoints && nft.sellerFeeBasisPoints > 0 && nft.creators && nft.creators.length > 0) {
        const royaltyFraction = nft.sellerFeeBasisPoints / 10000;
        totalRoyaltyLamports = priceInLamports
          .mul(new anchor.BN(Math.round(royaltyFraction * 10000))) // Use Math.round for precision
          .div(new anchor.BN(10000));

        if (totalRoyaltyLamports.gt(new anchor.BN(0))) {
          // Add royalty payment transfers to the transaction
          nft.creators.forEach((creator) => {
            if (creator.share > 0) {
              const creatorRoyaltyLamports = totalRoyaltyLamports
                .mul(new anchor.BN(creator.share))
                .div(new anchor.BN(100)); // Share is out of 100

              if (creatorRoyaltyLamports.gt(new anchor.BN(0))) {
                remainingAccounts.push({
                  pubkey: new PublicKey(creator.address),
                  isWritable: true,
                  isSigner: false,
                });
                transaction.add(
                  SystemProgram.transfer({
                    fromPubkey: publicKey,
                    toPubkey: new PublicKey(creator.address),
                    lamports: creatorRoyaltyLamports.toNumber(),
                  })
                );
              }
            }
          });
        }
      }

      // Add the buy_nft instruction
      const buyInstruction = await program.methods
        .buyNft()
        .accounts({
          buyer: publicKey,
          seller: sellerPublicKey,
          mint: mintPublicKey,
          buyerTokenAccount: buyerTokenAccount,
          escrowAta: escrowAta,
          listingAccount: listingPda, // Pass the listing account PDA
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        })
        .remainingAccounts(remainingAccounts) // Pass creators if any
        .instruction();

      transaction.add(buyInstruction);

      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('finalized');
      transaction.recentBlockhash = blockhash;
      transaction.lastValidBlockHeight = lastValidBlockHeight;
      transaction.feePayer = publicKey;

      const signedTransaction = await wallet.adapter.signTransaction(transaction);
      const txSignature = await connection.sendRawTransaction(
        signedTransaction.serialize(),
        { skipPreflight: false, maxRetries: 3 }
      );

      const confirmation = await connection.confirmTransaction(
        { signature: txSignature, blockhash: blockhash, lastValidBlockHeight: lastValidBlockHeight },
        "confirmed"
      );

      if (confirmation.value.err) {
        throw new Error(`Transaction failed: ${JSON.stringify(confirmation.value.err)}`);
      }

      // On successful buy, trigger re-fetch to update UI based on blockchain state
      toast.success(`Successfully bought ${nft.name}!`, { id: "buy-nft" });
      setSuccessfulTxNftName(nft.name);
      setIsDelistAnimation(false);
      setShowSuccessAnimation(true);
      fetchListedNfts(); // Re-fetch the list

    } catch (error) {
      console.error("Error buying NFT:", error);
      let errorMessage = `Failed to buy NFT. Error: ${error.message || "Unknown error"}`;
      if (error.message.includes("User rejected the request")) {
        errorMessage = "Transaction cancelled by user.";
      } else if (error.logs) {
        const programLog = error.logs.find((log) => log.includes("Program log: AnchorError"));
        if (programLog) {
          errorMessage = `Buy failed: ${programLog.split("Error Message: ")[1] || errorMessage}`;
        }
      }
      toast.error(errorMessage, { id: "buy-nft", duration: 6000 });
    }
  };

  // The onAnimationComplete only resets specific state, not the trigger to hide.
  const handleAnimationComplete = (definition) => {
    // This is called when Framer Motion's internal animation state changes.
    // We only care about the 'exit' completion if we need to do something *after*
    // the overlay visually disappears, but our useEffect already handles the primary dismissal.
    // Keeping it for potential future complex cleanup, but not strictly needed for basic dismiss.
    if (definition === "exit") {
      console.log("Success/Delist animation exited.");
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 to-black text-white flex justify-center items-center">
        <p>Loading live listings...</p>
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
          onClick={fetchListedNfts} // Retry fetching
          className="mt-8 px-8 py-3 bg-gradient-to-r from-red-600 to-orange-600 text-white font-semibold rounded-full shadow-lg hover:shadow-xl transition-all duration-300"
        >
          Retry Fetching Listings
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 to-black text-white p-4 md:p-8 custom-scrollbar-hidden">
      <motion.h1
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="text-4xl md:text-5xl font-extrabold mb-10 text-center text-transparent bg-clip-text bg-gradient-to-r from-red-400 to-purple-600"
      >
        NFTs Live for Sale
      </motion.h1>

      <AnimatePresence mode="wait"> {/* Use mode="wait" for cleaner transitions */}
        {listedNfts.length > 0 ? (
          <motion.div
            key="nft-grid" // Add a key to the div for AnimatePresence to track it
            className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-8"
            variants={containerVariants}
            initial="hidden"
            animate="visible"
            exit="hidden" // Animate grid out when empty
          >
            {listedNfts.map((nft) => (
              <motion.div
                key={nft.mintAddress}
                className="bg-gray-800 rounded-lg shadow-lg cursor-pointer hover:scale-105 transition-transform duration-300 overflow-hidden group"
                variants={cardVariants} // Use the defined cardVariants
                onClick={() => {
                  setSelectedNft(nft);
                  setIsModalOpen(true);
                }}
              >
                <div className="relative w-full h-48 bg-gray-700 flex items-center justify-center overflow-hidden">
                  {nft.image ? (
                    <img
                      src={nft.image}
                      alt={nft.name}
                      className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-110"
                    />
                  ) : (
                    <div className="text-gray-400 text-center p-4">
                      No Image Available
                    </div>
                  )}
                </div>
                <div className="p-4">
                  <h3 className="text-xl font-bold text-white truncate mb-1">
                    {nft.name}
                  </h3>
                  <p className="text-gray-400 text-sm truncate">{nft.symbol}</p>
                  <p className="text-lg font-semibold text-purple-400 mt-2">
                    Price: {nft.sellPrice} SOL
                  </p>
                  <p className="text-gray-500 text-xs mt-1 break-all">
                    Mint: {nft.mintAddress.substring(0, 6)}...{nft.mintAddress.slice(-6)}
                  </p>

                  {/* Conditional Rendering for Buttons */}
                  {connected && publicKey && nft.seller === publicKey.toBase58() ? (
                    <motion.button
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={(e) => { e.stopPropagation(); handleDelist(nft); }} // Stop propagation to prevent modal open
                      className="mt-4 w-full bg-gradient-to-r from-red-500 to-rose-700 hover:from-rose-700 hover:to-red-600 text-white font-bold py-2 rounded-md transition-all duration-200 text-base shadow-md hover:shadow-lg"
                    >
                      Delist
                    </motion.button>
                  ) : connected && publicKey ? (
                    <motion.button
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={(e) => { e.stopPropagation(); handleBuy(nft); }} // Stop propagation
                      className="mt-4 w-full bg-gradient-to-r from-green-500 to-blue-600 hover:from-green-600 hover:to-blue-700 text-white font-bold py-2 rounded-md transition-all duration-200 text-base shadow-md hover:shadow-lg"
                    >
                      Buy Now
                    </motion.button>
                  ) : (
                    <p className="mt-4 text-center text-gray-400 text-sm">
                      Connect wallet to buy
                    </p>
                  )}
                </div>
              </motion.div>
            ))}
          </motion.div>
        ) : (
          <motion.div
            key="no-nfts-message" // Add a key for AnimatePresence
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.5 }}
            className="flex flex-col items-center justify-center min-h-[calc(100vh-200px)]"
          >
            <h2 className="text-4xl md:text-5xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 to-pink-500 mb-8 text-center">
              No NFTs Listed for Sale Yet!
            </h2>
            <p className="text-center text-lg text-gray-400 mt-4 max-w-xl">
              Be the first to list an NFT for sale from your collection.
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      <NftDetailModal
        nft={selectedNft}
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
      />

      {/* Full-Screen Success/Delist Animation */}
      <AnimatePresence>
        {showSuccessAnimation && (
          <motion.div
            key="success-animation-overlay"
            className="fixed inset-0 bg-black bg-opacity-75 backdrop-blur-lg flex flex-col items-center justify-center z-50 p-8"
            variants={successOverlayVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            onAnimationComplete={handleAnimationComplete}
          >
            <motion.div className="text-center">
              <motion.p
                variants={successEmojiVariants}
                className="text-8xl md:text-9xl mb-8"
              >
                {isDelistAnimation ? "👋" : "🎉"}
              </motion.p>
              <motion.h2
                variants={successContentVariants}
                className={`text-5xl md:text-7xl font-extrabold text-transparent bg-clip-text mb-4 ${
                  isDelistAnimation
                    ? "bg-gradient-to-r from-red-400 to-orange-500"
                    : "bg-gradient-to-r from-green-400 to-blue-500"
                }`}
              >
                {isDelistAnimation
                  ? `${successfulTxNftName} Delisted!`
                  : `${successfulTxNftName} Purchased!`}
              </motion.h2>
              <motion.p
                variants={successContentVariants}
                className="text-xl md:text-2xl text-gray-300"
              >
                {isDelistAnimation
                  ? "Your NFT has been returned to your wallet."
                  : "Congratulations on your new acquisition!"}
              </motion.p>
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

export default LiveSell;