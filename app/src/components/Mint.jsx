import React, { useState, useRef, useEffect } from "react";
import toast from "react-hot-toast";
import { useWallet, useConnection } from "@solana/wallet-adapter-react";
import {
  PublicKey,
  Transaction,
  Keypair,
  SystemProgram,
} from "@solana/web3.js";
import * as anchor from "@coral-xyz/anchor";
import idl from "../idl/marketplacenft.json";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
// import { createUmi, createGenericFile } from "@metaplex-foundation/umi"; // Not used directly for upload now
// import { irysUploader } from "@metaplex-foundation/umi-uploader-irys"; // Not used directly for upload now
// import { walletAdapterIdentity } from "@metaplex-foundation/umi-signer-wallet-adapters"; // Not used directly for upload now
import { PinataSDK } from "pinata";
import { getAssociatedTokenAddress, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { useNavigate } from "react-router-dom";
import confetti from 'canvas-confetti';

// Ensure Buffer is available in the browser environmen 

const pinata = new PinataSDK({
  pinataJwt:
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySW5mb3JtYXRpb24iOnsiaWQiOiJjYjFkY2YxNi0xZThkLTQzMWUtODY0OS02ZWI1ZGU5NmY3MzgiLCJlbWFpbCI6InNoYWt0aWR1YmUwNEBnbWFpbC5jb20iLCJlbWFpbF92ZXJpZmllZCI6dHJ1ZSwicGluX3BvbGljeSI6eyJyZWdpb25zIjpbeyJkZXNpcmVkUmVwbGljYXRpb25Db3VudCI6MSwiaWQiOiJGUkExIn0seyJkZXNpcmVkUmVwbGljYXRpb25Db3VudCI6MSwiaWQiOiJOWUMxIn1dLCJ2ZXJzaW9uIjoxfSwibWZhX2VuYWJsZWQiOmZhbHNlLCJzdGF0dXMiOiJBQ1RJVkUifSwiYXV0aGVudGljYXRpb25UeXBlIjoic2NvcGVkS2V5Iiwic2NvcGVkS2V5S2V5IjoiODMzZWJhYTM0MzdlOTM4YmI3MGQiLCJzY29wZWRLZXlTZWNyZXQiOiJiNWM1ZTJjYWI5NTJiNGJjNDE1YmQwOWE1NWE3YjQ4N2JkMzMwODA3MjA0YzExNzVjMjU1ODAyZDlmNjM2ZGRmIiwiZXhwIjoxNzgzNjg0ODg5fQ.znwjWW5dCcybxih3UKJH1zRuaGz6Z2bFY3ED4NYCI38",
});


const MintNftPage = () => {
  const { connection } = useConnection();
  const { publicKey, wallet, connected } = useWallet();
  const { setVisible } = useWalletModal();
  const navigate = useNavigate();

  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef(null);
  const [nftName, setNftName] = useState("");
  const [nftSymbol, setNftSymbol] = useState("");
  const [nftPhoto, setNftPhoto] = useState(null);
  const [royalty, setRoyalty] = useState("");
  // Disabled for simplicity as per previous versions:
  const [creators, setCreators] = useState("");
  const [collectionMint, setCollectionMint] = useState("");
  const [collectionVerified, setCollectionVerified] = useState(false);
  const [maxSupply, setMaxSupply] = useState("");

  const [errors, setErrors] = useState({});
  const [isMinting, setIsMinting] = useState(false);
  const [showConfetti, setShowConfetti] = useState(false);

  // Program IDs for Solana (ensure these are correct for your deployment)
  const PROGRAM_ID = new PublicKey(
    "9U1c1CFEyEgEjbrxFcbAymjb4sf8VjiYhm4rYD8Zzszf"
  );
  const metadataProgramId = new PublicKey(
    "metaqbxxUerdq28cj1RbTFW3DvdbRrVfadqotrsmoBH"
  );


  const validateField = (fieldName, value) => {
    let error = "";
    switch (fieldName) {
      case "nftName":
        if (!value.trim()) error = "NFT Name is required.";
        else if (value.trim().length < 3)
          error = "NFT Name must be at least 3 characters.";
        break;
      case "nftSymbol":
        if (!value.trim()) error = "NFT Symbol is required.";
        else if (value.trim().length < 1 || value.trim().length > 10) // Increased max length slightly for flexibility
          error = "NFT Symbol must be 1-10 characters.";
        break;
      case "nftPhoto":
        if (!value) error = "NFT Photo is required.";
        break;
      case "royalty":
        const royaltyNum = parseFloat(value);
        if (isNaN(royaltyNum)) error = "Royalty is required.";
        else if (royaltyNum < 0 || royaltyNum > 100)
          error = "Royalty must be between 0 and 100%.";
        break;
      // Creator, Collection, MaxSupply validations are commented out as fields are disabled
      default:
        break;
    }
    return error;
  };

  const validateForm = () => {
    const newErrors = {
      nftName: validateField("nftName", nftName),
      nftSymbol: validateField("nftSymbol", nftSymbol),
      nftPhoto: validateField("nftPhoto", nftPhoto),
      royalty: validateField("royalty", royalty),
    };
    setErrors(newErrors);
    return Object.values(newErrors).every((error) => !error);
  };

  useEffect(() => {
    if (showConfetti) {
      confetti({
        particleCount: 150,
        spread: 180,
        origin: { y: 0.6 },
        colors: ['#a864fd', '#29cdff', '#78ff44', '#ff718d', '#fdff6a'],
      });

      const timer = setTimeout(() => {
        setShowConfetti(false);
      }, 4000);

      return () => clearTimeout(timer);
    }
  }, [showConfetti]);


  const handleMintNft = async (e) => {
    e.preventDefault();

    if (!connected || !publicKey || !wallet) {
      toast.error(
        "Wallet not connected. Please connect your wallet to mint an NFT."
      );
      setVisible(true);
      return;
    }
    if (!validateForm()) {
      toast.error("Please correct the errors in the form.");
      return;
    }

    setIsMinting(true);
    let mintToastId = toast.loading("Preparing NFT data...");

    const mintNftKeypair = Keypair.generate();
    console.log("Generated Mint Keypair:", mintNftKeypair.publicKey.toBase58());

    const provider = new anchor.AnchorProvider(
      connection,
      wallet.adapter,
      anchor.AnchorProvider.defaultOptions()
    );
    anchor.setProvider(provider);
    const program = new anchor.Program(idl, provider);

    try {
      // 1. Upload Image to Pinata
      toast.loading("Uploading NFT image...", { id: mintToastId });
      const uploadImageRes = await pinata.upload.public.file(nftPhoto);
      const imageUri = `https://gateway.pinata.cloud/ipfs/${uploadImageRes.cid}`;
      console.log("Image uploaded to IPFS:", imageUri);
      toast.success("Image uploaded!", { id: mintToastId });

      const metadata = {
        name: nftName,
        symbol: nftSymbol,
        image: imageUri,
        properties: {
          files: [{
            uri: imageUri,
            type: nftPhoto.type
          }],
          category: "image",
        },
        description: "A unique NFT minted on Solana Forge.",
        seller_fee_basis_points: parseFloat(royalty) * 100,
        // attributes, collection, creators are disabled in the UI for now
      };

      toast.loading("Uploading NFT metadata...", { id: mintToastId });
      const uploadMetadataRes = await pinata.upload.public.json(metadata);
      const metadataUri = `https://gateway.pinata.cloud/ipfs/${uploadMetadataRes.cid}`;
      console.log("Metadata uploaded to IPFS:", metadataUri);
      toast.success("Metadata uploaded!", { id: mintToastId });

      toast.loading("Minting NFT on Solana...", { id: mintToastId });

      const sellerFeesBasisPoints = parseFloat(royalty) * 100;

      const ata = await getAssociatedTokenAddress(
        mintNftKeypair.publicKey,
        publicKey
      );

      const mintToInstruction = await program.methods
        .mintToNft(
          nftName,
          nftSymbol,
          metadataUri,
          sellerFeesBasisPoints,
          null, // creators
          null, // collection_mint
          null, // collection_verified
          null  // max_supply
        )
        .accounts({
          signer: wallet.adapter.publicKey,
          mint: mintNftKeypair.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
          tokenAccount: ata,
          systemProgram: SystemProgram.programId, // Add SystemProgram
        }).instruction(); // Get the instruction directly

      const transaction = new Transaction();
      transaction.add(mintToInstruction);

      transaction.recentBlockhash = (await provider.connection.getLatestBlockhash()).blockhash;
      transaction.feePayer = publicKey;

      const signedTx = await wallet.adapter.signTransaction(transaction);
      signedTx.partialSign(mintNftKeypair);

      const txSig = await provider.connection.sendRawTransaction(signedTx.serialize());
      await provider.connection.confirmTransaction(txSig, "confirmed");

      const explorerUrl = `https://explorer.solana.com/tx/${txSig}?cluster=devnet`;
      toast.success(
        () => (
          <div>
            NFT Minted Successfully!{" "}
            <a href={explorerUrl} target="_blank" rel="noopener noreferrer" className="underline text-blue-300">
              View on Explorer
            </a>
          </div>
        ),
        { id: mintToastId, duration: 6000 }
      );
      console.log("Transaction Signature:", txSig);
      console.log("Solana Explorer Link:", explorerUrl);

      setShowConfetti(true);
      // Clear form after successful mint
      setNftName("");
      setNftSymbol("");
      setNftPhoto(null);
      setRoyalty("");
      setCreators("");
      setCollectionMint("");
      setCollectionVerified(false);
      setMaxSupply("");
      setErrors({});

      setTimeout(() => {
        navigate('/marketplace/buy-sell');
      }, 1500);

    } catch (error) {
      toast.dismiss(mintToastId);
      let errorMessage = `Error minting NFT: ${error.message || error.toString()}`;
      if (error.logs) {
        const programErrorLog = error.logs.find(log => log.includes("Program log: AnchorError"));
        if (programErrorLog) {
          errorMessage = programErrorLog.split("Error Message: ")[1] || errorMessage;
        } else {
          errorMessage = `Transaction failed: ${error.logs.join('\n')}`;
        }
      }
      toast.error(errorMessage, { duration: 6000 });
      console.error(`Error minting NFT:`, error);
    } finally {
      setIsMinting(false);
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);

    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      const file = files[0];
      if (file.type.startsWith("image/")) {
        setNftPhoto(file);
        setErrors(prev => ({ ...prev, nftPhoto: '' }));
      } else {
        toast.error("Only image files are supported.");
        setErrors(prev => ({ ...prev, nftPhoto: 'Only image files are supported.' }));
      }
    }
  };

  const handleFileChange = (e) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      const file = files[0];
      if (file.type.startsWith("image/")) {
        setNftPhoto(file);
        setErrors(prev => ({ ...prev, nftPhoto: '' }));
      } else {
        toast.error("Only image files are supported.");
        e.target.value = "";
        setErrors(prev => ({ ...prev, nftPhoto: 'Only image files are supported.' }));
      }
    }
  };

  const handleDropZoneClick = () => {
    fileInputRef.current.click();
  };

  return (
    <div className="flex flex-col items-center min-h-screen p-6 bg-gradient-to-br from-gray-900 to-black rounded-lg overflow-y-auto custom-scrollbar-hidden">
      <h2 className="text-4xl md:text-5xl lg:text-6xl font-extrabold mb-4 animate-slideInDown text-transparent bg-clip-text bg-gradient-to-r from-teal-400 via-blue-400 to-purple-500 drop-shadow-lg">
        Mint New NFT
      </h2>
      <p className="text-lg md:text-xl text-gray-300 mb-10 text-center max-w-xl animate-fadeInUp">
        Create and mint your unique non-fungible token on the Solana blockchain.
        Fill out the details below to bring your digital art to life!
      </p>

      <form
        onSubmit={handleMintNft}
        className="w-full max-w-4xl grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8 bg-gray-800/70 backdrop-blur-md p-8 lg:p-12 rounded-2xl shadow-2xl border border-gray-700 animate-scaleIn"
      >
        {/* NFT Photo Upload */}
        <div className="md:col-span-2 flex flex-col items-center justify-center">
          <label
            htmlFor="nftPhoto"
            className="block text-gray-200 text-base font-semibold mb-2"
          >
            Upload Photo <span className="text-red-400">*</span>
          </label>
          {errors.nftPhoto && (
            <p className="text-red-400 text-sm mb-1">{errors.nftPhoto}</p>
          )}
          <div
            className={`w-full max-w-md h-48 border-2 border-dashed rounded-xl flex flex-col items-center justify-center text-gray-400 cursor-pointer transition-all duration-300
              ${
                isDragging
                  ? "border-blue-400 bg-blue-900/30 text-blue-200"
                  : errors.nftPhoto
                  ? "border-red-500 bg-red-900/20 text-red-300"
                  : "border-gray-600 bg-gray-900/50 hover:border-blue-500 hover:text-blue-300"
              }`}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={handleDropZoneClick}
          >
            {nftPhoto ? (
              <div className="text-center p-2">
                <img
                  src={URL.createObjectURL(nftPhoto)}
                  alt="NFT Preview"
                  className="h-24 w-24 object-cover mx-auto rounded-lg mb-2 shadow-md"
                />
                <p className="text-lg font-medium text-blue-300">
                  File Selected:
                </p>
                <p className="text-md text-center px-4 truncate">{nftPhoto.name}</p>
                <p className="text-sm mt-2 text-gray-400">
                  (Click or Drag another file to change)
                </p>
              </div>
            ) : (
              <>
                <svg
                  className="w-14 h-14 mb-3 text-gray-300"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="1.5"
                    d="M7 16a4 4 0 01-.88-7.903A5 5 0 0115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                  ></path>
                </svg>
                <p className="text-xl font-semibold">
                  Drag & Drop your NFT image here
                </p>
                <p className="text-md mt-1">or click to browse</p>
              </>
            )}
            <input
              type="file"
              id="nftPhoto"
              accept="image/*"
              onChange={handleFileChange}
              ref={fileInputRef}
              className="hidden"
            />
          </div>
        </div>

        {/* NFT Name */}
        <div>
          <label htmlFor="nftName" className="block text-gray-200 text-base font-semibold mb-2">
            NFT Name <span className="text-red-400">*</span>
          </label>
          <input
            type="text"
            id="nftName"
            value={nftName}
            onChange={(e) => {
              setNftName(e.target.value);
              setErrors((prev) => ({ ...prev, nftName: "" }));
            }}
            className={`shadow-inner appearance-none border rounded-lg w-full py-3 px-4 text-gray-100 leading-tight focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-900/50 transition duration-200 ease-in-out transform focus:scale-[1.01] placeholder-gray-500
              ${errors.nftName ? "border-red-500" : "border-gray-700"}`}
            placeholder="e.g., My Awesome NFT"
          />
          {errors.nftName && (
            <p className="text-red-400 mt-1 ml-1 text-sm">{errors.nftName}</p>
          )}
        </div>

        {/* NFT Symbol */}
        <div>
          <label htmlFor="nftSymbol" className="block text-gray-200 text-base font-semibold mb-2">
            NFT Symbol <span className="text-red-400">*</span>
          </label>
          <input
            type="text"
            id="nftSymbol"
            value={nftSymbol}
            onChange={(e) => {
              setNftSymbol(e.target.value);
              setErrors((prev) => ({ ...prev, nftSymbol: "" }));
            }}
            className={`shadow-inner appearance-none border rounded-lg w-full py-3 px-4 text-gray-100 leading-tight focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-900/50 transition duration-200 ease-in-out transform focus:scale-[1.01] placeholder-gray-500
              ${errors.nftSymbol ? "border-red-500" : "border-gray-700"}`}
            placeholder="e.g., MANFT"
          />
          {errors.nftSymbol && (
            <p className="text-red-400 mt-1 ml-1 text-sm">{errors.nftSymbol}</p>
          )}
        </div>

        {/* Royalty */}
        <div>
          <label htmlFor="royalty" className="block text-gray-200 text-base font-semibold mb-2">
            Royalty (%) <span className="text-red-400">*</span>
          </label>
          <input
            type="number"
            id="royalty"
            value={royalty}
            onChange={(e) => {
              setRoyalty(e.target.value);
              setErrors((prev) => ({ ...prev, royalty: "" }));
            }}
            step="0.01"
            className={`shadow-inner appearance-none border rounded-lg w-full py-3 px-4 text-gray-100 leading-tight focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-900/50 transition duration-200 ease-in-out transform focus:scale-[1.01] placeholder-gray-500
              ${errors.royalty ? "border-red-500" : "border-gray-700"}`}
            placeholder="e.g., 5"
          />
          {errors.royalty && (
            <p className="text-red-400 mt-1 ml-1 text-sm">{errors.royalty}</p>
          )}
        </div>

        {/* Creators (Disabled) */}
        <div>
          <label htmlFor="creators" className="block text-gray-200 text-base font-semibold mb-2">
            Creators (Comma-separated addresses)
          </label>
          <input
            type="text"
            id="creators"
            value={creators}
            className={`shadow-inner appearance-none border rounded-lg w-full py-3 px-4 text-gray-400 leading-tight bg-gray-900/30 cursor-not-allowed opacity-60`}
            placeholder="e.g., Addr1,Addr2 (Feature disabled)"
            disabled
          />
        </div>

        {/* Collection Mint Address (Disabled) */}
        <div>
          <label htmlFor="collectionMint" className="block text-gray-200 text-base font-semibold mb-2">
            Collection Mint Address
          </label>
          <input
            type="text"
            id="collectionMint"
            value={collectionMint}
            className={`shadow-inner appearance-none border rounded-lg w-full py-3 px-4 text-gray-400 leading-tight bg-gray-900/30 cursor-not-allowed opacity-60`}
            placeholder="Optional: Collection Mint Address (Feature disabled)"
            disabled
          />
        </div>

        {/* Collection Verified (Disabled) */}
        <div className="flex items-center pt-2">
          <input
            type="checkbox"
            id="collectionVerified"
            checked={collectionVerified}
            className="form-checkbox h-5 w-5 text-blue-600 bg-gray-900 border-gray-600 rounded focus:ring-blue-500 cursor-not-allowed opacity-60"
            disabled
          />
          <label htmlFor="collectionVerified" className="ml-2 text-gray-400 text-base font-semibold cursor-not-allowed opacity-60">
            Collection Verified
          </label>
        </div>

        {/* Max Supply (Disabled) */}
        <div>
          <label htmlFor="maxSupply" className="block text-gray-200 text-base font-semibold mb-2">
            Max Supply
          </label>
          <input
            type="number"
            id="maxSupply"
            value={maxSupply}
            className={`shadow-inner appearance-none border rounded-lg w-full py-3 px-4 text-gray-400 leading-tight bg-gray-900/30 cursor-not-allowed opacity-60`}
            placeholder="e.g., 1 (Feature disabled)"
            disabled
          />
        </div>

        {/* Submit Button */}
        <div className="col-span-1 md:col-span-2 flex justify-center mt-8">
          <button
            type="submit"
            className="bg-gradient-to-r from-purple-700 to-pink-600 text-white font-extrabold py-4 px-16 rounded-full shadow-xl hover:from-purple-800 hover:to-pink-700 transition duration-300 transform hover:scale-105 text-xl tracking-wide animate-pulse-on-hover
            disabled:from-gray-600 disabled:to-gray-500 disabled:shadow-none disabled:cursor-not-allowed disabled:hover:scale-100 disabled:animate-none"
            disabled={isMinting}
          >
            {isMinting ? 'Minting NFT...' : 'Mint NFT'}
          </button>
        </div>
      </form>

      {/* Custom Animations for Global CSS or Tailwind Config */}
      <style jsx>{`
        .custom-scrollbar-hidden {
          -ms-overflow-style: none; /* IE and Edge */
          scrollbar-width: none; /* Firefox */
        }
        .custom-scrollbar-hidden::-webkit-scrollbar {
          display: none; /* Chrome, Safari, Opera */
        }
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes slideInDown {
          from { transform: translateY(-20px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
        @keyframes fadeInUp {
          from { transform: translateY(20px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
        @keyframes scaleIn {
          from { transform: scale(0.98); opacity: 0; }
          to { transform: scale(1); opacity: 1; }
        }
        @keyframes pulseEffect {
          0% {
            transform: scale(1);
            box-shadow: 0 0 10px rgba(168, 85, 247, 0.4); /* purple-500 */
          }
          50% {
            transform: scale(1.03);
            box-shadow: 0 0 20px rgba(236, 72, 153, 0.6); /* pink-500 */
          }
          100% {
            transform: scale(1);
            box-shadow: 0 0 10px rgba(168, 85, 247, 0.4);
          }
        }

        .animate-fadeIn { animation: fadeIn 0.8s ease-out forwards; }
        .animate-slideInDown { animation: slideInDown 0.6s cubic-bezier(0.25, 0.46, 0.45, 0.94) forwards; }
        .animate-fadeInUp { animation: fadeInUp 0.7s cubic-bezier(0.25, 0.46, 0.45, 0.94) forwards; animation-delay: 0.2s; }
        .animate-scaleIn { animation: scaleIn 0.6s cubic-bezier(0.25, 0.46, 0.45, 0.94) forwards; animation-delay: 0.3s; }
        .animate-pulse-on-hover:not([disabled]):hover { animation: pulseEffect 1.5s infinite; }
      `}</style>
    </div>
  );
};

export default MintNftPage;