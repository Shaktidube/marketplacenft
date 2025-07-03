use anchor_lang::prelude::*;

pub mod instructions;
pub mod error;

use instructions::buysell::*;
use instructions::metadata::*;
use instructions::mint::*;
use instructions::auction::*;
declare_id!("9U1c1CFEyEgEjbrxFcbAymjb4sf8VjiYhm4rYD8Zzszf");

#[program]
pub mod marketplacenft {

    use crate::instructions::{auction, buysell, metadata, mint};

    use super::*;

    pub fn create_mint(_ctx: Context<MintAccount>) -> Result<()> {
        mint::create_mint(_ctx)?;
        Ok(())
    }

    pub fn mint_to(_ctx: Context<MintTokesTo>, _amount: u64) -> Result<()> {
        let _ = mint::mint_to(_ctx, _amount);
        Ok(())
    }

    pub fn nft_account(_ctx: Context<NftAccount>) -> Result<()> {
        mint::nft_account(_ctx)?;
        Ok(())
    }

    pub fn mint_to_nft(_ctx: Context<NftMintTo>) -> Result<()> {
        mint::mint_to_nft(_ctx)?;
        Ok(())
    }

    pub fn create_metadata(
        _ctx: Context<MetadataAcc>,
        _token_name: String,
        _token_symbol: String,
        _token_uri: String,
        _royalty: u16,
        _creators: Option<Vec<CreatorInput>>,
        _collection_mint: Option<Pubkey>,
        _collection_verified: Option<bool>,
    ) -> Result<()> {
        metadata::create_metadata(_ctx, _token_name, _token_symbol, _token_uri, _royalty, _creators, _collection_mint, _collection_verified)?;
        Ok(())
    }

    pub fn verify_collection(ctx: Context<VerifyCollectionContext>) -> Result<()> {
        metadata::verify_collection(ctx)?;
        Ok(())
    }

    pub fn master_edition(_ctx: Context<MasterEdition>, _max_supply: Option<u64>) -> Result<()> {
        metadata::master_edition(_ctx, _max_supply)?;
        Ok(())
    }
    pub fn create_listing(ctx: Context<CreateListing>, price: u64) -> Result<()> {
        buysell::create_listing(ctx, price)?;   
        Ok(())
    }
    pub fn cancel_listing(ctx: Context<CloseListing>) -> Result<()> {
        buysell::cancel_listing(ctx)?;
        Ok(())
    }
    pub fn create_auction(ctx:Context<StartAuction>,start_time:i64, bid_start_from:u64, duration:i64) -> Result<()> {
        auction::create_auction(ctx, start_time, bid_start_from, duration)
    }

    pub fn place_bid<'info>(ctx:Context<'_, '_, '_, 'info,PlaceBid<'info>>,bid_amount : u64) -> Result<()> {
        auction::place_bid(ctx, bid_amount)?;
        Ok(())
    }

    pub fn cancel_auction(ctx:Context<CancelAuction>) -> Result<()>{
        auction::cancel_auction(ctx)?;
        Ok(())
    }
    pub fn winner_nft<'info>(ctx:Context<'_, '_, '_, 'info,WinnerNft<'info>>) -> Result<()>{
        auction::winner_nft(ctx)?;
        Ok(())
    }
    pub fn resolve_auction<'info>(ctx:Context<'_, '_, '_, 'info,WinnerNft<'info>>) -> Result<()>{
        auction::resolve_auction(ctx)?;
        Ok(())
    }
    
    pub fn buy_nft<'info>(ctx: Context<'_, '_, '_, 'info, BuyNft<'info>>) -> Result<()> {
        buysell::buy_nft(ctx)?;
        Ok(())
    }

    // pub fn initialize_auction_pda(_ctx: Context<InitializeAuctionPda>) -> Result<()> {
    //     auction::initialize_auction_pda(_ctx)?;
    //     Ok(())
    // }
    // pub fn initialize_bid_pda(_ctx: Context<InitializeBidPda>) -> Result<()> {
    //     auction::initialize_bid_pda(_ctx)?;
    //     Ok(())
    // }
    pub fn initialize_pda(_ctx: Context<InitializePda>) -> Result<()> {
        buysell::initialize_pda(_ctx)?;
        Ok(())
    }
}
