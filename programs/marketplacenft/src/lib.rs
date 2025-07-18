use anchor_lang::prelude::*;

pub mod error;
pub mod instructions;

use instructions::auction::*;
use instructions::buysell::*;
use instructions::metadata::*;
use instructions::mint::*;
declare_id!("BCv1qw46pgwDujHu9TCNCqvnRmsToBYgqfEk3W58qsRH");

#[program]
pub mod marketplacenft {

    use crate::instructions::{auction, buysell, metadata, mint};

    use super::*;

    pub fn mint_to(_ctx: Context<MintAndMintTo>, _amount: u64) -> Result<()> {
        mint::mint_to(_ctx, _amount)?;
        Ok(())
    }

    pub fn mint_to_nft(
        _ctx: Context<NftMintTo>,
        name: String,
        symbol: String,
        uri: String,
        royalty: u16,
        creators_input: Option<Vec<CreatorInput>>,
        collection_mint: Option<Pubkey>,
        collection_verified: Option<bool>,
        max_supply: Option<u64>,
    ) -> Result<()> {
        mint::mint_to_nft(_ctx,name, symbol, uri, royalty, creators_input, collection_mint, collection_verified,max_supply)?;
        Ok(())
    }

    pub fn verify_collection(ctx: Context<VerifyCollectionContext>) -> Result<()> {
        metadata::verify_collection(ctx)?;
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
    pub fn create_auction(
        ctx: Context<StartAuction>,
        start_time: i64,
        bid_start_from: u64,
        duration: i64,
    ) -> Result<()> {
        auction::create_auction(ctx, start_time, bid_start_from, duration)
    }

    pub fn place_bid<'info>(
        ctx: Context<'_, '_, '_, 'info, PlaceBid<'info>>,
        bid_amount: u64,
    ) -> Result<()> {
        auction::place_bid(ctx, bid_amount)?;
        Ok(())
    }

    pub fn cancel_auction(ctx: Context<CancelAuction>) -> Result<()> {
        auction::cancel_auction(ctx)?;
        Ok(())
    }
    pub fn winner_nft<'info>(ctx: Context<'_, '_, '_, 'info, WinnerNft<'info>>) -> Result<()> {
        auction::winner_nft(ctx)?;
        Ok(())
    }

    pub fn buy_nft<'info>(ctx: Context<'_, '_, '_, 'info, BuyNft<'info>>) -> Result<()> {
        buysell::buy_nft(ctx)?;
        Ok(())
    }
}
