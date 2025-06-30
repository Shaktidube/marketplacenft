use anchor_lang::{accounts, prelude::*, system_program::Transfer};
use anchor_spl::{
    associated_token::AssociatedToken,
    token_interface::{self, Mint, TokenAccount, TokenInterface, TransferChecked},
};

use crate::{ BuySellErrorCode};

#[account]
#[derive(InitSpace)]
pub struct Auction {
    pub seller : Pubkey,
    pub highest_bidder : Pubkey,
    pub nft_mint : Pubkey,
    pub current_bid : u64,
    pub start_time:i64,
    pub end_time:i64,
    pub satrt_price : u64,
    pub auction_status : AuctionStatus,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, InitSpace)]
pub enum AuctionStatus{
    Created,
    Ended,
    Active,
    Cancelled
}

#[account]
#[derive(InitSpace)]
pub struct Bid {
    pub auction_pda:Pubkey,
    pub bidder:Pubkey,
    pub amount : u64,
}

#[derive(Accounts)]
#[instruction()]
pub struct InitializeAuctionPda<'info> {
    #[account(
        init,
        payer = signer,
        seeds = [b"auction",nft_mint.key().as_ref()],
        bump,
        space = 8 + Auction::INIT_SPACE
    )]
    pub pda: Account<'info, Auction>,

    #[account(
        constraint = nft_mint.decimals == 0 @ BuySellErrorCode::InvalidDecimals,
        constraint = nft_mint.supply == 1 @ BuySellErrorCode::InvalidMint,
    )]
    pub nft_mint: InterfaceAccount<'info, Mint>,

    #[account(mut)]
    pub signer: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction()]
pub struct InitializeBidPda<'info> {
    #[account(
        init,
        payer = bidder,
        seeds = [b"bid",nft_mint.key().as_ref()],
        bump,
        space = 8 + Bid::INIT_SPACE
    )]
    pub bid_pda: Account<'info, Bid>,

    #[account(mut)]
    pub nft_mint: InterfaceAccount<'info, Mint>,

    #[account(mut)]
    pub bidder: Signer<'info>,

    pub system_program: Program<'info, System>,
}


#[derive(Accounts)]
pub struct StartAuction<'info>{
    #[account(mut)]
    pub seller : Signer<'info>,

    #[account(
        mut,
        seeds = [b"auction", nft_mint.key().as_ref()],
        bump 
    )]
    pub auction: Account<'info, Auction>,

    #[account(
        constraint = nft_mint.decimals == 0 @ BuySellErrorCode::InvalidDecimals,
        constraint = nft_mint.supply == 1 @ BuySellErrorCode::InvalidMint,
    )]
    pub nft_mint: InterfaceAccount<'info, Mint>,

    #[account(
        mut,
        // init,
        // payer = seller,
        associated_token::mint = nft_mint,
        associated_token::authority = seller,
        constraint = seller_token_account.amount == 1 @ BuySellErrorCode::InvalidAmount,
    )]
    pub seller_token_account: InterfaceAccount<'info, TokenAccount>,

    #[account(
        mut,
        // init,
        // payer = seller,
        associated_token::mint = nft_mint,
        associated_token::authority = auction,
    )]
    pub escrow_token_account: InterfaceAccount<'info, TokenAccount>,


    pub token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct PlaceBid<'info>{
    #[account(mut)]
    pub bidder: Signer<'info>,
    
    #[account(
        mut,
        seeds = [b"bid",nft_mint.key().as_ref()],
        bump
    )]
    pub bid_pda :Account<'info,Bid>,
    
    #[account(
        mut,
        seeds = [b"auction", nft_mint.key().as_ref()],
        bump,
    )]
    pub auction: Account<'info, Auction>,

    #[account(
        constraint = nft_mint.decimals == 0 @ BuySellErrorCode::InvalidDecimals,
        constraint = nft_mint.supply == 1 @ BuySellErrorCode::InvalidMint,
    )]
    pub nft_mint: InterfaceAccount<'info, Mint>,

    pub clock : Sysvar<'info,Clock>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct CancelAuction<'info>{
    #[account(mut)]
    pub seller: Signer<'info>,

    #[account(
        mut,
        close = seller,
        seeds = [b"auction", mint.key().as_ref()],
        bump,
    )]
    pub auction: Account<'info, Auction>,

    #[account(
        constraint = mint.decimals == 0 @ BuySellErrorCode::InvalidDecimals,
        constraint = mint.supply == 1 @ BuySellErrorCode::InvalidMint,
    )]
    pub mint: InterfaceAccount<'info, Mint>,

    #[account(
        mut,
        associated_token::mint = mint,
        associated_token::authority = seller,
    )]
    pub seller_token_account: InterfaceAccount<'info, TokenAccount>,

    #[account(
        mut,
        associated_token::mint = mint,
        associated_token::authority = auction,
    )]
    pub escrow_token_account: InterfaceAccount<'info, TokenAccount>,

    pub token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}
// startTime  , bid start from ,  duration for auction      
pub fn create_auction(ctx:Context<StartAuction>,start_time:i64,bid_start_from:u64,duration:i64) -> Result<()> {

    let auction = &mut ctx.accounts.auction;

    let auction_end_time = start_time + duration;

    let cpi_ctx = CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            TransferChecked {
                from: ctx.accounts.seller_token_account.to_account_info(),
                to: ctx.accounts.escrow_token_account.to_account_info(),
                authority: ctx.accounts.seller.to_account_info(),
                mint: ctx.accounts.nft_mint.to_account_info(),
            },
        );

        token_interface::transfer_checked(cpi_ctx, 1, ctx.accounts.nft_mint.decimals)?;

    auction.start_time = start_time;
    auction.end_time = auction_end_time;
    auction.satrt_price = bid_start_from;
    auction.auction_status = AuctionStatus::Active;
    auction.seller = ctx.accounts.seller.key();
    auction.current_bid = 0;
    auction.highest_bidder = Pubkey::default(); 
    auction.nft_mint = ctx.accounts.nft_mint.key();

    Ok(())
}

pub fn place_bid<'info>(ctx:Context<'_, '_, '_, 'info,PlaceBid<'info>>,bid_amount:u64) -> Result<()>{

    let auciton = &mut ctx.accounts.auction;
    let current_timestamp =  ctx.accounts.clock.unix_timestamp;
    let bid_account = &mut ctx.accounts.bid_pda;

    // let prev_highest_bidder = auciton.highest_bidder;
    // let prev_highest_bid = auciton.current_bid;
    require!(current_timestamp <= auciton.end_time , AuctionErrorCode::AuctionTimeOver);
    require!(bid_amount >= auciton.current_bid , AuctionErrorCode::BidNotValid);

    if auciton.current_bid == 0 {
        // intilize bid
        require!(current_timestamp >= auciton.start_time, AuctionErrorCode::AuctionTimeOver);
        require!(bid_amount >= auciton.satrt_price , AuctionErrorCode::BidNotValid );
    } else {
        // handle 2nd bid 
        let mint_nft: Pubkey = ctx.accounts.nft_mint.key();

        let remaining = &ctx.remaining_accounts;
        // require!(remaining.len() == 1, AuctionErrorCode::MissingRemainingAccounts);

        let prev_highest_bidder = &remaining[0]; 
        // let prev_highest_bidder = bid_account.bidder;

        require!(current_timestamp <= auciton.end_time , AuctionErrorCode::AuctionTimeOver);
        // require!(ctx.accounts.bidder.key() != auciton.highest_bidder , AuctionErrorCode::CurrentBidderIsNotValid);
        require!( bid_amount > auciton.current_bid , AuctionErrorCode::CurrentBisIsNotValid );

        // require!(auciton.highest_bidder == ctx.accounts.prev_highest_bidder.key(), AuctionErrorCode::PreviousBidderMismatch);
        let bid_pda_seeds = &[
                b"bid",
                mint_nft.as_ref(),
                &[ctx.bumps.bid_pda],
            ];
            let signer_seeds_arr: &[&[&[u8]]] = &[bid_pda_seeds];
        // refund prev bidder 
        let cpi_accounts = Transfer{
            from:bid_account.to_account_info(),
            to:prev_highest_bidder.to_account_info(),
        };

        // transfer new bid to bid pda
        let cpi_program = ctx.accounts.system_program.to_account_info();

        let cpi_context = CpiContext :: new_with_signer(cpi_program, cpi_accounts,signer_seeds_arr);

        anchor_lang::system_program::transfer(cpi_context, auciton.current_bid)?;

        // let signer_seeds: &[&[u8]] = &[b"bid", mint_nft.as_ref(), &[ctx.bumps.bid_pda]];
        // let signer_seeds_arr: &[&[&[u8]]] = &[signer_seeds];


        // let refund_ix = anchor_lang::system_program::Transfer {
        //     from: bid_account.to_account_info(),
        //     to: prev_highest_bidder.clone(),
        // };
        // let cpi_ctx = CpiContext::new_with_signer(
        //     ctx.accounts.system_program.to_account_info(),
        //     refund_ix,
        //     signer_seeds_arr,
        // );
        // anchor_lang::system_program::transfer(cpi_ctx, auciton.current_bid)?;

        bid_account.auction_pda = auciton.key();
        bid_account.amount = bid_amount;
        bid_account.bidder = ctx.accounts.bidder.key();
    }
    
    // transfer new bid to bid pda
    let cpi_accounts = Transfer{
        from:ctx.accounts.bidder.to_account_info(),
        to:bid_account.to_account_info(),
    };

    let cpi_program = ctx.accounts.system_program.to_account_info();

    let cpi_context = CpiContext :: new(cpi_program, cpi_accounts);

    anchor_lang::system_program::transfer(cpi_context, bid_amount)?;

    // last step update auction state
    auciton.current_bid = bid_amount;
    auciton.highest_bidder = ctx.accounts.bidder.key();
    
    Ok(())
}

pub fn cancel_auction(ctx:Context<CancelAuction>) ->Result<()> {
    let auction =&mut ctx.accounts.auction;
    let mint_key = ctx.accounts.mint.key();

    require!(auction.auction_status == AuctionStatus::Active, AuctionErrorCode::AuctionIsNotactive);
    require!(ctx.accounts.seller.key() == auction.seller, AuctionErrorCode::NotOriginalLister);

    let signer_seeds = 
            &[b"auction", 
            mint_key.as_ref(), 
            &[ctx.bumps.auction]
        ];
    let signer_seeds_arr= &[&signer_seeds[..]];
    
    let cpi_ctx = CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            TransferChecked {
                from: ctx.accounts.escrow_token_account.to_account_info(),
                to: ctx.accounts.seller_token_account.to_account_info(),
                authority: auction.to_account_info(),
                mint: ctx.accounts.mint.to_account_info(),
            },
            signer_seeds_arr,
        );

        token_interface::transfer_checked(cpi_ctx, 1, ctx.accounts.mint.decimals)?;

    auction.auction_status = AuctionStatus::Cancelled;

    Ok(())
}

pub fn initialize_auction_pda(_ctx: Context<InitializeAuctionPda>) -> Result<()> {
    Ok(())
}
pub fn initialize_bid_pda(_ctx: Context<InitializeBidPda>) -> Result<()> {
    Ok(())
}
#[error_code]
pub enum AuctionErrorCode {
    #[msg("auction is not active")]
    AuctionIsNotactive,

    #[msg("not original lister")]
    NotOriginalLister,

    #[msg("bod must start from start price")]
    BidNotValid,

    #[msg("bid must be greater then previous bid")]
    CurrentBisIsNotValid,

    #[msg("bidder is not valid")]
    CurrentBidderIsNotValid,

    #[msg("previous bidder is not valid")]
    PreviousBidderIsNotVAlid,

    #[msg("auction is over")]
    AuctionTimeOver,

    #[msg("previous bidder mismatch")]
    PreviousBidderMismatch,
    
}
