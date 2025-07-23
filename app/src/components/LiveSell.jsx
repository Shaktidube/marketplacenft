// LiveSell.jsx
import React, { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import * as anchor from "@coral-xyz/anchor";
import {
  PublicKey,
  Transaction,
  SystemProgram,
} from "@solana/web3.js";
import toast from "react-hot-toast";
import { useWallet } from "@solana/wallet-adapter-react";
import {
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountInstruction,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import {
  fetchDigitalAsset,
} from "@metaplex-foundation/mpl-token-metadata";
import { useSolanaProgram } from "../contexts/SolanaProgramContext";
// Assuming NftDetailModal is defined in a separate file like NftDetailModal.jsx
import NftDetailModal from "./NftDetailModal";

// Card animation variants
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

// Container animation variants for the grid
const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1,
    },
  },
};

// Full-Screen Success/Delist Animation Variants
const successOverlayVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      when: "beforeChildren",
      duration: 0.3,
    },
  },
  exit: {
    opacity: 0,
    transition: {
      duration: 0.7,
      when: "afterChildren",
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
      delay: 0.1,
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
      delay: 0.2,
    },
  },
  exit: { opacity: 0, y: -30, transition: { duration: 0.2 } },
};


function LiveSell() {
  const { program, provider, umi, connection, connected, publicKey } = useSolanaProgram();
  const { wallet } = useWallet();

  const [listedNfts, setListedNfts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showSuccessAnimation, setShowSuccessAnimation] = useState(false);
  const [successfulTxNftName, setSuccessfulTxNftName] = useState("");
  const [isDelistAnimation, setIsDelistAnimation] = useState(false);

  const [selectedNft, setSelectedNft] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Effect to automatically dismiss the success/delist animation
  useEffect(() => {
    let timer;
    if (showSuccessAnimation) {
      timer = setTimeout(() => {
        setShowSuccessAnimation(false);
        setIsDelistAnimation(false);
        setSuccessfulTxNftName("");
      }, 2500);
    }
    return () => {
      if (timer) {
        clearTimeout(timer);
      }
    };
  }, [showSuccessAnimation]);

  // Function to fetch listed NFTs directly from the blockchain
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
      const allListingAccounts = await program.account.listing.all();
      console.log("Fetched raw listing accounts:", allListingAccounts);

      const processedListingsPromises = allListingAccounts.map(async (account) => {
        const mintAddress = account.account.mint.toBase58();
        const sellerAddress = account.account.seller.toBase58();
        const priceLamports = account.account.price;

        let nftData = {
          mintAddress: mintAddress,
          seller: sellerAddress,
          sellPrice: priceLamports.toNumber() / anchor.web3.LAMPORTS_PER_SOL,
          name: "Unnamed NFT",
          symbol: "",
          image: null,
          description: "No description available.",
          rawPriceLamports: priceLamports,
          sellerFeeBasisPoints: 0,
          creators: [],
        };

        try {
          const digitalAsset = await fetchDigitalAsset(umi, new PublicKey(mintAddress));
          console.log(`Fetched digital asset for ${mintAddress}:`, digitalAsset);

          nftData.name = digitalAsset.metadata.name || `Unnamed NFT #${mintAddress.substring(0, 6)}`;
          nftData.symbol = digitalAsset.metadata.symbol || '';
          nftData.sellerFeeBasisPoints = digitalAsset.metadata.sellerFeeBasisPoints || 0;

          // Safely map creators if the array exists
          if (digitalAsset.metadata.creators && Array.isArray(digitalAsset.metadata.creators)) {
            nftData.creators = digitalAsset.metadata.creators.map(creator => ({
              address: creator.address.toString(),
              share: creator.share,
            }));
          }

          // Fetch off-chain metadata for image and detailed description
          if (digitalAsset.metadata.uri) {
            try {
              const metadataResponse = await fetch(digitalAsset.metadata.uri);
              if (metadataResponse.ok) {
                const fetchedMetadata = await metadataResponse.json();
                if (fetchedMetadata.image) {
                  nftData.image = fetchedMetadata.image;
                }
                if (fetchedMetadata.description) {
                  nftData.description = fetchedMetadata.description;
                }
              } else {
                console.warn(`Failed to fetch metadata from URI: ${digitalAsset.metadata.uri}. Status: ${metadataResponse.status}`);
              }
            } catch (fetchUriError) {
              console.warn(`Error fetching metadata from URI ${digitalAsset.metadata.uri}:`, fetchUriError);
            }
          }

          // Fallback to on-chain image if off-chain URI fails or is not present
          if (!nftData.image && digitalAsset.content && digitalAsset.content.files && digitalAsset.content.files.length > 0) {
            const imageFile = digitalAsset.content.files.find(file => file.mime && file.mime.startsWith('image/'));
            if (imageFile) {
                nftData.image = imageFile.uri;
            }
          }

        } catch (nftFetchError) {
          console.warn(`Could not fetch full NFT data for ${mintAddress}:`, nftFetchError);
          nftData.name = `NFT Error (${mintAddress.substring(0, 6)})`;
          nftData.description = "NFT metadata could not be retrieved. It might be invalid or no longer available.";
          nftData.image = "https://via.placeholder.com/150?text=NFT+Error"; // Placeholder for errors
        }
        return nftData;
      });

      const fetchedListedNfts = await Promise.all(processedListingsPromises);
      // Filter out any NFTs that completely failed to load or are malformed if necessary
      const validNfts = fetchedListedNfts.filter(nft => nft.name !== "NFT Error" || nft.image);
      setListedNfts(validNfts);
      toast.success(`${validNfts.length} NFTs loaded successfully!`, { id: "fetch-listings" });

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
  }, [program, connection, umi]);

  useEffect(() => {
    fetchListedNfts();
  }, [fetchListedNfts]);


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

      const [listingPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("listing"), mintPublicKey.toBuffer()],
        program.programId
      );

      const escrowAta = getAssociatedTokenAddressSync(
        mintPublicKey,
        listingPda,
        true
      );

      const sellerTokenAccount = getAssociatedTokenAddressSync(
        mintPublicKey,
        publicKey
      );

      const transaction = new Transaction();

      const sellerAtaInfo = await connection.getAccountInfo(sellerTokenAccount);
      if (!sellerAtaInfo) {
          transaction.add(
              createAssociatedTokenAccountInstruction(
                  publicKey,
                  sellerTokenAccount,
                  publicKey,
                  mintPublicKey,
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
          listingAccount: listingPda,
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

      toast.success("NFT delisted successfully!", { id: "delist-nft" });
      setSuccessfulTxNftName(nftToDelist.name);
      setIsDelistAnimation(true);
      setShowSuccessAnimation(true);
      fetchListedNfts();

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

      const [listingPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("listing"), mintPublicKey.toBuffer()],
        program.programId
      );

      const listingAccount = await program.account.listing.fetch(listingPda);
      const priceInLamports = listingAccount.price;

      const escrowAta = getAssociatedTokenAddressSync(
        mintPublicKey,
        listingPda,
        true
      );

      const buyerTokenAccount = getAssociatedTokenAddressSync(
        mintPublicKey,
        publicKey
      );

      const transaction = new Transaction();

      const buyerAtaInfo = await connection.getAccountInfo(buyerTokenAccount);
      if (!buyerAtaInfo) {
        const createBuyerAtaInstruction = createAssociatedTokenAccountInstruction(
          publicKey,
          buyerTokenAccount,
          publicKey,
          mintPublicKey,
          TOKEN_PROGRAM_ID,
          ASSOCIATED_TOKEN_PROGRAM_ID
        );
        transaction.add(createBuyerAtaInstruction);
      }

      let remainingAccounts = [];
      let totalRoyaltyLamports = new anchor.BN(0);

      // Only calculate and add royalty transfers if sellerFeeBasisPoints is positive and creators exist
      if (nft.sellerFeeBasisPoints > 0 && nft.creators && nft.creators.length > 0) {
        const royaltyFraction = nft.sellerFeeBasisPoints / 10000;
        // Calculate total royalty from the NFT's listed price
        totalRoyaltyLamports = priceInLamports
          .mul(new anchor.BN(Math.round(royaltyFraction * 10000)))
          .div(new anchor.BN(10000));

        if (totalRoyaltyLamports.gt(new anchor.BN(0))) {
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

      const buyInstruction = await program.methods
        .buyNft()
        .accounts({
          buyer: publicKey,
          seller: sellerPublicKey,
          mint: mintPublicKey,
          buyerTokenAccount: buyerTokenAccount,
          escrowAta: escrowAta,
          listingAccount: listingPda,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        })
        .remainingAccounts(remainingAccounts)
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

      toast.success(`Successfully bought ${nft.name}!`, { id: "buy-nft" });
      setSuccessfulTxNftName(nft.name);
      setIsDelistAnimation(false);
      setShowSuccessAnimation(true);
      fetchListedNfts();

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

  const handleAnimationComplete = (definition) => {
    if (definition === "exit") {
      console.log("Success/Delist animation exited.");
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 to-black text-white flex justify-center items-center">
        <p className="text-xl md:text-2xl font-semibold animate-pulse">Loading live listings...</p>
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
          onClick={fetchListedNfts}
          className="mt-8 px-8 py-3 bg-gradient-to-r from-red-600 to-orange-600 text-white font-semibold rounded-full shadow-lg hover:shadow-xl transform hover:scale-105 transition-all duration-300"
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
        className="text-4xl md:text-5xl font-extrabold mb-10 text-center text-transparent bg-clip-text bg-gradient-to-r from-purple-400 via-pink-500 to-red-500"
      >
        NFTs Live for Sale
      </motion.h1>

      <AnimatePresence mode="wait">
        {listedNfts.length > 0 ? (
          <motion.div
            key="nft-grid"
            className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-8"
            variants={containerVariants}
            initial="hidden"
            animate="visible"
            exit="hidden"
          >
            {listedNfts.map((nft) => (
              <motion.div
                key={nft.mintAddress}
                className="bg-gray-800 rounded-lg shadow-xl cursor-pointer hover:scale-105 transform transition-all duration-300 overflow-hidden group border border-gray-700 hover:border-purple-600 relative"
                variants={cardVariants}
                onClick={() => {
                  setSelectedNft(nft);
                  setIsModalOpen(true);
                }}
              >
                {/* Image Section */}
                <div className="relative w-full h-48 bg-gray-700 flex items-center justify-center overflow-hidden">
                  {nft.image ? (
                    <img
                      src={nft.image}
                      alt={nft.name}
                      className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-110"
                    />
                  ) : (
                    <div className="text-gray-400 text-center p-4">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-16 w-16 mx-auto mb-2 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L20 20m-6-6l-2-2m2-2l2-2M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                      No Image Available
                    </div>
                  )}
                </div>

                {/* Content Section */}
                <div className="p-4 bg-gray-850"> {/* Slightly darker background for content area */}
                  <h3 className="text-xl font-bold text-white truncate mb-1">
                    {nft.name}
                  </h3>
                  <p className="text-gray-400 text-sm truncate mb-2">{nft.symbol}</p>

                  <div className="flex items-center justify-between mt-3">
                    <p className="text-2xl font-extrabold text-purple-400">
                      {nft.sellPrice} SOL
                    </p>
                    <span className="text-gray-500 text-xs font-mono ml-2">
                      {nft.mintAddress.substring(0, 4)}...{nft.mintAddress.slice(-4)}
                    </span>
                  </div>

                  {/* Conditional Rendering for Buttons */}
                  {connected && publicKey && nft.seller === publicKey.toBase58() ? (
                    <motion.button
                      whileHover={{ scale: 1.03, boxShadow: "0 0 15px rgba(255, 0, 100, 0.6)" }}
                      whileTap={{ scale: 0.97 }}
                      onClick={(e) => { e.stopPropagation(); handleDelist(nft); }}
                      className="mt-5 w-full bg-gradient-to-r from-purple-700 via-pink-600 to-red-500 text-white font-bold py-2.5 rounded-lg transition-all duration-300 text-lg shadow-lg hover:shadow-2xl active:shadow-md transform hover:-translate-y-0.5"
                    >
                      Delist
                    </motion.button>
                  ) : connected && publicKey ? (
                    <motion.button
                      whileHover={{ scale: 1.03, boxShadow: "0 0 15px rgba(0, 200, 255, 0.6)" }}
                      whileTap={{ scale: 0.97 }}
                      onClick={(e) => { e.stopPropagation(); handleBuy(nft); }}
                      className="mt-5 w-full bg-gradient-to-r from-blue-600 via-teal-500 to-green-500 text-white font-bold py-2.5 rounded-lg transition-all duration-300 text-lg shadow-lg hover:shadow-2xl active:shadow-md transform hover:-translate-y-0.5"
                    >
                      Buy Now
                    </motion.button>
                  ) : (
                    <p className="mt-5 text-center text-gray-400 text-sm">
                      Connect wallet to buy
                    </p>
                  )}
                </div>
              </motion.div>
            ))}
          </motion.div>
        ) : (
          <motion.div
            key="no-nfts-message"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.5 }}
            className="flex flex-col items-center justify-center min-h-[calc(100vh-200px)] text-center p-4"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-24 w-24 text-gray-600 mb-6 animate-bounce" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.007 12.007 0 002 12c0 2.978 1.83 5.513 4.456 6.892l-.044.02C8.75 20.844 10.42 22 12 22c1.474 0 2.87-1.096 4.095-2.731C17.925 18.257 20 15.178 20 12a12.007 12.007 0 00-2.382-7.984z" />
            </svg>
            <h2 className="text-4xl md:text-5xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 to-pink-500 mb-4">
              No NFTs Listed for Sale Yet!
            </h2>
            <p className="text-center text-lg text-gray-400 mt-2 max-w-xl">
              Be the first to list an NFT from your collection and see it appear here live on the marketplace.
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
            className="fixed inset-0 bg-black bg-opacity-80 backdrop-blur-xl flex flex-col items-center justify-center z-50 p-8"
            variants={successOverlayVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            onAnimationComplete={handleAnimationComplete}
          >
            <motion.div className="text-center">
              <motion.p
                variants={successEmojiVariants}
                className="text-8xl md:text-9xl mb-8 drop-shadow-lg"
              >
                {isDelistAnimation ? "👋" : "🎉"}
              </motion.p>
              <motion.h2
                variants={successContentVariants}
                className={`text-5xl md:text-7xl font-extrabold text-transparent bg-clip-text mb-4 ${
                  isDelistAnimation
                    ? "bg-gradient-to-r from-red-500 via-orange-500 to-yellow-400"
                    : "bg-gradient-to-r from-green-400 via-blue-500 to-purple-400"
                } drop-shadow-md`}
              >
                {isDelistAnimation
                  ? `${successfulTxNftName} Delisted!`
                  : `${successfulTxNftName} Purchased!`}
              </motion.h2>
              <motion.p
                variants={successContentVariants}
                className="text-xl md:text-2xl text-gray-200 mt-4"
              >
                {isDelistAnimation
                  ? "Your NFT has been successfully returned to your wallet."
                  : "Congratulations on your new acquisition! Check your wallet for the NFT."}
              </motion.p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Custom Scrollbar Styling */}
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