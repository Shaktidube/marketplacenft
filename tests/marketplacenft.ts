import * as anchor from "@coral-xyz/anchor"; // Changed from anchor1 to anchor
import { Marketplacenft } from "../target/types/marketplacenft";
import {
  getAssociatedTokenAddress,
  getAccount,
  createAssociatedTokenAccountInstruction,
  CpiGuardLayout,
  createMintToInstruction,
} from "@solana/spl-token";
import {
  ASSOCIATED_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
} from "@coral-xyz/anchor/dist/cjs/utils/token";
import {
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
} from "@solana/web3.js";
import { createUmi } from "@metaplex-foundation/umi-bundle-defaults";
import { irysUploader } from "@metaplex-foundation/umi-uploader-irys";
import {
  createGenericFile,
  keypairIdentity,
  publicKey,
  some,
} from "@metaplex-foundation/umi";
import {
  mplTokenMetadata,
  fetchDigitalAsset,
  findMetadataPda,
  MPL_TOKEN_METADATA_PROGRAM_ID,
  fetchMetadataFromSeeds,
} from "@metaplex-foundation/mpl-token-metadata";
import fs, { readFileSync } from "fs";

describe("create token account", () => {
  const provider = anchor.AnchorProvider.env();
  provider.opts.commitment = "confirmed";

  const walletKeypair = JSON.parse(readFileSync("keys/keypair.json", "utf-8"))
  console.log("secret",walletKeypair);

  const accountOneKeypair = JSON.parse(readFileSync("keys/accountOne.json", "utf-8"))
  console.log("accountOneKeypair",accountOneKeypair);

  const accountTwoKeypair = JSON.parse(readFileSync("keys/accountTwo.json", "utf-8"))
  console.log("secret",accountTwoKeypair);


  const connection = provider.connection;
  anchor.setProvider(provider);

  const program = anchor.workspace
    .marketplacenft as anchor.Program<Marketplacenft>;

  const wallet = provider.wallet;
  console.log("wallet add", wallet.publicKey.toBase58());
  
  const umi = createUmi(connection.rpcEndpoint, {
    commitment: "confirmed",
  });

  const mintKeypair = Keypair.generate();
  // console.log(mintKeypair)

  const mintNFTKeypair = Keypair.generate();
  console.log("nft keypair", mintKeypair.publicKey);

  const mintNFTCollectionKeypair = Keypair.generate();
  console.log(mintKeypair);

  it("Create an SPL Token!", async () => {

    const mint = await program.methods
      .createMint()
      .accounts({
        signer: wallet.publicKey,
        mint: mintKeypair.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .instruction();

    const tx = new Transaction().add(mint);
    await provider.sendAndConfirm(tx, [mintKeypair]);

    console.log(`mint address ${mintKeypair.publicKey}`);
    console.log(`✅ fungible Token account created successfully ✅`);
  });

  it("Create an collection NFT", async () => {

    const mint = await program.methods
      .nftAccount()
      .accounts({
        signer: wallet.publicKey,
        mint: mintNFTCollectionKeypair.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .instruction();

    const tx = new Transaction().add(mint);
    await provider.sendAndConfirm(tx, [mintNFTCollectionKeypair]);

    console.log(`mint address ${mintNFTCollectionKeypair.publicKey}`);
    console.log(`✅ NFT collection created successfully ✅`);
  });

  it("Create an NFT", async () => {

    const mint = await program.methods
      .nftAccount()
      .accounts({
        signer: wallet.publicKey,
        mint: mintNFTKeypair.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .instruction();

    const tx = new Transaction().add(mint);
    await provider.sendAndConfirm(tx, [mintNFTKeypair]);

    console.log(`mint address ${mintNFTKeypair.publicKey}`);
    console.log(`✅ NFT account created successfully ✅`);
  });

  it("collection metadata added", async () => {
    const privatekey = [
      114, 49, 53, 106, 200, 43, 202, 124, 37, 57, 17, 15, 229, 213, 130, 84,
      161, 232, 108, 207, 147, 76, 213, 136, 205, 209, 143, 194, 142, 192, 90,
      233, 42, 211, 94, 195, 121, 63, 207, 245, 180, 168, 203, 2, 16, 144, 7,
      67, 200, 13, 184, 193, 108, 71, 192, 102, 81, 1, 143, 70, 94, 100, 149,
      38,
    ];

    const signerKeypair = umi.eddsa.createKeypairFromSecretKey(
      new Uint8Array(privatekey)
    );
    console.log("signerkeypair", signerKeypair);

    umi
      .use(keypairIdentity(signerKeypair))
      .use(mplTokenMetadata())
      .use(irysUploader());

    const readFile = fs.readFileSync("./nftTwo.png");

    let file = createGenericFile(readFile, "./nftTwo.png", {
      contentType: "img/png",
    });

    const [imageUri] = await umi.uploader.upload([file]);
    console.log("🔗 img uri : ", imageUri);

    const uri = await umi.uploader.uploadJson({
      name: "SOL",
      symbol: "SOL",
      imageUri,
      description: "MY TOKEN DESCRIPTION",
    });
    console.log("🔗 metadata uri : ", uri);

    const [metadataPda] = findMetadataPda(umi, {
      mint: publicKey(mintKeypair.publicKey),
    });
    console.log(".....");

    const creators = [
      {
        address: provider.publicKey,
        verified: true,
        share: 100,
      },
    ];

    const metadata = await program.methods
      .createMetadata("SOLTOKEN", "SYM", uri, 0, creators, null, null)
      .accounts({
        signer: provider.publicKey,
        mint: mintKeypair.publicKey,
        tokenMetadataProgram: MPL_TOKEN_METADATA_PROGRAM_ID,
      })
      .instruction();

    const tx = new Transaction().add(metadata);

    const collectionMint = mintNFTCollectionKeypair;
    console.log("collection mint : ", collectionMint);

    const metadataNFTCollection = await program.methods
      .createMetadata("SOLCOLL", "SOLS", uri, 5000, creators, null, null)
      .accounts({
        signer: provider.publicKey,
        mint: mintNFTCollectionKeypair.publicKey,
        tokenMetadataProgram: MPL_TOKEN_METADATA_PROGRAM_ID,
      })
      .instruction();

    tx.add(metadataNFTCollection);

    await provider.sendAndConfirm(tx, []);

    // console.log("metadata ",metadata)
    console.log("💯 metadata added 💯");
  });

  it("Mint NFT collection in your wallet", async () => {

    const ata = await getAssociatedTokenAddress(
      mintNFTCollectionKeypair.publicKey,
      wallet.publicKey
    );

    const ataAccountInfo = await connection.getAccountInfo(ata);
    const tx = new Transaction();

    if (ataAccountInfo === null) {
      const createAta = createAssociatedTokenAccountInstruction(
        wallet.publicKey,
        ata,
        wallet.publicKey,
        mintNFTCollectionKeypair.publicKey,
        TOKEN_PROGRAM_ID,
        ASSOCIATED_PROGRAM_ID
      );
      tx.add(createAta);
    }

    const mintTo = await program.methods
      .mintToNft()
      .accounts({
        signer: wallet.publicKey,
        mint: mintNFTCollectionKeypair.publicKey,
        tokenAccount: ata,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .instruction();

    tx.add(mintTo);

    console.log(`✅ NFT collection minted ✅`);
    console.log(
      ` NFT : https://explorer.solana.com/address/${mintNFTCollectionKeypair.publicKey.toBase58()}?cluster=devnet`
    );

    const masterEdition = await program.methods
      .masterEdition(new anchor.BN(0))
      .accounts({
        signer: wallet.publicKey,
        mint: mintNFTCollectionKeypair.publicKey,
        tokenMetadataProgram: MPL_TOKEN_METADATA_PROGRAM_ID,
      })
      .instruction();

    tx.add(masterEdition);
    await provider.sendAndConfirm(tx);
  });

  it("metadata added", async () => {

    const privatekey = [
      52, 14, 97, 216, 249, 235, 139, 38, 60, 5, 93, 109, 16, 132, 25, 100, 204,
      89, 211, 87, 189, 207, 8, 242, 46, 36, 210, 157, 121, 215, 214, 161, 47,
      224, 131, 194, 14, 180, 191, 32, 184, 234, 89, 91, 115, 170, 166, 27, 140,
      189, 87, 166, 161, 133, 115, 254, 232, 93, 89, 132, 60, 175, 146, 173,
    ];

    const signerKeypair = umi.eddsa.createKeypairFromSecretKey(
      new Uint8Array(privatekey)
    );

    umi
      .use(keypairIdentity(signerKeypair))
      .use(mplTokenMetadata())
      .use(irysUploader());

    const readFile = fs.readFileSync("./nftTwo.png");

    let file = createGenericFile(readFile, "./nftTwo.png", {
      contentType: "img/png",
    });

    const [imageUri] = await umi.uploader.upload([file]);
    console.log("🔗 img uri : ", imageUri);

    const uri = await umi.uploader.uploadJson({
      name: "SOL",
      symbol: "SOL",
      imageUri,
      description: "MY TOKEN DESCRIPTION",
    });
    console.log("🔗 metadata uri : ", uri);

    const creators = [
      {
        address: provider.publicKey,
        verified: true,
        share: 50,
      },
      {
        address: new PublicKey("11111111111111111111111111111113"),
        verified: false,
        share: 50,
      },
    ];

    const tx = new Transaction();

    const metadataNFT = await program.methods
      .createMetadata(
        "SOLNFT",
        "SOLS",
        uri,
        9000,
        creators,
        mintNFTCollectionKeypair.publicKey,
        false
      )
      .accounts({
        signer: provider.publicKey,
        mint: mintNFTKeypair.publicKey,
        tokenMetadataProgram: MPL_TOKEN_METADATA_PROGRAM_ID,
      })
      .instruction();

    tx.add(metadataNFT);

    await provider.sendAndConfirm(tx);

    console.log("💯 metadata added 💯");
  });

  it("mint tokens in your wallet", async () => {

    const ata = await getAssociatedTokenAddress(
      mintKeypair.publicKey,
      wallet.publicKey
    );

    const ataAccountInfo = await connection.getAccountInfo(ata);
    const tx = new Transaction();
    if (ataAccountInfo === null) {
      const createAta = createAssociatedTokenAccountInstruction(
        wallet.publicKey,
        ata,
        wallet.publicKey,
        mintKeypair.publicKey,
        TOKEN_PROGRAM_ID,
        ASSOCIATED_PROGRAM_ID
      );
      tx.add(createAta);

    }

    const mintTo = await program.methods
      .mintTo(new anchor.BN(15000000000))
      .accounts({
        signer: wallet.publicKey,
        mint: mintKeypair.publicKey,
        tokenAccount: ata,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .instruction();

    tx.add(mintTo);
    await provider.sendAndConfirm(tx);

    console.log(`✅ Fungible token minted ✅`);
    console.log(
      `fungible token : https://explorer.solana.com/address/${mintKeypair.publicKey.toBase58()}?cluster=devnet`
    );
  });

  it("Mint NFT in your wallet", async () => {

    const ata = await getAssociatedTokenAddress(
      mintNFTKeypair.publicKey,
      wallet.publicKey
    );

    const ataAccountInfo = await connection.getAccountInfo(ata);

    const tx = new Transaction();

    if (ataAccountInfo === null) {
       const createAta = createAssociatedTokenAccountInstruction(
        wallet.publicKey,
        ata,
        wallet.publicKey,
        mintNFTKeypair.publicKey,
        TOKEN_PROGRAM_ID,
        ASSOCIATED_PROGRAM_ID
      );

      tx.add(createAta);

    }

    const mintTo = await program.methods
      .mintToNft()
      .accounts({
        signer: wallet.publicKey,
        mint: mintNFTKeypair.publicKey,
        tokenAccount: ata,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .instruction();

    tx.add(mintTo);

    console.log(`✅ NFT collection minted ✅`);
    console.log(
      ` NFT : https://explorer.solana.com/address/${mintNFTKeypair.publicKey.toBase58()}?cluster=devnet`
    );

    const masterEdition = await program.methods
      .masterEdition(null)
      .accounts({
        signer: wallet.publicKey,
        mint: mintNFTKeypair.publicKey,
        tokenMetadataProgram: MPL_TOKEN_METADATA_PROGRAM_ID,
      })
      .instruction();

    tx.add(masterEdition);
    await provider.sendAndConfirm(tx);
  });

  it.skip('create listing', async () => {

    const mintNFTKeypair = new PublicKey("D7UXNLoyCt6p6QXp7f9DcFJW2RiHLRqYiX87DQBpKYTH");

    // const wallet = Keypair.fromSecretKey(new Uint8Array(accountOneKeypair));

    const tx = new Transaction();

    const [listingPda] = await PublicKey.findProgramAddress(
      [Buffer.from("listing"), mintNFTKeypair.toBuffer()],
      program.programId
    );

    const accountInfo = await connection.getAccountInfo(listingPda);
    console.log("listing pda : ", accountInfo);

    const escrowAta = await getAssociatedTokenAddress(
      mintNFTKeypair,
      listingPda,
      true,
    );
    console.log("escrow ata", escrowAta)

    const sellerAta = await getAssociatedTokenAddress(
      mintNFTKeypair,
      wallet.publicKey
    )
    console.log("seller ata", sellerAta)
    const sellerAccountinfo = await connection.getAccountInfo(sellerAta);

    if (sellerAccountinfo === null) {
      const createSellerAta = createAssociatedTokenAccountInstruction(
        wallet.publicKey,
        sellerAta,
        listingPda,
        mintNFTKeypair
      )
      tx.add(createSellerAta);
    }
    console.log("listing....")
    const createListing = await program.methods.createListing(new anchor.BN(2_000_000_000))
      .accounts({
        seller: wallet.publicKey,
        mint: mintNFTKeypair,
        tokenProgram: TOKEN_PROGRAM_ID
      }).instruction()

    tx.add(createListing);
    await provider.sendAndConfirm(tx);

    console.log("✅ NFT listed successfully. Tx:");

    const sellerAccountInfo = await getAccount(connection, sellerAta);
    const escrowAccountInfo = await getAccount(connection, escrowAta);

    console.log("seller account amount : ", sellerAccountInfo.amount);
    console.log("escrow account amount : ", escrowAccountInfo.amount);

    try {
      const escrowAccountInfo = await getAccount(connection, escrowAta);

      if (escrowAccountInfo.amount === BigInt(1)) {
        console.log("✅ Your NFT is goes in escrow account");
      } else {
        console.log("NFT is not in escrow account");
      }

    } catch (error) {
      throw error;
    }

  });

  // it('cancel listing', async () => {

  //   const mintNFTKeypair = new PublicKey("4y74sEZtkqop4ph5EgAUBr2CDKdS1AfzHZEv7wH4PJZd");

  //   const [listingPda] = await PublicKey.findProgramAddress(
  //     [Buffer.from("listing"), mintNFTKeypair.toBuffer()],
  //     program.programId
  //   );

  //   const [escrowAtaPda, escrowBump] = await PublicKey.findProgramAddress(
  //     [
  //       Buffer.from("escrow"),
  //       listingPda.toBuffer(),
  //      mintNFTKeypair.toBuffer(),
  //     ],
  //     program.programId
  //   );

  //   const escrowAta = await getAssociatedTokenAddress(
  //     mintNFTKeypair,
  //     listingPda,
  //     true,
  //   );

  //   const sellerAta = await getAssociatedTokenAddress(
  //     mintNFTKeypair,
  //     wallet.publicKey
  //   )

  //   const cancelListingTx = await program.methods.cancelListing().accounts({
  //     seller: wallet.publicKey,
  //     mint: mintNFTKeypair,
  //     tokenProgram: TOKEN_PROGRAM_ID,
  //   }).instruction();

  //   const tx = new Transaction().add(cancelListingTx);
  //   const sig = await provider.sendAndConfirm(tx, []);

  //   console.log("✅ Cancelled listing. Tx:");

  //   const listingAccount = await connection.getAccountInfo(listingPda);
  //   if (listingAccount === null) {
  //     console.log("✅ Listing PDA is closed");
  //   } else {
  //     console.log("❌ Listing PDA still exists");
  //   }

  //   const sellerAccountInfo = await getAccount(connection, sellerAta);
  //   const escroeAccountInfo = await getAccount(connection, escrowAta);

  //   console.log("seller account nft amount", sellerAccountInfo.amount);
  //   console.log("escrow account nft amount", escroeAccountInfo.amount);

  // });

  it.skip(' buy nft ', async () => {

    const mintNFTKeypair = new PublicKey("D7UXNLoyCt6p6QXp7f9DcFJW2RiHLRqYiX87DQBpKYTH");

    const tx = new Transaction();

    const buyerKeypair = Keypair.fromSecretKey(new Uint8Array(accountTwoKeypair));

    const [listingPda] = await PublicKey.findProgramAddress(
      [Buffer.from("listing"), mintNFTKeypair.toBuffer()],
      program.programId
    );

    const listingAccount = await program.account.listing.fetch(listingPda);

    const price = listingAccount.price as anchor.BN;
    // console.log("listing price ",price.toString());

    const buyerSolBalance = await connection.getBalance(buyerKeypair.publicKey);
    const buyerSolBalanceBN = new anchor.BN(buyerSolBalance);

    // console.log("buyer balance : ",buyerSolBalanceBN);
    if (buyerSolBalanceBN.lt(price)) {
      throw new Error("buyer has insufficient sol");
    }

    const pdaAccountInfo = await connection.getAccountInfo(listingPda);
    if (!pdaAccountInfo) {
      console.log("NFT IS NOT PRESENT")
    }

    const [escrowAtaPda, escrowBump] = await PublicKey.findProgramAddress(
      [
        Buffer.from("escrow"),
        listingPda.toBuffer(),
        mintNFTKeypair.toBuffer(),
      ],
      program.programId
    );

    const escrowAta = await getAssociatedTokenAddress(
      mintNFTKeypair,
      listingPda,
      true,
    );

    const escrowAccountinfo = await connection.getAccountInfo(escrowAta);

    if (escrowAccountinfo === null) {
      console.log("make ata.....");
      const createEscrowAta = createAssociatedTokenAccountInstruction(
        buyerKeypair.publicKey,
        escrowAta,
        buyerKeypair.publicKey,
        mintNFTKeypair
      )
      console.log("createEscrowAta");
      tx.add(createEscrowAta);
      // await provider.sendAndConfirm(tx,[buyerKeypair]);
    }

    console.log("escrow account", escrowAta);

    const sellerAta = await getAssociatedTokenAddress(
      mintNFTKeypair,
      wallet.publicKey
    )
    console.log("seller ata", sellerAta);


    const buyerAta = await getAssociatedTokenAddress(
      mintNFTKeypair,
      buyerKeypair.publicKey
    )
    console.log("buyer ata", buyerAta);


    const buyerAccountinfo = await connection.getAccountInfo(buyerAta);

    if (buyerAccountinfo === null) {
      console.log(".....");
      const createBuyerAta = createAssociatedTokenAccountInstruction(
        buyerKeypair.publicKey,
        buyerAta,
        buyerKeypair.publicKey,
        mintNFTKeypair
      )
      tx.add(createBuyerAta);
      // await provider.sendAndConfirm(tx,[buyerKeypair]);
    }
    
    const asset = await fetchDigitalAsset(umi, publicKey(mintNFTKeypair));
    console.log(asset.metadata.name);
    // console.log(asset);

    const buyerBalance = await connection.getBalance(buyerKeypair.publicKey);
    console.log("buyer balance : ", buyerBalance);

    const creators = asset.metadata?.creators;
    let remainingAccounts: { pubkey: PublicKey; isWritable: boolean; isSigner: boolean; }[] = [];

    if (asset.metadata.creators.__option == "Some") {
      const creators = asset.metadata.creators.value;
      remainingAccounts = creators.map((creator) => ({
        pubkey: new PublicKey(creator.address.toString()),
        isWritable: true,
        isSigner: false,
      }));
    }
    
    const buyNft = await program.methods.buyNft().accounts({
      seller: wallet.publicKey,
      buyer: buyerKeypair.publicKey,
      mint: mintNFTKeypair,
      tokenProgram: TOKEN_PROGRAM_ID,
    }).remainingAccounts(remainingAccounts).instruction();
    
    tx.add(buyNft);
    console.log("/......./");
    await provider.sendAndConfirm(tx, [buyerKeypair]);
    
    console.log("creators get Royalty ✅");

    console.log("✅ NFT PURCHASED ✅")
  })

  it.skip("create auction", async () => {
    const mintNFTKeypair  = new PublicKey("8yezVNqw13ueNDpQjFnrZhoF9yhEW3ke8RT8GUSgAj92");

    // for seller ----------------------------------------------
    const newWalletKeypair = umi.eddsa.createKeypairFromSecretKey(
      new Uint8Array(accountOneKeypair)
    );
    // const wallet = Keypair.fromSecretKey(new Uint8Array(accountTwoKeypair));

    const tx = new Transaction();

    const [auctionPda] = await PublicKey.findProgramAddress(
      [Buffer.from("auction"), mintNFTKeypair.toBuffer()],
      program.programId
    );

    const sellerAta = await getAssociatedTokenAddress(
      mintNFTKeypair,
      wallet.publicKey,
      true
    );
    console.log("seller ata", sellerAta);
    const sellerAccountinfo = await connection.getAccountInfo(sellerAta);

    if (sellerAccountinfo === null) {
      const createSellerAta = createAssociatedTokenAccountInstruction(
        wallet.publicKey,
        sellerAta,
        wallet.publicKey,
        mintNFTKeypair
      );
      tx.add(createSellerAta);
    }

    const startTime = new anchor.BN(1751891830);
    console.log("start time : ", startTime.toString());

    const initialPrice = new anchor.BN(100000000);

    const duration = new anchor.BN(250);
    console.log("auction duration : ", duration.toString());

    const EndTime = startTime.add(duration);
    console.log(" auction end time : ", EndTime.toString());

    const createAuction = await program.methods
      .createAuction(startTime, initialPrice, duration)
      .accounts({
        seller: wallet.publicKey,
        nftMint: mintNFTKeypair,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .instruction();

    tx.add(createAuction);
    await provider.sendAndConfirm(tx,[]);

    console.log("✅ auction created ");
    console.log("Auction initial price");
  });

  it.skip("first bid", async () => {
    const mintNFTKeypair  = new PublicKey("8yezVNqw13ueNDpQjFnrZhoF9yhEW3ke8RT8GUSgAj92");
  

    const signerKeypair = umi.eddsa.createKeypairFromSecretKey(
      new Uint8Array(accountOneKeypair)
    );

    const buyerKeypair = Keypair.fromSecretKey(new Uint8Array(accountOneKeypair));

    const tx = new Transaction();

    const [bidPda] = await PublicKey.findProgramAddress(
      [Buffer.from("escrow"), mintNFTKeypair.toBuffer()],
      program.programId
    );
    console.log("bid_pda : ", bidPda.toBase58());

    const [auctionPda] = await PublicKey.findProgramAddress(
      [Buffer.from("auction"), mintNFTKeypair.toBuffer()],
      program.programId
    );
    const accountInfo = await connection.getAccountInfo(bidPda);
    console.log("asdf", accountInfo);

    const escrowAta = await getAssociatedTokenAddress(
      mintNFTKeypair,
      bidPda,
      true
    );
    console.log("escrow ata", escrowAta);

    const escrowAccountinfo = await connection.getAccountInfo(escrowAta);

    console.log("......");

    const auctionAcc = await program.account.auction.fetch(auctionPda);
    console.log(auctionAcc.highestBidder);

    const prevHighestBidder = auctionAcc.highestBidder;

    const remainingAccounts = [
      { pubkey: prevHighestBidder, isWritable: true, isSigner: false },
    ];

    const makeBid = await program.methods
      .placeBid(new anchor.BN(1000000000))
      .accounts({
        bidder: buyerKeypair.publicKey,
        nftMint: mintNFTKeypair,
      })
      .remainingAccounts(remainingAccounts)
      .instruction();

    tx.add(makeBid);
    await provider.sendAndConfirm(tx, [buyerKeypair]);

    const bidPdaBalance = await connection.getBalance(bidPda);
    console.log("bid_pda Balance:", bidPdaBalance, "SOL");

    const bidderBalance = await connection.getBalance(buyerKeypair.publicKey);
    console.log("bidder Balance:", bidderBalance, "SOL");

    console.log("✅ First Bid Accepted");
  });

  it.skip("second bid", async () => {
    const mintNFTKeypair  = new PublicKey("8yezVNqw13ueNDpQjFnrZhoF9yhEW3ke8RT8GUSgAj92");

    const firstBidderbalance = new PublicKey(
      "3U7nN2s3SJ4MZyL52cYPrmoVtCEMxbLef2UKne9nQJHL"
    );

    const buyerKeypair = Keypair.fromSecretKey(new Uint8Array(accountTwoKeypair));

    const tx = new Transaction();

    const [bidPda] = await PublicKey.findProgramAddress(
      [Buffer.from("escrow"), mintNFTKeypair.toBuffer()],
      program.programId
    );
    console.log("bid_pda : ", bidPda.toBase58());

    console.log("Program ID:", program.programId.toBase58());

    const [auctionPda] = await PublicKey.findProgramAddress(
      [Buffer.from("auction"), mintNFTKeypair.toBuffer()],
      program.programId
    );

    console.log("auction pda : ", auctionPda);
    // console.log("bid pda : ", bidPda);

    const escrowAta = await getAssociatedTokenAddress(
      mintNFTKeypair,
      bidPda,
      true
    );

    console.log("......");

    const auctionAcc = await program.account.auction.fetch(auctionPda);
    console.log("highestBidder : ", auctionAcc.highestBidder);

    const prevHighestBidder = auctionAcc.highestBidder;

    const remainingAccounts = [
      { pubkey: prevHighestBidder, isWritable: true, isSigner: false },
    ];

    const makeBid = await program.methods
      .placeBid(new anchor.BN(2000000000))
      .accounts({
        bidder: buyerKeypair.publicKey,
        nftMint: mintNFTKeypair,
      })
      .remainingAccounts(remainingAccounts)
      .instruction();

    tx.add(makeBid);
    await provider.sendAndConfirm(tx, [buyerKeypair]);

    const firstBidderGetBalance = await connection.getBalance(
      firstBidderbalance
    );
    console.log("first bidder Balance:", firstBidderGetBalance, "SOL");

    const bidPdaBalance = await connection.getBalance(bidPda);
    console.log("bid_pda Balance:", bidPdaBalance, "SOL");

    console.log("✅ second Bid Accepted");
  });

  it.skip('cancel auction', async () => {

    const mintNFTKeypair = new PublicKey(
      "8yezVNqw13ueNDpQjFnrZhoF9yhEW3ke8RT8GUSgAj92"
    );

    // const wallet = Keypair.fromSecretKey(new Uint8Array(accountTwoKeypair));


    const tx = new Transaction();

    const [auctionPda] = await PublicKey.findProgramAddress(
      [Buffer.from("auction"), mintNFTKeypair.toBuffer()],
      program.programId
    );

    const escrowAta = await getAssociatedTokenAddress(
      mintNFTKeypair,
      auctionPda,
      true,
    );

    const sellerAta = await getAssociatedTokenAddress(
      mintNFTKeypair,
      wallet.publicKey
    )

    const cancelListingTx = await program.methods.cancelAuction().accounts({
      seller: wallet.publicKey,
      mint: mintNFTKeypair,
      tokenProgram: TOKEN_PROGRAM_ID,
    }).instruction();

    tx.add(cancelListingTx);
    console.log("......//......");
    await provider.sendAndConfirm(tx);

    console.log("✅ Cancelled listing. Tx:");

    const listingAccount = await connection.getAccountInfo(auctionPda);
    if (listingAccount === null) {
      console.log("✅ Listing PDA is closed");
    } else {
      console.log("❌ Listing PDA still exists");
    }

  });

  it.skip(" winner nft ", async () => {
     const mintNFkeypair = new PublicKey(
      "8yezVNqw13ueNDpQjFnrZhoF9yhEW3ke8RT8GUSgAj92"
    );

    const tx = new Transaction();

    const signerKeypair = umi.eddsa.createKeypairFromSecretKey(
      new Uint8Array(accountTwoKeypair)
    );

    const buyerKeypair = Keypair.fromSecretKey(new Uint8Array(accountTwoKeypair));

    const buyerPublickey = signerKeypair.publicKey;
    console.log("buyer pub key : ", buyerPublickey);

    const [auctionPda] = await PublicKey.findProgramAddress(
      [Buffer.from("auction"), mintNFkeypair.toBuffer()],
      program.programId
    );


    const auctionAccount = await program.account.auction.fetch(auctionPda);

    const price = auctionAccount.currentBid as anchor.BN;
    console.log("Highest bid", price.toString());

    const buyerSolBalance = await connection.getBalance(buyerKeypair.publicKey);
    const buyerSolBalanceBN = new anchor.BN(buyerSolBalance);

    if (buyerSolBalanceBN.lt(price)) {
      throw new Error("buyer has insufficient sol");
    }

    const pdaAccountInfo = await connection.getAccountInfo(auctionPda);
    if (!pdaAccountInfo) {
      console.log("NFT IS NOT PRESENT");
    }

    const [escrowAtaPda, escrowBump] = await PublicKey.findProgramAddress(
      [Buffer.from("escrow"), auctionPda.toBuffer(), mintNFkeypair.toBuffer()],
      program.programId
    );
    console.log("escrow pds", escrowAtaPda);

    const escrowAta = await getAssociatedTokenAddress(
      mintNFkeypair,
      auctionPda,
      true
    );

    console.log("escrow account", escrowAta);

    const sellerAta = await getAssociatedTokenAddress(
      mintNFkeypair,
      wallet.publicKey
    );
    console.log("seller ata", sellerAta);

    const buyerAta = await getAssociatedTokenAddress(
      mintNFkeypair,
      new PublicKey(buyerPublickey)
    );
    console.log("buyer ata", buyerAta);

    const buyerAccountinfo = await connection.getAccountInfo(buyerAta);

    if (buyerAccountinfo === null) {
      console.log(".....");
      const createBuyerAta = createAssociatedTokenAccountInstruction(
        new PublicKey(buyerPublickey),
        buyerAta,
        new PublicKey(buyerPublickey),
        mintNFkeypair
      );
      tx.add(createBuyerAta);
      // await provider.sendAndConfirm(tx,[buyerKeypair]);
    }
    
    const asset = await fetchDigitalAsset(umi, publicKey(mintNFkeypair));
    console.log(asset.metadata.name);

    const buyerBalance = await connection.getBalance(buyerKeypair.publicKey);
    console.log("bidder balance : ", buyerBalance);

    const creators = asset.metadata?.creators;
    let remainingAccounts: {
      pubkey: PublicKey;
      isWritable: boolean;
      isSigner: boolean;
    }[] = [];

    if (asset.metadata.creators.__option == "Some") {
      const creators = asset.metadata.creators.value;
      remainingAccounts = creators.map((creator) => ({
        pubkey: new PublicKey(creator.address.toString()),
        isWritable: true,
        isSigner: false,
      }));
    }
    console.log("........");
    const buyNft = await program.methods
      .winnerNft()
      .accounts({
        seller: wallet.publicKey,
        bidder: buyerKeypair.publicKey,
        signer:buyerKeypair.publicKey,
        mint: mintNFkeypair,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .remainingAccounts(remainingAccounts)
      .instruction();

    tx.add(buyNft);
    console.log("........");
    await provider.sendAndConfirm(tx, [buyerKeypair]);

    console.log("creators get Royalty ✅");

    const bidPdaBalance = await connection.getBalance(escrowAtaPda);
    console.log("bid_pda Balance:", bidPdaBalance, "SOL");

    console.log("✅ Winnner claimed NFT ✅");
  });

  it("verify collection", async () => {
    const mintNFTPublickey = new PublicKey(
      "4y74sEZtkqop4ph5EgAUBr2CDKdS1AfzHZEv7wH4PJZd"
    );
    const mintColletionPublickey = new PublicKey(
      "FA2bEXcZNEQTY4GkfbrRf9XwvgGmZkCs3pFx3Tvj5hWZ"
    );

    const provider = anchor.AnchorProvider.env();
    anchor.setProvider(provider);

    const wallet = provider.wallet;
    // console.log("wallet add", wallet);
    const connection = provider.connection;
    const umi = createUmi(provider.connection.rpcEndpoint, {
      commitment: "confirmed",
    });
    try {
      const tx = new Transaction();
      const collectionMetadataUmi = findMetadataPda(umi, {
        mint: publicKey(mintColletionPublickey),
      })[0];

      const verifyCollection = await program.methods
        .verifyCollection()
        .accounts({
          collectionAuthority: wallet.publicKey,
          payer: wallet.publicKey,
          nftMint: mintNFTPublickey,
          collectionMint: mintColletionPublickey,
        })
        .instruction();

      tx.add(verifyCollection);
      await provider.sendAndConfirm(tx);

      console.log("✅ collection verification");
      // console.log(verifyCollection)
    } catch (error) {
      throw error;
    }
  });
});
