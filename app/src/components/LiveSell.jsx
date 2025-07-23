// LiveSell.jsx
import React, { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import * as anchor from "@coral-xyz/anchor";
import {
  PublicKey,
  Transaction,
  SystemProgram,
  SYSVAR_RENT_PUBKEY,
} from "@solana/web3.js";
import toast from "react-hot-toast";
import { useWallet } from "@solana/wallet-adapter-react";
import {
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountInstruction,
  getAssociatedTokenAddress,
} from "@solana/spl-token";
import { fetchDigitalAsset } from "@metaplex-foundation/mpl-token-metadata";
import { toWeb3JsPublicKey } from '@metaplex-foundation/umi-web3js-adapters';

import { useSolanaProgram } from "../contexts/SolanaProgramContext";

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

// --- NftDetailModal Component (Moved here for easier access to transformIpfsUrl if needed) ---
const NftDetailModal = ({ isOpen, onClose, nft }) => {
  if (!isOpen || !nft) return null;

  const handleCopyMintAddress = () => {
    navigator.clipboard.writeText(nft.mintAddress)
      .then(() => {
        toast.success("Mint address copied to clipboard!");
      })
      .catch((err) => {
        console.error("Failed to copy mint address:", err);
        toast.error("Failed to copy mint address.");
      });
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="fixed inset-0 bg-black bg-opacity-80 backdrop-blur-sm flex justify-center items-center z-50 p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <motion.div
            className="bg-gray-800 rounded-xl shadow-2xl border border-purple-600 text-white w-full max-w-4xl max-h-[90vh] flex flex-col md:flex-row overflow-hidden relative"
            initial={{ scale: 0.9, y: 50 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.9, y: 50 }}
            transition={{ type: "spring", stiffness: 200, damping: 20 }}
          >
            {/* Decorative background elements */}
            <div className="absolute top-0 left-1/4 -translate-x-1/2 -translate-y-1/2 w-64 h-64 bg-purple-500 rounded-full opacity-15 blur-2xl"></div>
            <div className="absolute bottom-0 right-1/4 translate-x-1/2 translate-y-1/2 w-52 h-52 bg-blue-500 rounded-full opacity-10 blur-2xl"></div>

            {/* NFT Image Section (Left Half) */}
            <div className="w-full md:w-1/2 p-6 flex items-center justify-center bg-gray-900 relative z-10">
              {nft.image ? (
                <img
                  src={nft.image}
                  alt={nft.name}
                  className="max-w-full max-h-full object-contain rounded-lg shadow-lg border border-gray-700"
                />
              ) : (
                <div className="w-full h-full bg-gray-700 rounded-lg flex items-center justify-center text-gray-400 text-xl font-semibold">
                  No Image
                </div>
              )}
            </div>

            {/* NFT Details Section (Right Half) */}
            <div className="w-full md:w-1/2 p-6 flex flex-col relative z-10 overflow-y-auto custom-scrollbar">
              <h2 className="text-4xl font-extrabold mb-4 text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-purple-400 break-words">
                {nft.name}
              </h2>
              <p className="text-gray-300 text-xl font-semibold mb-2">Symbol: <span className="text-teal-300">{nft.symbol || 'N/A'}</span></p>
              
              <div className="bg-gray-700/50 rounded-lg p-4 mb-4 flex-grow">
                <h3 className="text-gray-200 text-lg font-bold mb-2">Description:</h3>
                <p className="text-gray-400 text-base leading-relaxed overflow-y-auto max-h-36 custom-scrollbar">
                  {nft.description || 'No description available for this NFT.'}
                </p>
              </div>

              <div className="mb-6">
                <p className="text-gray-300 text-sm font-semibold mb-2">Mint Address:</p>
                <div className="flex items-center bg-gray-700 rounded-md p-2">
                  <span className="font-mono text-gray-400 text-sm break-all flex-grow">
                    {nft.mintAddress}
                  </span>
                  <motion.button
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.9 }}
                    onClick={handleCopyMintAddress}
                    className="ml-3 p-2 bg-blue-600 rounded-full text-white text-xs shadow-md hover:bg-blue-700 transition-colors duration-200"
                    aria-label="Copy Mint Address"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 0 012 2m0 0h2a2 0 012 2v3m-7 10h7l-3-3m0 6l3-3" />
                    </svg>
                  </motion.button>
                </div>
              </div>

              <div className="mt-auto flex justify-end">
                <button
                  onClick={onClose}
                  className="px-6 py-2 bg-gradient-to-r from-red-600 to-rose-700 text-white font-bold rounded-md shadow-lg hover:from-red-700 hover:to-rose-800 transition-all duration-300"
                >
                  Close
                </button>
              </div>
            </div>
          </motion.div>
          {/* Custom Scrollbar for Description */}
          <style jsx>{`
            .custom-scrollbar::-webkit-scrollbar {
              width: 8px;
            }
            .custom-scrollbar::-webkit-scrollbar-track {
              background: rgba(0, 0, 0, 0.1);
              border-radius: 10px;
            }
            .custom-scrollbar::-webkit-scrollbar-thumb {
              background-color: #5b21b6; /* purple-700 */
              border-radius: 10px;
              border: 2px solid rgba(0, 0, 0, 0);
            }
            .custom-scrollbar {
              scrollbar-width: thin; /* For Firefox */
              scrollbar-color: #5b21b6 rgba(0, 0, 0, 0.1); /* For Firefox */
            }
          `}</style>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
// --- End NftDetailModal Component ---


function LiveSell() {
  const { program, provider, umi, connection, connected, publicKey } = useSolanaProgram();
  const { wallet } = useWallet();

  const [listedNfts, setListedNfts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showSuccessAnimation, setShowSuccessAnimation] = useState(false);
  const [successfulTxNftName, setSuccessfulTxNftName] = useState("");
  const [isDelistAnimation, setIsDelistAnimation] = useState(false);

  const [selectedNft, setSelectedNft] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Helper function for IPFS URL transformation
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
  }, []);

  // Function to fetch active sales from the program
  const fetchActiveSales = useCallback(async () => {
    if (!program || !umi || !connection) return [];
    setLoading(true);
    toast.loading("Fetching live listings from blockchain...", { id: "fetch-listings" });
    try {
      // Fetch all listing accounts
      const allListingAccounts = await program.account.listing.all();

      const activeSalesPromises = allListingAccounts.map(async (account) => {
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

        // Extract creators for royalty calculation if available in metadata
        const creators = (asset.metadata.creators || []).map(creator => ({
            address: toWeb3JsPublicKey(creator.address).toBase58(),
            share: creator.share,
            verified: creator.verified,
        }));
        const sellerFeeBasisPoints = asset.metadata.sellerFeeBasisPoints;

        return {
          mintAddress,
          name: asset.metadata.name,
          symbol: asset.metadata.symbol,
          image: imageUrl,
          description,
          seller,
          sellPrice: price,
          creators, // Pass creators and sellerFeeBasisPoints
          sellerFeeBasisPoints,
        };
      });
      const fetchedNfts = (await Promise.all(activeSalesPromises)).filter(Boolean);
      setListedNfts(fetchedNfts);
      toast.success(`Successfully loaded ${fetchedNfts.length} live listings.`, { id: "fetch-listings" });
      return fetchedNfts;
    } catch (err) {
      console.error("Error fetching active sales from program:", err);
      toast.error("Failed to load active sales from the blockchain. Please refresh.", { id: "fetch-listings" });
      return [];
    } finally {
      setLoading(false);
    }
  }, [program, umi, connection, transformIpfsUrl]);

  // Initial fetch on component mount
  useEffect(() => {
    fetchActiveSales();
  }, [fetchActiveSales]);

  // NEW: useEffect to automatically dismiss the animation after a set time
  useEffect(() => {
    let timer;
    if (showSuccessAnimation) {
      timer = setTimeout(() => {
        setShowSuccessAnimation(false);
        setSuccessfulTxNftName(""); // Clear name after animation
        setIsDelistAnimation(false); // Reset animation type
      }, 2500);
    }
    return () => {
      if (timer) {
        clearTimeout(timer);
      }
    };
  }, [showSuccessAnimation]);

  const handleDelist = useCallback(async (nftToDelist) => {
    if (!connected || !publicKey || !program || !provider) {
      toast.error("Wallet not connected or program not initialized.");
      return;
    }

    if (publicKey.toBase58() !== nftToDelist.seller) {
      toast.error("You are not the seller of this NFT. Cannot delist.");
      return;
    }

    toast.loading(`Delisting ${nftToDelist.name}...`, { id: "delist-nft" });

    try {
      const mintPublicKey = new PublicKey(nftToDelist.mintAddress);

      // Derive the PDA for the listing account
      const [listingPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("listing"), mintPublicKey.toBuffer()],
        program.programId
      );

      // Derive the Associated Token Account for the listing PDA (escrow ATA)
      const escrowAta = await getAssociatedTokenAddress(
        mintPublicKey,
        listingPda, // Owner is the PDA itself
        true // allow owner off curve
      );

      const sellerTokenAccount = await getAssociatedTokenAddress(
        mintPublicKey,
        publicKey
      );

      const instruction = await program.methods
        .cancelListing()
        .accounts({
          seller: publicKey,
          mint: mintPublicKey,
          sellerTokenAccount: sellerTokenAccount,
          escrowAta: escrowAta,
          listingAccount: listingPda, // The listing account PDA
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
          rent: SYSVAR_RENT_PUBKEY, // Add rent sysvar
        })
        .instruction();

      const transaction = new Transaction();
      transaction.add(instruction);

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
      
      // Refresh the listed NFTs after successful delist
      fetchActiveSales();

    } catch (error) {
      console.error("Error delisting NFT:", error);
      let errorMessage = `Failed to delist NFT. Error: ${error.message || "Unknown error"}`;

      if (error.logs) {
        const programLog = error.logs.find((log) =>
          log.includes("Program log: AnchorError")
        );
        if (programLog) {
          errorMessage = programLog.split("Error Message: ")[1] || errorMessage;
          if (errorMessage.includes("AccountNotInitialized")) {
            errorMessage = "Delist failed: Listing not found on-chain. Did it fail to list initially or was it already delisted?";
          }
        }
      } else if (error.message.includes("User rejected the request")) {
          errorMessage = "Transaction cancelled by user.";
      }
      toast.error(errorMessage, { id: "delist-nft", duration: 6000 });
    } finally {
      toast.dismiss("delist-nft");
    }
  }, [connected, publicKey, program, provider, wallet, fetchActiveSales]);

  const handleBuy = useCallback(async (nft) => {
    if (!connected || !publicKey || !program || !provider || !wallet?.adapter) {
      toast.error("Wallet not connected or program not initialized.");
      return;
    }
    if (publicKey.toBase58() === nft.seller) {
      toast.error("You cannot buy your own NFT!");
      return;
    }

    toast.loading(`Buying ${nft.name} for ${nft.sellPrice} SOL...`, {
      id: "buy-nft",
    });
    try {
      const mintPublicKey = new PublicKey(nft.mintAddress);
      const sellerPublicKey = new PublicKey(nft.seller);

      // Derive the PDA for the listing account
      const [listingPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("listing"), mintPublicKey.toBuffer()],
        program.programId
      );

      // Fetch the listing account to get the exact price from the chain
      const listingAccount = await program.account.listing.fetch(listingPda);
      const priceInLamports = listingAccount.price;

      // Derive the Associated Token Account for the listing PDA (escrow ATA)
      const escrowAta = await getAssociatedTokenAddress(
        mintPublicKey,
        listingPda,
        true // allow owner off curve
      );

      const buyerTokenAccount = await getAssociatedTokenAddress(
        mintPublicKey,
        publicKey
      );

      let remainingAccounts = [];

      // Add royalty recipients to remainingAccounts
      if (nft.creators && nft.creators.length > 0 && nft.sellerFeeBasisPoints > 0) {
        const totalRoyaltyLamports = priceInLamports
          .mul(new anchor.BN(nft.sellerFeeBasisPoints))
          .div(new anchor.BN(10000)); // sellerFeeBasisPoints is in 1/100ths of a % (e.g., 500 = 5%)

        nft.creators.forEach((creator) => {
          if (creator.share > 0 && creator.address !== sellerPublicKey.toBase58()) { // Ensure seller doesn't get royalty twice if they're also a creator
            const creatorRoyaltyLamports = totalRoyaltyLamports
              .mul(new anchor.BN(creator.share))
              .div(new anchor.BN(100)); // creator.share is out of 100

            if (creatorRoyaltyLamports.gt(new anchor.BN(0))) {
              remainingAccounts.push({
                pubkey: new PublicKey(creator.address),
                isWritable: true, // Creators receive SOL, so their accounts must be writable
                isSigner: false,
              });
            }
          }
        });
      }

      const transaction = new Transaction();

      // Check if buyer's ATA for this NFT already exists, if not, create instruction
      const buyerAtaInfo = await connection.getAccountInfo(buyerTokenAccount);
      if (!buyerAtaInfo) {
        const createBuyerAtaInstruction =
          createAssociatedTokenAccountInstruction(
            publicKey, // Payer
            buyerTokenAccount, // ATA address
            publicKey, // Owner of the ATA
            mintPublicKey, // Mint of the token
            TOKEN_PROGRAM_ID,
            ASSOCIATED_TOKEN_PROGRAM_ID
          );
        transaction.add(createBuyerAtaInstruction);
      }

      const buyNftInstruction = await program.methods
        .buyNft()
        .accounts({
          buyer: publicKey,
          seller: sellerPublicKey,
          mint: mintPublicKey,
          buyerTokenAccount: buyerTokenAccount,
          escrowAta: escrowAta, // Escrow ATA where NFT is held
          listingAccount: listingPda, // The listing account PDA
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
          rent: SYSVAR_RENT_PUBKEY, // Add rent sysvar
        })
        .remainingAccounts(remainingAccounts) // Add royalty recipients here
        .instruction();

      transaction.add(buyNftInstruction);

      const { blockhash, lastValidBlockHeight } =
        await connection.getLatestBlockhash('finalized');
      transaction.recentBlockhash = blockhash;
      transaction.lastValidBlockHeight = lastValidBlockHeight;
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

      toast.success(`Successfully bought ${nft.name}!`, { id: "buy-nft" });

      setSuccessfulTxNftName(nft.name);
      setIsDelistAnimation(false);
      setShowSuccessAnimation(true);

      // Refresh the listed NFTs after successful purchase
      fetchActiveSales();

    } catch (error) {
      console.error("Error buying NFT:", error);
      let errorMessage = `Failed to buy NFT. Error: ${error.message || "Unknown error"}`;
      if (error.logs) {
        const programLog = error.logs.find((log) =>
          log.includes("Program log: AnchorError")
        );
        if (programLog) {
          errorMessage = programLog.split("Error Message: ")[1] || errorMessage;
          if (errorMessage.includes("AccountNotInitialized") || errorMessage.includes("AccountNotMutable")) {
            errorMessage = "Action failed: NFT listing might not exist or state is incorrect. Try refreshing.";
          }
        }
      } else if (error.message.includes("User rejected the request")) {
          errorMessage = "Transaction cancelled by user.";
      }
      toast.error(errorMessage, { id: "buy-nft", duration: 6000 });
    } finally {
      toast.dismiss("buy-nft");
    }
  }, [connected, publicKey, program, provider, wallet, connection, fetchActiveSales]);

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
        {loading ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5 }}
            className="flex flex-col items-center justify-center min-h-[calc(100vh-200px)]"
          >
            <div className="w-16 h-16 border-4 border-t-4 border-gray-200 border-t-purple-500 rounded-full animate-spin"></div>
            <p className='text-lg text-gray-400 mt-6 animate-pulse'>Fetching live listings...</p>
          </motion.div>
        ) : listedNfts.length > 0 ? (
          <motion.div
            className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-8"
            variants={containerVariants}
            initial="hidden"
            animate="visible"
          >
            {listedNfts.map((nft) => (
              <motion.div
                key={nft.mintAddress}
                className="bg-gray-800 rounded-lg shadow-lg cursor-pointer hover:scale-105 transition-transform"
                variants={{
                  hidden: { opacity: 0, y: 30 },
                  visible: { opacity: 1, y: 0 },
                }}
                onClick={() => {
                  setSelectedNft(nft);
                  setIsModalOpen(true);
                }}
              >
                {nft.image ? (
                  <img
                    src={nft.image}
                    alt={nft.name}
                    className="w-full h-48 object-cover rounded-t-lg"
                  />
                ) : (
                  <div className="w-full h-48 bg-gray-700 rounded-t-lg flex items-center justify-center text-gray-400">
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
                      onClick={(e) => { e.stopPropagation(); handleDelist(nft); }} // Stop propagation to prevent modal from opening
                      className="mt-4 w-full bg-gradient-to-r from-red-500 to-rose-700 hover:from-red-600 hover:to-rose-800 text-white font-bold py-2 rounded-md transition-all duration-200 text-base shadow-md hover:shadow-lg"
                    >
                      Delist
                    </motion.button>
                  ) : connected && publicKey ? (
                    <motion.button
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={(e) => { e.stopPropagation(); handleBuy(nft); }} // Stop propagation
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
            className="fixed inset-0 bg-transparent bg-opacity-75 backdrop-blur-lg  flex flex-col items-center justify-center z-50 p-8"
            variants={successOverlayVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            // onAnimationComplete will handle the dismissal logic, but the useEffect timer is safer
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