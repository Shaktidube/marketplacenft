use anchor_lang::prelude::*;

#[derive(Accounts)]
pub struct Auction {
    pub seller : Pubkey,
    pub highest_bidder : Pubkey,
    pub nft_mint : Pubkey,
    pub current_bid : u64,
    pub start_time:i64,
    pub end_time:i64,
    pub minimuim_price : u64,
    pub auction_status : AuctionStatus,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, InitSpace)]
pub enum AuctionStatus{
    Created,
    Ended,
    Active,
    Cancelled
}

#[derive(Accounts)]
pub struct start_auction<'info>{

}

#[derive(Accounts)]
pub struct place_bid<'info>{

}

#[derive(Accounts<'info>)]
pub struct cancel_auction<'info>{

}

pub fun