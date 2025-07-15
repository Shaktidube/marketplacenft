import React, { useState, useRef, useEffect } from "react"; // Import useEffect
import toast from "react-hot-toast";
import { useWallet, useConnection } from "@solana/wallet-adapter-react";
import {
  Connection,
  PublicKey,
  Transaction,
  Keypair,
  SystemProgram,
} from "@solana/web3.js";
import * as anchor from "@coral-xyz/anchor";
import idl from "../idl/marketplacenft.json";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { createUmi, createGenericFile } from "@metaplex-foundation/umi";
import { irysUploader } from "@metaplex-foundation/umi-uploader-irys";
import { walletAdapterIdentity } from "@metaplex-foundation/umi-signer-wallet-adapters";
// import { bundlrUploader } from "@metaplex-foundation/umi-uploader-bundlr"; // Not used
import { PinataSDK } from "pinata";
import { getAssociatedTokenAddress, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { Buffer } from 'buffer';
import { useNavigate } from "react-router-dom";
import confetti from 'canvas-confetti'; // Import the confetti library

const pinata = new PinataSDK({
  pinataJwt:
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySW5mb3JtYXRpb24iOnsiaWQiOiJjYjFkY2YxNi0xZThkLTQzMWUtODY0OS02ZWI1ZGU5NmY3MzgiLCJlbWFpbCI6InNoYWt0aWR1YmUwNEBnbWFpbC5jb20iLCJlbWFpbF92ZXJpZmllZCI6dHJ1ZSwicGluX3BvbGljeSI6eyJyZWdpb25zIjpbeyJkZXNpcmVkUmVwbGljYXRpb25Db3VudCI6MSwiaWQiOiJGUkExIn0seyJkZXNpcmVkUmVwbGljYXRpb25Db3VudCI6MSwiaWQiOiJOWUMxIn1dLCJ2ZXJzaW9uIjoxfSwibWZhX2VuYWJsZWQiOmZhbHNlLCJzdGF0dXMiOiJBQ1RJVkUifSwiYXV0aGVudGljYXRpb25UeXBlIjoic2NvcGVkS2V5Iiwic2NvcGVkS2V5S2V5IjoiODMzZWJhYTM0MzdlOTM4YmI3MGQiLCJzY29wZWRLZXlTZWNyZXQiOiJiNWM1ZTJjYWI5NTJiNGJjNDE1YmQwOWE1NWE3YjQ4N2JkMzMwODA3MjA0YzExNzVjMjU1ODAyZDlmNjM2ZGRmIiwiZXhwIjoxNzgzNjg0ODg5fQ.znwjWW5dCcybxih3UKJH1zRuaGz6Z2bFY3ED4NYCI38",
});

console.log("Pinata SDK initialized:", pinata);
console.log("Loaded IDL:", idl);

const MintNftPage = () => {
  const { connection } = useConnection();
  const { publicKey, wallet, connected } = useWallet(); // Removed sendTransaction as it's not directly used here
  const { setVisible } = useWalletModal();
  const navigate = useNavigate();

  // State variables for form inputs
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef(null);
  const [nftName, setNftName] = useState("");
  const [nftSymbol, setNftSymbol] = useState("");
  const [nftPhoto, setNftPhoto] = useState(null);
  const [royalty, setRoyalty] = useState("");
  const [creators, setCreators] = useState("");
  const [collectionMint, setCollectionMint] = useState("");
  const [collectionVerified, setCollectionVerified] = useState(false);
  const [maxSupply, setMaxSupply] = useState("");
  const [errors, setErrors] = useState({});
  const [isMinting, setIsMinting] = useState(false); // State to disable button during minting
  const [showConfetti, setShowConfetti] = useState(false); // State to trigger confetti

  const PROGRAM_ID = new PublicKey(
    "9U1c1CFEyEgEjbrxFcbAymjb4sf8VjiYhm4rYD8Zzszf"
  );

  const metadataProgramId = new PublicKey(
    "metaqbxxUerdq28cj1RbTFW3DvdbRrVfadqotrsmoBH"
  );

  const readFileAsUint8Array = (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (event) => {
        resolve(new Uint8Array(event.target.result));
      };
      reader.onerror = (event) => {
        reject(event.target.error);
      };
      reader.readAsArrayBuffer(file);
    });
  };

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
        else if (value.trim().length < 1 || value.trim().length > 4)
          error = "NFT Symbol must be 1-4 characters.";
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
      case "creators":
        if (!value.trim()) {
            error = "Creators are required.";
        } else {
            const creatorAddresses = value.split(',').map(addr => addr.trim());
            const invalidAddresses = creatorAddresses.filter(addr => {
                try {
                    new PublicKey(addr);
                    return false;
                } catch (e) {
                    return true;
                }
            });
            if (invalidAddresses.length > 0) {
                error = "Invalid creator address format. Use comma-separated valid public keys.";
            }
        }
        break;
      case "maxSupply":
        const maxSupplyNum = parseInt(value, 10);
        if (isNaN(maxSupplyNum)) error = "Max Supply is required.";
        else if (maxSupplyNum < 1) error = "Max Supply must be at least 1.";
        break;
      case "collectionMint":
        if (value.trim()) {
            try {
                new PublicKey(value.trim());
            } catch (e) {
                error = "Invalid Collection Mint Address.";
            }
        }
        break;
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
      // creators: validateField("creators", creators),
      // maxSupply: validateField("maxSupply", maxSupply),
      // collectionMint: validateField("collectionMint", collectionMint),
    };
    setErrors(newErrors);
    return Object.values(newErrors).every((error) => !error);
  };

  // --- useEffect to trigger confetti animation ---
  useEffect(() => {
    if (showConfetti) {
      confetti({
        particleCount: 150,
        spread: 180,
        origin: { y: 0.6 }, // From the middle-bottom
        colors: ['#a864fd', '#29cdff', '#78ff44', '#ff718d', '#fdff6a'], // Vibrant colors
      });

      // Stop confetti after a few seconds
      const timer = setTimeout(() => {
        setShowConfetti(false);
      }, 4000); // Confetti for 4 seconds

      return () => clearTimeout(timer); // Cleanup
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

    setIsMinting(true); // Disable button
    // toast.loading("Preparing NFT data...");

    const mintNftKeypair = Keypair.generate();
    console.log("Generated Mint Keypair:", mintNftKeypair.publicKey.toBase58());

    const umi = createUmi("https://api.devnet.solana.com", {
      commitment: "confirmed",
    });
    umi.use(walletAdapterIdentity(wallet.adapter));

    
    umi.uploader = irysUploader(); // Still here, won't interfere with Pinata

    const provider = new anchor.AnchorProvider(
      connection,
      wallet.adapter,
      anchor.AnchorProvider.defaultOptions()
    );
    anchor.setProvider(provider);
    const program = new anchor.Program(idl, provider);

    try {
      // 1. Upload Image to Pinata
      toast.loading("Uploading NFT image...", { id: 'upload-image' });
      const uploadImageRes = await pinata.upload.public.file(nftPhoto);
      const imageUri = `https://gateway.pinata.cloud/ipfs/${uploadImageRes.cid}`;
      console.log("Image uploaded to IPFS:", imageUri);
      toast.success("Image uploaded!", { id: 'upload-image' });

      const metadata = {
        name: nftName,
        symbol: nftSymbol,
        image: imageUri,
        properties: {
          files: [{
            uri: imageUri,
            type: nftPhoto.type // Use actual file type
          }],
          category: "image",
        },
        description: "A unique NFT minted on Solana Forge.",
        seller_fee_basis_points: parseFloat(royalty) * 100,
        // attributes: [
        //   { trait_type: "Max Supply", value: maxSupply.toString() }
        // ],
        // collection: collectionMint.trim() ? {
        //   name: nftName,
        //   family: "Solana Marketplace Collection"
        // } : undefined,
        // creators: creators.split(',').map(creatorAddr => ({
        //   address: new PublicKey(creatorAddr.trim()).toBase58(), 
        //   share: Math.round(100 / creators.split(',').length),
        // })),
      };

      toast.loading("Uploading NFT metadata...", { id: 'upload-metadata' });
      const uploadMetadataRes = await pinata.upload.public.json(metadata);
      const metadataUri = `https://gateway.pinata.cloud/ipfs/${uploadMetadataRes.cid}`;
      console.log("Metadata uploaded to IPFS:", metadataUri);
      toast.success("Metadata uploaded!", { id: 'upload-metadata' });

      toast.loading("Minting NFT on Solana...", { id: 'mint-tx' });

      const sellerFeesBasisPoints = parseFloat(royalty) * 100;

      const ata = await getAssociatedTokenAddress(
        mintNftKeypair.publicKey,
        publicKey
      );

      // const programCreators = creators.split(',').map(creatorAddr => ({
      //   address: new PublicKey(creatorAddr.trim()),
      //   share: Math.round(100 / creators.split(',').length),
      //   verified: false,
      // }));

      // let collection_mint_pubkey = null;
      // let collection_verified_bool = false;
      // if (collectionMint.trim()) {
      //     try {
      //         collection_mint_pubkey = new PublicKey(collectionMint.trim());
      //         collection_verified_bool = collectionVerified;
      //     } catch (e) {
      //         console.error("Invalid collection mint address:", e);
      //         toast.error("Invalid Collection Mint Address provided.");
      //         setIsMinting(false);
      //         return;
      //     }
      // }

      const mintTo = await program.methods
        .mintToNft(
          nftName,
          nftSymbol,
          metadataUri,
          sellerFeesBasisPoints,
          null,
          null,
          null,
          null
        )
        .accounts({
          signer: wallet.adapter.publicKey,
          mint: mintNftKeypair.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
          tokenAccount: ata,
        }).instruction()

      const transaction = new Transaction();
      transaction.add(mintTo);

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
        { duration: 6000 }
      );
      console.log("Transaction Signature:", txSig);
      console.log("Solana Explorer Link:", explorerUrl);

      setShowConfetti(true); // Trigger confetti animation
      // Clear form after successful mint
      setNftName("");
      setNftSymbol("");
      setNftPhoto(null);
      setRoyalty("");
      // setCreators("");
      // setCollectionMint("");
      // setCollectionVerified(false);
      // setMaxSupply("");
      setErrors({});

      // Navigate after a short delay to allow confetti to start
      setTimeout(() => {
        navigate('/marketplace/buy-sell');
      }, 1500); // Navigate after 1.5 seconds

    } catch (error) {
      toast.dismiss(); // Dismiss all toasts
      toast.error(`Error minting NFT: ${error.message || error.toString()}`);
      console.error(`Error minting NFT:`, error);
    } finally {
      toast.dismiss('mint-tx');
      setIsMinting(false); // Re-enable button
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
    <div className="flex flex-col items-center justify-start h-full p-6 bg-gradient-to-br from-gray-800 to-gray-800 rounded-lg overflow-y-auto animate-fadeIn custom-scrollbar-hidden">
      <h2 className="text-4xl font-extrabold mb-4 drop-shadow-lg animate-slideInDown from-yellow-50 via-purple-400 to-yellow-100 bg-gradient-to-r bg-clip-text text-transparent">
        Mint New NFT
      </h2>
      <p className="text-lg from-yellow-50 via-pink-400 to-yellow-100 bg-gradient-to-r bg-clip-text text-transparent mb-10 text-center max-w-xl animate-fadeInUp">
        Create and mint your unique non-fungible token on the Solana blockchain.
        Fill out the details below to bring your digital art to life!
      </p>

      <form
        onSubmit={handleMintNft}
        className="w-full max-w-3xl grid grid-cols-1 md:grid-cols-2 gap-8 bg-gray-700 bg-opacity-50 backdrop-blur-sm p-10 rounded-xl shadow-inner border border-gray-600 animate-scaleIn"
      >
        <div className="md:col-span-2 flex flex-col items-center justify-center">
          <label
            htmlFor="nftPhoto"
            className="block text-gray-100 text-sm font-bold mb-2"
          >
            Upload Photo <span className="text-red-400">*</span>
          </label>
          {errors.nftPhoto && (
            <p className="text-red-400 text-xs mb-1">{errors.nftPhoto}</p>
          )}
          <div
            className={`w-full max-w-md h-40 border-2 border-dashed rounded-lg flex flex-col items-center justify-center text-gray-400 cursor-pointer transition-colors duration-200
              ${
                isDragging
                  ? "border-blue-500 bg-gray-600 text-blue-300"
                  : errors.nftPhoto
                  ? "border-red-500 bg-red-900 bg-opacity-20"
                  : "border-gray-500 bg-gray-800 hover:border-blue-400 hover:text-blue-200"
              }`}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={handleDropZoneClick}
          >
            {nftPhoto ? (
              <div className="text-center">
                <img
                  src={URL.createObjectURL(nftPhoto)} // Display image preview
                  alt="NFT Preview"
                  className="h-18 w-18 object-contain mx-auto rounded-md mb-2"
                />
                <p className="text-lg font-semibold text-blue-300">
                  File Selected:
                </p>
                <p className="text-md text-center px-4">{nftPhoto.name}</p>
                <p className="text-sm mt-2">
                  (Click or Drag another file to change)
                </p>
              </div>
            ) : (
              <>
                <svg
                  className="w-12 h-12 mb-3"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M7 16a4 4 0 01-.88-7.903A5 5 0 0115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                  ></path>
                </svg>
                <p className="text-lg font-semibold">
                  Drag & Drop your NFT image here
                </p>
                <p className="text-sm">or click to browse</p>
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
          <label
            htmlFor="nftName"
            className="block text-gray-100 text-sm font-bold mb-2"
          >
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
            className={`shadow-md appearance-none border rounded-lg w-full py-3 px-4 text-gray-100 leading-tight focus:outline-none focus:ring-3 focus:ring-blue-500 focus:border-blue-500 bg-gray-900 bg-opacity-70 transition duration-200 ease-in-out transform focus:scale-102
              ${errors.nftName ? "border-red-500" : "border-gray-600"}`}
            placeholder="e.g., My Awesome NFT"
          />
          {errors.nftName && (
            <p className="text-red-400 mt-1 ml-2 text-xs mb-1">{errors.nftName}</p>
          )}
        </div>

        {/* NFT Symbol */}
        <div>
          <label
            htmlFor="nftSymbol"
            className="block text-gray-100 text-sm font-bold mb-2"
          >
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
            className={`shadow-md appearance-none border rounded-lg w-full py-3 px-4 text-gray-100 leading-tight focus:outline-none focus:ring-3 focus:ring-blue-500 focus:border-blue-500 bg-gray-900 bg-opacity-70 transition duration-200 ease-in-out transform focus:scale-102
              ${errors.nftSymbol ? "border-red-500" : "border-gray-600"}`}
            placeholder=" e.g., MANFT"
          />
          {errors.nftSymbol && (
            <p className="text-red-400 mt-1 ml-2 text-xs mb-1">{errors.nftSymbol}</p>
          )}
        </div>

        {/* Royalty */}
        <div>
          <label
            htmlFor="royalty"
            className="block text-gray-100 text-sm font-bold mb-2"
          >
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
            className={`shadow-md appearance-none border rounded-lg w-full py-3 px-4 text-gray-100 leading-tight focus:outline-none focus:ring-3 focus:ring-blue-500 focus:border-blue-500 bg-gray-900 bg-opacity-70 transition duration-200 ease-in-out transform focus:scale-102
              ${errors.royalty ? "border-red-500" : "border-gray-600"}`}
            placeholder="e.g., 5"
          />
          {errors.royalty && (
            <p className="text-red-400 mt-1 ml-2 text-xs mb-1">{errors.royalty}</p>
          )}
        </div>

        {/* Creators */}
        <div>
          <label
            htmlFor="creators"
            className="block text-gray-100 text-sm font-bold mb-2"
          >
            Creators (Comma-separated addresses){" "}
            <span className="text-red-400">*</span>
          </label>
          <input
            // type="text"
            // id="creators"
            // value={creators}
            // onChange={(e) => {
            //   setCreators(e.target.value);
            //   setErrors((prev) => ({ ...prev, creators: "" }));
            // }}
            className={`shadow-md appearance-none border border-gray-600 rounded-lg w-full py-3 px-4 text-gray-100 leading-tight focus:outline-none focus:ring-3 focus:ring-blue-500 focus:border-blue-500 bg-gray-900 bg-opacity-70 transition duration-200 ease-in-out transform focus:scale-102`}
            placeholder="e.g., Addr1,Addr2"
            disabled
          />
          {/* {errors.creators && (
            <p className="text-red-400 mt-1 ml-2 text-xs mb-1">{errors.creators}</p>
          )} */}
        </div>

        {/* Collection Mint Address */}
        <div>
          <label
            htmlFor="collectionMint"
            className="block text-gray-100 text-sm font-bold mb-2"
          >
            Collection Mint Address
          </label>
          <input
            type="text"
            id="collectionMint"
            value={collectionMint}
            onChange={(e) => {
              setCollectionMint(e.target.value);
              setErrors((prev) => ({ ...prev, collectionMint: "" }));
            }}
            className={`shadow-md appearance-none border rounded-lg w-full py-3 px-4 text-gray-100 leading-tight focus:outline-none focus:ring-3 focus:ring-blue-500 focus:border-blue-500 bg-gray-900 bg-opacity-70 transition duration-200 ease-in-out transform focus:scale-102
              ${errors.collectionMint ? "border-red-500" : "border-gray-600"}`}
            placeholder="Optional: Collection Mint Address"
            disabled
            
          />
          {errors.collectionMint && (
            <p className="text-red-400 mt-1 ml-2 text-xs mb-1">{errors.collectionMint}</p>
          )}
        </div>

        {/* Collection Verified */}
        <div className="flex items-center mt-4">
          <input
            type="checkbox"
            id="collectionVerified"
            checked={collectionVerified}
            onChange={(e) => setCollectionVerified(e.target.checked)}
            className="form-checkbox h-5 w-5 text-blue-600 bg-gray-900 border-gray-600 rounded focus:ring-blue-500 cursor-pointer"
            disabled
          />
          <label
            htmlFor="collectionVerified"
            className="ml-2 text-gray-100 text-sm font-bold"
          >
            Collection Verified
          </label>
        </div>

        {/* Max Supply */}
        <div>
          <label
            htmlFor="maxSupply"
            className="block text-gray-100 text-sm font-bold mb-2"
          >
            Max Supply <span className="text-red-400">*</span>
          </label>
          <input
            type="number"
            // id="maxSupply"
            // value={maxSupply}
            // onChange={(e) => {
            //   setMaxSupply(e.target.value);
            //   setErrors((prev) => ({ ...prev, maxSupply: "" }));
            // }}
            // min="1"
            className={`shadow-md appearance-none border border-gray-600 rounded-lg w-full py-3 px-4 text-gray-100 leading-tight focus:outline-none focus:ring-3 focus:ring-blue-500 focus:border-blue-500 bg-gray-900 bg-opacity-70 transition duration-200 ease-in-out transform focus:scale-102
              `}
            placeholder=" e.g., 1"
            disabled
          />
          {/* {errors.maxSupply && (
            <p className="text-red-400 mt-1 ml-2 text-xs mb-1">{errors.maxSupply}</p>
          )} */}
        </div>

        {/* Submit Button */}
        <div className="col-span-2 flex justify-center mt-8">
          <button
            type="submit"
            className="bg-gradient-to-r from-purple-600 to-indigo-700 text-white font-extrabold py-4 px-12 rounded-full shadow-xl hover:from-purple-700 hover:to-indigo-800 transition duration-300 transform hover:scale-105 text-xl tracking-wide animate-pulse-on-hover"
            disabled={isMinting} // Disable button when minting
          >
            {isMinting ? 'Minting...' : 'Mint NFT'}
          </button>
        </div>
      </form>
      {/* Add custom keyframe animations to your global CSS file (e.g., App.css) */}
      <style jsx>{`
        .custom-scrollbar-hidden {
          -ms-overflow-style: none; /* IE and Edge */
          scrollbar-width: none; /* Firefox */
        }

        .custom-scrollbar-hidden::-webkit-scrollbar {
          display: none; /* Chrome, Safari, Opera */
        }
        @keyframes fadeIn {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }
        @keyframes slideInDown {
          from {
            transform: translateY(-20px);
            opacity: 0;
          }
          to {
            transform: translateY(0);
            opacity: 1;
          }
        }
        @keyframes scaleIn {
          from {
            transform: scale(0.95);
            opacity: 0;
          }
          to {
            transform: scale(1);
            opacity: 1;
          }
        }
        .animate-fadeIn {
          animation: fadeIn 0.8s ease-out forwards;
        }
        .animate-slideInDown {
          animation: slideInDown 0.6s ease-out forwards;
        }
        .animate-fadeInUp {
          animation: slideInDown 0.7s ease-out forwards; /* Using slideInDown for a similar effect */
        }
        .animate-scaleIn {
          animation: scaleIn 0.5s ease-out forwards;
        }
        .animate-pulse-on-hover:hover {
          animation: pulseEffect 1s infinite alternate;
        }
        @keyframes pulseEffect {
          from {
            transform: scale(1.05);
            box-shadow: 0 0 15px rgba(147, 51, 234, 0.7);
          } /* purple-600 */
          to {
            transform: scale(1);
            box-shadow: 0 0 5px rgba(147, 51, 234, 0.3);
          }
        }
      `}</style>
    </div>
  );
};

export default MintNftPage;
