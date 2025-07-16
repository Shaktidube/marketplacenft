// LiveSell.jsx
import React, { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import * as anchor from "@coral-xyz/anchor";
import {
  PublicKey,
  Transaction,
  SystemProgram,
} from "@solana/web3.js";
import idl from "../idl/marketplacenft.json";
import toast from "react-hot-toast";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import {
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountInstruction,
  getAssociatedTokenAddress,
} from "@solana/spl-token";
import {
  PROGRAM_ID as TOKEN_METADATA_PROGRAM_ID,
  Metadata,
} from "@metaplex-foundation/mpl-token-metadata";


const METADATA_PROGRAM_ID = new PublicKey(
  "metaqbxxUerdq28cj1RbTFW3DvdbRrVfadqotrsmoBH"
);

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
  const [listedNfts, setListedNfts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showSuccessAnimation, setShowSuccessAnimation] = useState(false);
  const [successfulTxNftName, setSuccessfulTxNftName] = useState("");
  const [isDelistAnimation, setIsDelistAnimation] = useState(false);

  const { connection } = useConnection();
  const { publicKey, wallet, connected } = useWallet();

  useEffect(() => {
    const storedListedNfts = localStorage.getItem("listedNftsForSale");
    if (storedListedNfts) {
      try {
        setListedNfts(JSON.parse(storedListedNfts));
      } catch (e) {
        console.error("Failed to parse listed NFTs from localStorage", e);
        setListedNfts([]);
      }
    }
    setLoading(false);
  }, []);

  // NEW: useEffect to automatically dismiss the animation after a set time
  useEffect(() => {
    let timer;
    if (showSuccessAnimation) {
      // Set a timer to hide the animation after 3 seconds (adjust as needed)
      timer = setTimeout(() => {
        setShowSuccessAnimation(false);
        console.log("Animation timer triggered: setShowSuccessAnimation(false)");
      }, 2500); // Display for 3 seconds
    }
    return () => {
      // Cleanup the timer if the component unmounts or state changes
      if (timer) {
        clearTimeout(timer);
      }
    };
  }, [showSuccessAnimation]); // Re-run this effect when showSuccessAnimation changes

  const handleDelist = async (nftToDelist) => {
    if (!connected || !publicKey) {
      toast.error("Wallet not connected to delist NFT.");
      return;
    }

    if (publicKey.toBase58() !== nftToDelist.seller) {
      toast.error("You are not the seller of this NFT. Cannot delist.");
      return;
    }

    toast.loading("Delisting NFT...", { id: "delist-nft" });

    try {
      const provider = new anchor.AnchorProvider(
        connection,
        wallet.adapter,
        anchor.AnchorProvider.defaultOptions()
      );

      anchor.setProvider(provider);
      const program = new anchor.Program(idl, provider);

      const mintPublicKey = new PublicKey(nftToDelist.mintAddress);

      const [listingPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("listing"), mintPublicKey.toBuffer()],
        program.programId
      );

      const escrowAta = await getAssociatedTokenAddress(
        mintPublicKey,
        listingPda,
        true
      );

      const sellerTokenAccount = await getAssociatedTokenAddress(
        mintPublicKey,
        publicKey
      );

      const cancelListing = await program.methods
        .cancelListing()
        .accounts({
          seller: publicKey,
          mint: mintPublicKey,
          sellerTokenAccount: sellerTokenAccount,
          escrowAta: escrowAta,
          listingPda: listingPda,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        })
        .instruction();

      const tx = new Transaction();
      tx.add(cancelListing);

      const confirmTx = await provider.sendAndConfirm(tx, []);
      console.log("delist successfully :  ", confirmTx);

      const updatedListedNfts = listedNfts.filter(
        (nft) => nft.mintAddress !== nftToDelist.mintAddress
      );
      setListedNfts(updatedListedNfts);
      localStorage.setItem(
        "listedNftsForSale",
        JSON.stringify(updatedListedNfts)
      );
      toast.success("NFT delisted successfully!", { id: "delist-nft" });

      setSuccessfulTxNftName(nftToDelist.name);
      setIsDelistAnimation(true);
      setShowSuccessAnimation(true); // Triggers the animation to appear
      console.log("Delist animation triggered for:", nftToDelist.name);
    } catch (error) {
      console.error("Error delisting NFT:", error);
      let errorMessage = `Failed to delist NFT. Error: ${
        error.message || "Unknown error"
      }`;

      if (error.logs) {
        console.error("Transaction logs:", error.logs);
        const programLog = error.logs.find((log) =>
          log.includes("Program log: AnchorError")
        );
        if (programLog) {
          errorMessage = programLog.split("Error Message: ")[1] || errorMessage;
          if (errorMessage.includes("AccountNotInitialized")) {
            errorMessage =
              "Delist failed: Listing not found on-chain. Did it fail to list initially or was it already delisted?";
          }
        } else {
          errorMessage = `Delist failed: Simulation failed. Logs: ${error.logs.join(
            "\n"
          )}`;
        }
      }
      toast.error(errorMessage, { id: "delist-nft", duration: 6000 });
    } finally {
      toast.dismiss("delist-nft");
    }
  };

  const handleBuy = async (nft) => {
    if (!connected || !publicKey) {
      toast.error("Please connect your wallet to buy this NFT.");
      return;
    }
    if (publicKey.toBase58() === nft.seller) {
      toast.error("You cannot buy your own NFT!");
      console.log("You cannot buy your own NFTs.");
      return;
    }

    toast.loading(`Buying ${nft.name} for ${nft.sellPrice} SOL...`, {
      id: "buy-nft",
    });
    try {
      const provider = new anchor.AnchorProvider(
        connection,
        wallet.adapter,
        anchor.AnchorProvider.defaultOptions()
      );
      anchor.setProvider(provider);
      const program = new anchor.Program(idl, provider);

      const mintPublicKey = new PublicKey(nft.mintAddress);
      const sellerPublicKey = new PublicKey(nft.seller);

      const [listingPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("listing"), mintPublicKey.toBuffer()],
        program.programId
      );

      const listingAccount = await program.account.listing.fetch(listingPda);
      const priceInLamports = listingAccount.price;

      const escrowAta = await getAssociatedTokenAddress(
        mintPublicKey,
        listingPda,
        true
      );

      const buyerTokenAccount = await getAssociatedTokenAddress(
        mintPublicKey,
        publicKey
      );

      let remainingAccounts = [];
      let totalRoyaltyLamports = new anchor.BN(0);
      let totalBasisPoints = 0;

      const [metadataPda] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("metadata"),
          METADATA_PROGRAM_ID.toBuffer(),
          mintPublicKey.toBuffer(),
        ],
        METADATA_PROGRAM_ID
      );

      try {
        const metadataAccountInfo = await connection.getAccountInfo(
          metadataPda
        );
        if (metadataAccountInfo) {
          const metadata = Metadata.fromAccountInfo(metadataAccountInfo)[0];
          if (metadata.data.creators && metadata.data.creators.length > 0) {
            totalBasisPoints = metadata.data.sellerFeeBasisPoints;

            if (totalBasisPoints > 0) {
              const royaltyFraction = totalBasisPoints / 10000;
              totalRoyaltyLamports = priceInLamports
                .mul(new anchor.BN(Math.round(royaltyFraction * 10000)))
                .div(new anchor.BN(10000));

              metadata.data.creators.forEach((creator) => {
                if (creator.share > 0) {
                  const creatorRoyaltyLamports = totalRoyaltyLamports
                    .mul(new anchor.BN(creator.share))
                    .div(new anchor.BN(100));
                  if (creatorRoyaltyLamports.gt(new anchor.BN(0))) {
                    remainingAccounts.push({
                      pubkey: new PublicKey(creator.address),
                      isWritable: true,
                      isSigner: false,
                    });
                  }
                }
              });
            }
          }
        }
      } catch (metadataError) {
        console.warn(
          "Could not fetch NFT metadata or creators. Skipping royalty calculation.",
          metadataError
        );
      }

      const transaction = new Transaction();

      const buyerAtaInfo = await connection.getAccountInfo(buyerTokenAccount);
      if (!buyerAtaInfo) {
        const createBuyerAtaInstruction =
          createAssociatedTokenAccountInstruction(
            publicKey,
            buyerTokenAccount,
            publicKey,
            mintPublicKey,
            TOKEN_PROGRAM_ID,
            ASSOCIATED_TOKEN_PROGRAM_ID
          );
        transaction.add(createBuyerAtaInstruction);
      }

      if (totalBasisPoints > 0) {
        let currentBuyerSolBalance = await connection.getBalance(publicKey);
        let totalAmountToSend = priceInLamports.toNumber();

        metadata.data.creators.forEach((creator) => {
          if (creator.share > 0) {
            const creatorRoyaltyLamports = totalRoyaltyLamports
              .mul(new anchor.BN(creator.share))
              .div(new anchor.BN(100));
            if (creatorRoyaltyLamports.gt(new anchor.BN(0))) {
              totalAmountToSend += creatorRoyaltyLamports.toNumber();
              if (currentBuyerSolBalance < totalAmountToSend) {
                throw new Error(
                  `Insufficient SOL balance to cover royalties and purchase. Required: ${
                    totalAmountToSend / anchor.web3.LAMPORTS_PER_SOL
                  } SOL.`
                );
              }
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

      const buyNft = await program.methods
        .buyNft()
        .accounts({
          buyer: publicKey,
          seller: sellerPublicKey,
          mint: mintPublicKey,
          escrowAta: escrowAta,
          buyerTokenAccount: buyerTokenAccount,
          listingPda: listingPda,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        })
        .remainingAccounts(remainingAccounts)
        .instruction();

      transaction.add(buyNft);

      const { blockhash, lastValidBlockHeight } =
        await connection.getLatestBlockhash();
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = publicKey;

      const signedTransaction = await wallet.adapter.signTransaction(
        transaction
      );

      const txSignature = await connection.sendRawTransaction(
        signedTransaction.serialize(),
        {
          skipPreflight: false,
          maxRetries: 3,
        }
      );

      const confirmation = await connection.confirmTransaction(
        {
          signature: txSignature,
          blockhash: blockhash,
          lastValidBlockHeight: lastValidBlockHeight,
        },
        "confirmed"
      );

      if (confirmation.value.err) {
        throw new Error(
          `Transaction failed: ${JSON.stringify(confirmation.value.err)}`
        );
      }

      const updatedListedNfts = listedNfts.filter(
        (item) => item.mintAddress !== nft.mintAddress
      );
      setListedNfts(updatedListedNfts);
      localStorage.setItem(
        "listedNftsForSale",
        JSON.stringify(updatedListedNfts)
      );
      toast.success(`Successfully bought ${nft.name}!`, { id: "buy-nft" });

      setSuccessfulTxNftName(nft.name);
      setIsDelistAnimation(false);
      setShowSuccessAnimation(true); // Triggers the animation to appear
      console.log("Buy animation triggered for:", nft.name);
    } catch (error) {
      console.error("Error buying NFT:", error);
      let errorMessage = `Failed to buy NFT. Error: ${
        error.message || "Unknown error"
      }`;
      if (error.logs) {
        console.error("Transaction logs:", error.logs);
        const programLog = error.logs.find((log) =>
          log.includes("Program log: AnchorError")
        );
        if (programLog) {
          errorMessage = programLog.split("Error Message: ")[1] || errorMessage;
          if (
            errorMessage.includes("AccountNotInitialized") ||
            errorMessage.includes("AccountNotMutable")
          ) {
            errorMessage =
              "Action failed: NFT listing might not exist or state is incorrect. Try refreshing.";
          }
        } else {
          errorMessage = `Action failed: Simulation failed. Logs: ${error.logs.join(
            "\n"
          )}`;
        }
      }
      toast.error(errorMessage, { id: "buy-nft", duration: 6000 });
    } finally {
      toast.dismiss("buy-nft");
    }
  };

  // The onAnimationComplete only resets specific state, not the trigger to hide.
  // It ensures the internal elements have finished their exit animations.
  const handleAnimationComplete = (definition) => {
    // We actually only need this if we want to do something *after* the exit animation
    // has completed, but before the component is fully unmounted by AnimatePresence.
    // In this case, our useEffect handles the primary dismissal.
    // This function can be simplified or even removed if not needed for other cleanup.
    if (definition === "exit") {
      // Potentially useful for final cleanup after the exit visual completes
      // e.g., setSuccessfulTxNftName('') if not already handled by useEffect.
      // But the main setShowSuccessAnimation(false) comes from the useEffect timer.
      console.log("Animation exit phase complete.");
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 to-black text-white flex justify-center items-center">
        <p>Loading listed NFTs...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 to-black text-white p-8 custom-scrollbar-hidden">
      <motion.h1
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="text-4xl md:text-5xl font-extrabold mb-10 text-center text-transparent bg-clip-text bg-gradient-to-r from-red-400 to-purple-600"
      >
        NFTs Live for Sale
      </motion.h1>

      <AnimatePresence>
        {listedNfts.length > 0 ? (
          <motion.div
            className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-8"
            variants={containerVariants}
            initial="hidden"
            animate="visible"
          >
            {listedNfts.map((nft) => (
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
                  <h3 className="text-xl font-bold text-white truncate">
                    {nft.name}
                  </h3>
                  <p className="text-gray-400 text-sm truncate">{nft.symbol}</p>
                  <p className="text-lg font-semibold text-purple-400 mt-2">
                    Price: {nft.sellPrice} SOL
                  </p>
                  <p className="text-gray-500 text-xs mt-1 break-all">
                    {nft.mintAddress}
                  </p>

                  {/* Conditional Rendering for Buttons */}
                  {connected &&
                  publicKey &&
                  nft.seller === publicKey.toBase58() ? (
                    <motion.button
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => handleDelist(nft)}
                      className="mt-4 w-full bg-gradient-to-r from-red-500 to-purple-900 hover:from-purple-900 hover:to-pink-600 text-white font-bold py-2 rounded-md transition-all duration-200 text-base shadow-md hover:shadow-lg"
                    >
                      Delist
                    </motion.button>
                  ) : connected && publicKey ? (
                    <motion.button
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => handleBuy(nft)}
                      className="mt-4 w-full bg-gradient-to-r from-green-500 to-blue-500 hover:from-green-600 hover:to-blue-600 text-white font-bold py-2 rounded-md transition-all duration-200 text-base shadow-md hover:shadow-lg"
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
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5 }}
            className="flex flex-col items-center justify-center min-h-[calc(100vh-200px)]"
          >
            <h2 className="text-4xl md:text-5xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 to-pink-500 mb-8 text-center">
              No NFTs Listed for Sale Yet!
            </h2>
            <p className="text-center text-lg text-gray-400 mt-4 max-w-xl">
              List your NFTs from your collection to see them here.
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Full-Screen Success/Delist Animation - MOVED OUTSIDE CONDITIONAL RENDERING */}
      <AnimatePresence>
        {showSuccessAnimation && (
          <motion.div
            key="success-animation-overlay"
            className="fixed inset-0 bg-transparent bg-opacity-75 backdrop-blur-lg  flex flex-col items-center justify-center z-50 p-8"
            variants={successOverlayVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            onAnimationComplete={handleAnimationComplete} // This will be called when 'visible' and 'exit' animations complete
          >
            <motion.div className="text-center">
              <motion.p
                variants={successEmojiVariants}
                initial="hidden"
                animate="visible"
                exit="exit"
                className="text-8xl md:text-9xl mb-8"
              >
                {isDelistAnimation ? "👋" : "🎉"}
              </motion.p>
              <motion.h2
                variants={successContentVariants}
                initial="hidden"
                animate="visible"
                exit="exit"
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
                initial="hidden"
                animate="visible"
                exit="exit"
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