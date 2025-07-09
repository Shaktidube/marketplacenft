import React, { useState, useRef } from "react";
import toast from "react-hot-toast";
import { PublicKey, Keypair, SystemProgram } from "@solana/web3.js";
// import {
//   getAssociatedTokenAddress,
//   getAccount,
//   createAssociatedTokenAccountInstruction,
//   ASSOCIATED_TOKEN_PROGRAM_ID,
// } from "@solana/spl-token";
import {
  mplTokenMetadata,
  fetchDigitalAsset,
  findMetadataPda,
  MPL_TOKEN_METADATA_PROGRAM_ID,
} from "@metaplex-foundation/mpl-token-metadata";
// import { PROGRAM_ID as METAPLEX_METADATA_PROGRAM_ID } from "@metaplex-foundation/mpl-token-metadata";
// import * as anchor from "@project-serum/anchor";
import idl from "../../../target/idl/marketplacenft.json";
import { createGenericFile } from "@metaplex-foundation/umi";
// import { createUmi } from "@metaplex-foundation/umi-bundle-defaults";
import { AnchorProvider, setProvider } from "@coral-xyz/anchor";
import { env } from "process";

const MintNftPage = () => {
  // const { connection } = useConnection();
  // const { publicKey, sendTransaction, wallet } = useWallet();

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

  const PROGRAM_ID = new PublicKey(
    "9U1c1CFEyEgEjbrxFcbAymjb4sf8VjiYhm4rYD8Zzszf"
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
        else if (value.trim().length < 2 || value.trim().length > 10)
          error = "NFT Symbol must be 2-10 characters.";
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
        if (!value.trim()) error = "Creators are required.";
        else if (!value.split(",").every((addr) => addr.trim().length >= 32))
          error =
            "Invalid creator address format. Use comma-separated valid public keys.";
        break;
      case "maxSupply":
        const maxSupplyNum = parseInt(value, 10);
        if (isNaN(maxSupplyNum)) error = "Max Supply is required.";
        else if (maxSupplyNum < 1) error = "Max Supply must be at least 1.";
        break;
      case "collectionMint":
        if (value.trim() && value.trim().length < 32)
          error = "Invalid Collection Mint Address.";
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
      creators: validateField("creators", creators),
      maxSupply: validateField("maxSupply", maxSupply),
      collectionMint: validateField("collectionMint", collectionMint),
    };
    setErrors(newErrors);
    // Return true if all fields are valid, false otherwise
    return Object.values(newErrors).every((error) => !error);
  };

  const handleMintNft = async (e) => {
    e.preventDefault();

    if (!validateForm()) {
      toast.error('Please correct the errors in the form.');
      return;
    }
    if (!publicKey || !connection || !wallet) {
      toast.error('Wallet not connected or connection not established.');
      return;
    }
    try {
        // console.log("mint nft try block start executing");
        // const provider = anchor.AnchorProvider.env();
        // provider.opts.commitment = "confirmed";

        // const connection = provider.connection;
        // anchor.setProvider(provider);

        // const umi = createUmi(connection.rpcEndpoint, {
        //     commitment: "confirmed",
        // });
        // const readFile = fs.readFileSync(nftPhoto);
        // console.log("read file : ", readFile);

        // let file = createGenericFile(readFile,nftPhoto,{contentType:"img/*"});
        // console.log("file : ", file);

        // const [imageUri] = await 
    } catch (error) {
        toast.error(`Error minting NFT: ${error.message || error.toString()}`)
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
      } else {
        toast.error("Only image files are supported.");
      }
    }
  };

  const handleFileChange = (e) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      const file = files[0];
      if (file.type.startsWith("image/")) {
        setNftPhoto(file);
      } else {
        toast.error("Only image files are supported.");
        e.target.value = "";
      }
    }
  };

  const handleDropZoneClick = () => {
    fileInputRef.current.click();
  };

  return (
    <div className="flex flex-col items-center justify-start h-full p-6 bg-gradient-to-br from-gray-800 to-gray-800 rounded-lg overflow-y-auto animate-fadeIn custom-scrollbar-hidden">
      <h2 className="text-4xl font-extrabold mb-4   drop-shadow-lg animate-slideInDown from-yellow-50 via-purple-400 to-yellow-100 bg-gradient-to-r bg-clip-text text-transparent">
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
              <>
                <p className="text-lg font-semibold text-blue-300">
                  File Selected:
                </p>
                <p className="text-md text-center px-4">{nftPhoto.name}</p>
                <p className="text-sm mt-2">
                  (Click or Drag another file to change)
                </p>
              </>
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
              required
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
          {errors.nftName && (
            <p className="text-red-400 text-xs mb-1">{errors.nftName}</p>
          )}{" "}
          {/* Error message */}
          <input
            type="text"
            id="nftName"
            value={nftName}
            onChange={(e) => {
              setNftName(e.target.value);
              setErrors((prev) => ({ ...prev, nftName: "" }));
            }} // Clear error on change
            onBlur={(e) =>
              setErrors((prev) => ({
                ...prev,
                nftName: validateField("nftName", e.target.value),
              }))
            } // Validate on blur
            className={`shadow-md appearance-none border rounded-lg w-full py-3 px-4 text-gray-100 leading-tight focus:outline-none focus:ring-3 focus:ring-blue-500 focus:border-blue-500 bg-gray-900 bg-opacity-70 transition duration-200 ease-in-out transform focus:scale-102
              ${errors.nftName ? "border-red-500" : "border-gray-600"}`}
            placeholder="e.g., My Awesome NFT"
            required
          />
        </div>

        {/* NFT Symbol */}
        <div>
          <label
            htmlFor="nftSymbol"
            className="block text-gray-100 text-sm font-bold mb-2"
          >
            NFT Symbol <span className="text-red-400">*</span>
          </label>
          {errors.nftSymbol && (
            <p className="text-red-400 text-xs mb-1">{errors.nftSymbol}</p>
          )}{" "}
          {/* Error message */}
          <input
            type="text"
            id="nftSymbol"
            value={nftSymbol}
            onChange={(e) => {
              setNftSymbol(e.target.value);
              setErrors((prev) => ({ ...prev, nftSymbol: "" }));
            }}
            onBlur={(e) =>
              setErrors((prev) => ({
                ...prev,
                nftSymbol: validateField("nftSymbol", e.target.value),
              }))
            }
            className={`shadow-md appearance-none border rounded-lg w-full py-3 px-4 text-gray-100 leading-tight focus:outline-none focus:ring-3 focus:ring-blue-500 focus:border-blue-500 bg-gray-900 bg-opacity-70 transition duration-200 ease-in-out transform focus:scale-102
              ${errors.nftSymbol ? "border-red-500" : "border-gray-600"}`}
            placeholder="e.g., MANFT"
            required
          />
        </div>

        {/* Royalty */}
        <div>
          <label
            htmlFor="royalty"
            className="block text-gray-100 text-sm font-bold mb-2"
          >
            Royalty (%) <span className="text-red-400">*</span>
          </label>
          {errors.royalty && (
            <p className="text-red-400 text-xs mb-1">{errors.royalty}</p>
          )}{" "}
          {/* Error message */}
          <input
            type="number"
            id="royalty"
            value={royalty}
            onChange={(e) => {
              setRoyalty(e.target.value);
              setErrors((prev) => ({ ...prev, royalty: "" }));
            }}
            onBlur={(e) =>
              setErrors((prev) => ({
                ...prev,
                royalty: validateField("royalty", e.target.value),
              }))
            }
            min="0"
            max="100"
            step="0.01"
            className={`shadow-md appearance-none border rounded-lg w-full py-3 px-4 text-gray-100 leading-tight focus:outline-none focus:ring-3 focus:ring-blue-500 focus:border-blue-500 bg-gray-900 bg-opacity-70 transition duration-200 ease-in-out transform focus:scale-102
              ${errors.royalty ? "border-red-500" : "border-gray-600"}`}
            placeholder="e.g., 5"
            required
          />
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
          {errors.creators && (
            <p className="text-red-400 text-xs mb-1">{errors.creators}</p>
          )}{" "}
          {/* Error message */}
          <input
            type="text"
            id="creators"
            value={creators}
            onChange={(e) => {
              setCreators(e.target.value);
              setErrors((prev) => ({ ...prev, creators: "" }));
            }}
            onBlur={(e) =>
              setErrors((prev) => ({
                ...prev,
                creators: validateField("creators", e.target.value),
              }))
            }
            className={`shadow-md appearance-none border rounded-lg w-full py-3 px-4 text-gray-100 leading-tight focus:outline-none focus:ring-3 focus:ring-blue-500 focus:border-blue-500 bg-gray-900 bg-opacity-70 transition duration-200 ease-in-out transform focus:scale-102
              ${errors.creators ? "border-red-500" : "border-gray-600"}`}
            placeholder="e.g., Addr1,Addr2"
            required
          />
        </div>

        {/* Collection Mint Address */}
        <div>
          <label
            htmlFor="collectionMint"
            className="block text-gray-100 text-sm font-bold mb-2"
          >
            Collection Mint Address
          </label>
          {errors.collectionMint && (
            <p className="text-red-400 text-xs mb-1">{errors.collectionMint}</p>
          )}{" "}
          {/* Error message */}
          <input
            type="text"
            id="collectionMint"
            value={collectionMint}
            onChange={(e) => {
              setCollectionMint(e.target.value);
              setErrors((prev) => ({ ...prev, collectionMint: "" }));
            }}
            onBlur={(e) =>
              setErrors((prev) => ({
                ...prev,
                collectionMint: validateField("collectionMint", e.target.value),
              }))
            }
            className={`shadow-md appearance-none border rounded-lg w-full py-3 px-4 text-gray-100 leading-tight focus:outline-none focus:ring-3 focus:ring-blue-500 focus:border-blue-500 bg-gray-900 bg-opacity-70 transition duration-200 ease-in-out transform focus:scale-102
              ${errors.collectionMint ? "border-red-500" : "border-gray-600"}`}
            placeholder="Optional: Collection Mint Address"
          />
        </div>

        {/* Collection Verified */}
        <div className="flex items-center mt-4">
          <input
            type="checkbox"
            id="collectionVerified"
            checked={collectionVerified}
            onChange={(e) => setCollectionVerified(e.target.checked)}
            className="form-checkbox h-5 w-5 text-blue-600 bg-gray-900 border-gray-600 rounded focus:ring-blue-500 cursor-pointer"
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
          {errors.maxSupply && (
            <p className="text-red-400 text-xs mb-1">{errors.maxSupply}</p>
          )}{" "}
          {/* Error message */}
          <input
            type="number"
            id="maxSupply"
            value={maxSupply}
            onChange={(e) => {
              setMaxSupply(e.target.value);
              setErrors((prev) => ({ ...prev, maxSupply: "" }));
            }}
            onBlur={(e) =>
              setErrors((prev) => ({
                ...prev,
                maxSupply: validateField("maxSupply", e.target.value),
              }))
            }
            min="1"
            className={`shadow-md appearance-none border rounded-lg w-full py-3 px-4 text-gray-100 leading-tight focus:outline-none focus:ring-3 focus:ring-blue-500 focus:border-blue-500 bg-gray-900 bg-opacity-70 transition duration-200 ease-in-out transform focus:scale-102
              ${errors.maxSupply ? "border-red-500" : "border-gray-600"}`}
            placeholder="e.g., 1"
            required
          />
        </div>

        {/* Submit Button */}
        <div className="col-span-2 flex justify-center mt-8">
          <button
            type="submit"
            className="bg-gradient-to-r from-purple-600 to-indigo-700 text-white font-extrabold py-4 px-12 rounded-full shadow-xl hover:from-purple-700 hover:to-indigo-800 transition duration-300 transform hover:scale-105 text-xl tracking-wide animate-pulse-on-hover"
          >
            Mint NFT
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
