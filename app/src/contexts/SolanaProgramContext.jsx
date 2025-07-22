// src/contexts/SolanaProgramContext.jsx
import React, { createContext, useState, useEffect, useCallback, useContext, useRef } from 'react';
import * as anchor from "@coral-xyz/anchor";
import { Connection, PublicKey } from "@solana/web3.js"; // Import Connection and PublicKey
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { Helius } from 'helius-sdk';

// Umi imports
import { createUmi } from '@metaplex-foundation/umi-bundle-defaults'; // Using umi-bundle-defaults for convenience
import { web3JsRpc } from '@metaplex-foundation/umi-rpc-web3js'; // For using web3.js connection with Umi
import { walletAdapterIdentity } from '@metaplex-foundation/umi-signer-wallet-adapters'; // Correct import for wallet adapter identity
import { mplTokenMetadata } from '@metaplex-foundation/mpl-token-metadata'; // Crucial for NFT metadata operations

import idl from '../idl/marketplacenft.json'; // Assuming your IDL path is correct

// Define your Helius API Key and Cluster (kept for Helius SDK initialization)
const HELIUS_API_KEY = "e1ed6bae-c868-4b1b-9b21-e062d5edd982";
const HELIUS_CLUSTER = "devnet"; // Or 'mainnet-beta', 'testnet'

// 1. Create the Context
export const SolanaProgramContext = createContext(null);

// 2. Create the Provider Component
export const SolanaProgramProvider = ({ children }) => {
  const { connection } = useConnection(); // Get connection from wallet adapter
  const { wallet, publicKey, connected } = useWallet(); // Get wallet and public key

  const [program, setProgram] = useState(null);
  const [provider, setProvider] = useState(null);
  const [heliusInstance, setHeliusInstance] = useState(null);
  const [umiInstance, setUmiInstance] = useState(null);
  const programRef = useRef(null); // Use ref to store program instance

  useEffect(() => {
    if (connection && wallet?.adapter && publicKey) {
      try {
        // Initialize Anchor Provider
        const anchorProvider = new anchor.AnchorProvider(
          connection,
          wallet.adapter,
          anchor.AnchorProvider.defaultOptions()
        );
        anchor.setProvider(anchorProvider); // Set global provider for Anchor
        setProvider(anchorProvider);

        // Initialize Anchor Program
        const programInstance = new anchor.Program(idl, anchorProvider);
        programRef.current = programInstance; // Store in ref
        setProgram(programInstance);
        console.log("Anchor Program Initialized:", programInstance);

        // Initialize Helius SDK
        const heliusClient = new Helius(HELIUS_API_KEY, HELIUS_CLUSTER);
        setHeliusInstance(heliusClient);
        console.log("Helius SDK Initialized:", heliusClient);

        // Initialize Umi
        // Use connection.rpcEndpoint for createUmi
        const umi = createUmi(connection.rpcEndpoint)
          // Corrected: Pass wallet.adapter to walletAdapterIdentity
          .use(walletAdapterIdentity(wallet.adapter))
          // Explicitly use web3.js connection for RPC calls within Umi
          .use(web3JsRpc(connection))
          // Crucial: Load the mplTokenMetadata plugin for NFT metadata operations
          .use(mplTokenMetadata());
          
        setUmiInstance(umi);
        console.log("Umi Instance Initialized:", umi);

      } catch (error) {
        console.error("Failed to initialize Solana program context:", error);
        // Reset all states on error to indicate uninitialized state
        setProgram(null);
        setProvider(null);
        setHeliusInstance(null);
        setUmiInstance(null);
        programRef.current = null;
      }
    } else {
      // Reset states if wallet or connection is not available
      setProgram(null);
      setProvider(null);
      setHeliusInstance(null);
      setUmiInstance(null);
      programRef.current = null;
    }
  }, [connection, wallet, publicKey, connected]); // Dependencies for re-initialization

  // The value provided to consumers
  const contextValue = {
    program,
    provider,
    helius: heliusInstance, // Renamed to helius for easier access
    umi: umiInstance,
    // You can also expose connection, publicKey, connected directly if needed
    connection,
    publicKey,
    connected,
  };

  return (
    <SolanaProgramContext.Provider value={contextValue}>
      {children}
    </SolanaProgramContext.Provider>
  );
};

// 3. Custom Hook for easy consumption
export const useSolanaProgram = () => {
  const context = useContext(SolanaProgramContext);
  if (context === undefined) {
    throw new Error('useSolanaProgram must be used within a SolanaProgramProvider');
  }
  return context;
};
