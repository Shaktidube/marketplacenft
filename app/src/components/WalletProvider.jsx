import React, { useMemo } from 'react';
import {
  ConnectionProvider,
  WalletProvider
} from '@solana/wallet-adapter-react';
import {
  SolflareWalletAdapter
} from '@solana/wallet-adapter-wallets';
import {
  WalletModalProvider
} from '@solana/wallet-adapter-react-ui';
import '@solana/wallet-adapter-react-ui/styles.css';

export const WalletConnectionProvider = ({ children }) => {
  console.log("WalletConnectionProvider is rendering.");

  const endpoint = useMemo(() => 'https://api.devnet.solana.com', []);
  const wallets = useMemo(() => [
    new SolflareWalletAdapter(),
  ], []);

  console.log("Wallets being provided:", wallets);

  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>{children}</WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
};