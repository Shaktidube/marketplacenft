// LiveSell.jsx
import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import * as anchor from "@coral-xyz/anchor";
import { PublicKey, Transaction } from '@solana/web3.js'; // Import PublicKey directly
import idl from "../idl/marketplacenft.json";
import toast from 'react-hot-toast';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID, createAssociatedTokenAccountInstruction } from '@solana/spl-token';
import { isSigner } from '@metaplex-foundation/umi';


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

function LiveSell() {
  const [listedNfts, setListedNfts] = useState([]);
  const [loading, setLoading] = useState(true);
  const { connection } = useConnection();
  const { publicKey, wallet, connected } = useWallet();

  useEffect(() => {
    const storedListedNfts = localStorage.getItem('listedNftsForSale');
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

  const handleDelist = async (nftToDelist) => { 
    if (!connected || !publicKey) {
      toast.error("Wallet not connected to delist NFT.");
      return;
    }

    // Optional: Add an extra check here to ensure the connected wallet is the seller
    if (publicKey.toBase58() !== nftToDelist.seller) {
      toast.error("You are not the seller of this NFT. Cannot delist.");
      return;
    }

    toast.loading('Delisting NFT...', { id: 'delist-nft' });

    try {
      const provider = new anchor.AnchorProvider(
        connection,
        wallet.adapter,
        anchor.AnchorProvider.defaultOptions()
      );
  
      anchor.setProvider(provider);
      const program = new anchor.Program(idl, provider);
      

      const mintPublicKey = new PublicKey(nftToDelist.mintAddress);

      const sellerTokenAccount = anchor.utils.token.associatedAddress({
        mint: mintPublicKey,
        owner: publicKey,
      });

      console.log("Delist - Seller: ", publicKey.toBase58());
      console.log("Delist - Mint: ", mintPublicKey.toBase58());
      console.log("Delist - Seller Token Account: ", sellerTokenAccount.toBase58());


      const cancelListing = await program.methods.cancelListing().accounts({
        seller: publicKey,
        mint: mintPublicKey,
        sellerTokenAccount: sellerTokenAccount,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: anchor.web3.SystemProgram.programId,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      }).instruction();

      const tx = new Transaction();
      tx.add(cancelListing);

      const confirmTx = await provider.sendAndConfirm(tx,[]);
      console.log("delist successfully :  ", confirmTx);


      console.log("Transaction successful, signature:", tx);

      // Update localStorage and UI ONLY AFTER successful blockchain transaction
      const updatedListedNfts = listedNfts.filter(nft => nft.mintAddress !== nftToDelist.mintAddress);
      setListedNfts(updatedListedNfts);
      localStorage.setItem('listedNftsForSale', JSON.stringify(updatedListedNfts));
      toast.success('NFT delisted successfully!', { id: 'delist-nft' });
      
    } catch (error) {
      console.error("Error delisting NFT:", error);
      let errorMessage = `Failed to delist NFT. Error: ${error.message || 'Unknown error'}`;

      if (error.logs) {
          console.error("Transaction logs:", error.logs);
          const programLog = error.logs.find(log => log.includes("Program log: AnchorError"));
          if (programLog) {
              errorMessage = programLog.split("Error Message: ")[1] || errorMessage;
              if (errorMessage.includes("AccountNotInitialized")) {
                  errorMessage = "Delist failed: Listing not found on-chain. Did it fail to list initially?";
              }
          } else {
              errorMessage = `Delist failed: Simulation failed. Logs: ${error.logs.join('\n')}`;
          }
      }
      toast.error(errorMessage, { id: 'delist-nft', duration: 6000 });

    } finally {
      toast.dismiss('delist-nft');
    }
  };

  const handleBuy = async (nft) => {
    if (!connected || !publicKey) {
      toast.error("Please connect your wallet to buy this NFT.");
      return;
    }
    if (publicKey.toBase58() === nft.seller) {
      toast.error("You cannot buy your own NFT!");
      console.log("you canot buy your own nfts");
      return;
    }

    toast.loading(`Buying ${nft.name} for ${nft.sellPrice} SOL...`, { id: 'buy-nft' });
    try {
    
      const provider = new anchor.AnchorProvider(
        connection,
        wallet.adapter,
        anchor.AnchorProvider.defaultOptions()
      );
      anchor.setProvider(provider);
      const program = new anchor.Program(idl, provider);

      console.log("program : ",program);
    
      const mintPublicKey = new PublicKey(nft.mintAddress);
      console.log(" mint pub key : ", nft.mintAddress);

      console.log("seeler pub key : ", nft.seller);

      // const [listingPda] = PublicKey.findProgramAddressSync(
      //   [anchor.utils.bytes.utf8.encode("listing"), mintPublicKey.toBuffer()],
      //   programId
      // );

      // const programNftAccount = anchor.utils.token.associatedAddress({
      //   mint: mintPublicKey,
      //   owner: listingPda, // The current holder of the NFT
      // });

      const buyerTokenAccount = anchor.utils.token.associatedAddress({
        mint: mintPublicKey,
        owner: publicKey, // The buyer's destination ATA
      });
      let instructions = [];

      const accountInfo = await connection.getAccountInfo(buyerTokenAccount);
      if (!accountInfo) {
          // If ATA does not exist, create the instruction to make it
          instructions.push(
              createAssociatedTokenAccountInstruction(
                  publicKey, // Payer
                  buyerTokenAccount, // ATA account
                  publicKey, // Owner of ATA
                  mintPublicKey, // Mint of the token
              )
          );
      }

      // You would also need the seller's main wallet account to receive SOL,
      // and potentially the system_program if transferring SOL directly.
      // Check your IDL for `buyListing` or similar instruction.

      console.log("....");

      let remainingAccounts= [];


      const buyNft = await program.methods.buyNft()
        .accounts({
          buyer: wallet.adapter.publicKey, // The buyer
          seller: new PublicKey(nft.seller), // The original seller of the NFT
          mint: mintPublicKey,
          buyerTokenAccount:buyerTokenAccount,
          tokenProgram: TOKEN_PROGRAM_ID, 
        })
        .remainingAccounts(remainingAccounts)
        .instruction();

        instructions.push(buyNft);

        const transaction =  new Transaction().add(...instructions);
        const tx = provider.sendAndConfirm(transaction , []);
        console.log(" t x: ",tx);
      
      console.log("Buy transaction successful:", tx);


      // For now, simulate success:
      await new Promise(resolve => setTimeout(resolve, 2000));
      // Remove from localStorage after successful blockchain transaction
      const updatedListedNfts = listedNfts.filter(nft => nft.mintAddress !== nft.mintAddress);
      setListedNfts(updatedListedNfts);
      localStorage.setItem('listedNftsForSale', JSON.stringify(updatedListedNfts));
      toast.success(`Successfully bought ${nft.name}!`, { id: 'buy-nft' });
    } catch (error) {
      console.error("Error buying NFT:", error);
      let errorMessage = `Failed to buy NFT. Error: ${error.message || 'Unknown error'}`;
      if (error.logs) {
          console.error("Transaction logs:", error.logs);
          errorMessage = `Buy failed: Simulation failed. Logs: ${error.logs.join('\n')}`;
      }
      toast.error(errorMessage, { id: 'buy-nft', duration: 6000 });
    } finally {
      toast.dismiss('buy-nft');
    }
  };


  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br text-white flex justify-center items-center">
        <p>Loading listed NFTs...</p>
      </div>
    );
  }

  if (listedNfts.length === 0) {
    return (
      <div className='min-h-screen bg-gradient-to-br text-white flex flex-col items-center justify-center p-8 custom-scrollbar-hidden'>
        <h1 className='text-4xl md:text-5xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 to-pink-500 mb-8 text-center'>
          No NFTs Listed for Sale Yet!
        </h1>
        <p className='text-center text-lg text-gray-400 mt-8 max-w-xl'>
          List your NFTs from your collection to see them here.
        </p>
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

  return (
    <div className="min-h-screen bg-gradient-to-br text-white p-8 custom-scrollbar-hidden">
      <motion.h1
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className='text-4xl md:text-5xl font-extrabold mb-10 text-center text-transparent bg-clip-text bg-gradient-to-r from-green-400 to-cyan-400'
      >
        NFTs Live for Sale
      </motion.h1>

      <AnimatePresence>
        <motion.div
          className='grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-8'
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
                <h3 className="text-xl font-bold text-white truncate">{nft.name}</h3>
                <p className="text-gray-400 text-sm truncate">{nft.symbol}</p>
                <p className="text-lg font-semibold text-purple-400 mt-2">
                  Price: {nft.sellPrice} SOL
                </p>
                <p className="text-gray-500 text-xs mt-1 break-all">
                  {nft.mintAddress}
                </p>

                {/* Conditional Rendering for Buttons */}
                {connected && publicKey && nft.seller === publicKey.toBase58() ? (
                  // Connected user is the seller
                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => handleDelist(nft)} // Pass the whole NFT object
                    className="mt-4 w-full bg-red-600 hover:bg-red-700 text-white font-semibold py-2 rounded-md transition-colors duration-200"
                  >
                    Delist
                  </motion.button>
                ) : connected && publicKey ? (
                  // Connected user is not the seller
                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => handleBuy(nft)} // Pass the whole NFT object
                    className="mt-4 w-full bg-green-600 hover:bg-green-700 text-white font-semibold py-2 rounded-md transition-colors duration-200"
                  >
                    Buy Now
                  </motion.button>
                ) : (
                  // Not connected
                  <p className="mt-4 text-center text-gray-400 text-sm">
                    Connect wallet to buy
                  </p>
                )}
              </div>
            </motion.div>
          ))}
        </motion.div>
      </AnimatePresence>

      {/* Styles for custom scrollbar - good touch! */}
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