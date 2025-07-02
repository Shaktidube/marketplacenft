use anchor_lang::{ prelude::*, system_program::{transfer, Transfer}};
use anchor_spl::{
    associated_token::AssociatedToken,
    token_interface::{self, spl_pod::option::Nullable, Mint, TokenAccount, TokenInterface, TransferChecked},
};
use mpl_token_metadata::accounts::Metadata;
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
    Cancelled,
    Settled
}

#[account]
#[derive(InitSpace)]
pub struct Bid {
    pub auction_pda:Pubkey,
    pub bidder:Pubkey,
    pub amount : u64,
}
#[account]
pub struct Escrow;

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
pub struct InitializeBidPda<'info> {
    #[account(
        init,
        payer = bidder,
        seeds = [b"escrow",nft_mint.key().as_ref()],
        bump,
        space = 0,
        owner= anchor_lang::system_program::ID
    )]
    /// CHECK : this account hold only sol
    pub bid_pda: UncheckedAccount<'info>,

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
        seeds = [b"escrow",nft_mint.key().as_ref()],
        bump
    )]
    /// CHECK : this account hold only sol
    pub bid_pda: UncheckedAccount<'info>,
    
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
        mut,
        seeds = [b"escrow", mint.key().as_ref()],
        bump,
    )]
    pub bid_pda: Account<'info, Escrow>,

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

    pub clock : Sysvar<'info,Clock>,

    pub token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct WinnerNft<'info> {
    #[account(mut)]
    pub seller: Signer<'info>,

    #[account(mut)]
    pub bidder: Signer<'info>,

    #[account(
        mut,
        seeds = [b"auction", mint.key().as_ref()],
        bump,
    )]
    pub auction: Account<'info, Auction>,

    #[account(
        mut,
        seeds = [b"escrow",mint.key().as_ref()],
        bump,
        owner = anchor_lang::system_program::ID
    )]
    /// CHECK : this account hold only sol
    pub bid_pda: UncheckedAccount<'info>,

    /// CHECK
    #[account(
            mut,
            seeds = [b"metadata", mpl_token_metadata::ID.as_ref(),mint.key().as_ref()],
            bump,
            seeds::program=mpl_token_metadata::ID
        )]
    pub metadata_account: UncheckedAccount<'info>,

    #[account(
        constraint = mint.decimals == 0 @ BuySellErrorCode::InvalidDecimals,
        constraint = mint.supply == 1 @ BuySellErrorCode::InvalidMint
    )]
    pub mint: InterfaceAccount<'info, Mint>,

    #[account(
        mut,
        associated_token::mint = mint,
        associated_token::authority = bidder,
    )]
    pub buyer_token_account: InterfaceAccount<'info, TokenAccount>,

    #[account(
        mut,
        associated_token::mint = mint,
        associated_token::authority = auction,
    )]
    pub escrow_token_account: InterfaceAccount<'info, TokenAccount>,

    pub clock : Sysvar<'info,Clock>,

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
 
    require!(current_timestamp <= auciton.end_time , AuctionErrorCode::AuctionTimeOver);
    require!(current_timestamp >= auciton.start_time , AuctionErrorCode::AuctionIsNotStarted);
    require!(bid_amount >= auciton.current_bid , AuctionErrorCode::BidNotValid);
    require!(
        ctx.accounts.bidder.owner == &solana_program::system_program::ID,
        AuctionErrorCode::InvalidBidderAccount
    );
    require!(
        ctx.accounts.bidder.lamports() >= bid_amount,
        AuctionErrorCode::InsufficientBalance
    );

    require!(ctx.accounts.bidder.key() != auciton.highest_bidder, AuctionErrorCode::CurrentBidderIsNotValid);

    if auciton.current_bid == 0 {
        // intilize bid
        require!(current_timestamp >= auciton.start_time, AuctionErrorCode::AuctionTimeOver);
        require!(bid_amount >= auciton.satrt_price , AuctionErrorCode::BidNotValid );
    } else {
        // handle 2nd bid 
        let mint_nft: Pubkey = ctx.accounts.nft_mint.key();

        let remaining: &&[AccountInfo<'info>] = &ctx.remaining_accounts;

        let prev_highest_bidder = &remaining[0]; 

        require!(current_timestamp <= auciton.end_time , AuctionErrorCode::AuctionTimeOver);
        require!( bid_amount > auciton.current_bid , AuctionErrorCode::CurrentBisIsNotValid );

        let bid_pda_seeds = &[
                b"escrow",
                mint_nft.as_ref(),
                &[ctx.bumps.bid_pda],
        ];
        let signer_seeds_arr: &[&[&[u8]]] = &[bid_pda_seeds];

        let ix = solana_program::system_instruction::transfer(
            &bid_account.key(),
            &prev_highest_bidder.key(),
            auciton.current_bid,
        );

        solana_program::program::invoke_signed(
            &ix,
            &[
                bid_account.to_account_info(),
                prev_highest_bidder.to_account_info(),
                ctx.accounts.system_program.to_account_info(),
            ],
            signer_seeds_arr,
        )?;
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

pub fn cancel_auction(ctx:Context<CancelAuction>)  ->Result<()> {
    let auction =&mut ctx.accounts.auction;
    let mint_key = ctx.accounts.mint.key();
    // let bid_pda = &ctx.accounts.bid_pda;
    let current_timestamp =  ctx.accounts.clock.unix_timestamp;

    require!(current_timestamp >= auction.end_time ,AuctionErrorCode::AuctionIsActive);

    require!(auction.auction_status == AuctionStatus::Active, AuctionErrorCode::AuctionIsNotactive);
    require!(ctx.accounts.seller.key() == auction.seller, AuctionErrorCode::NotOriginalLister);
    require!(auction.highest_bidder.is_none(),AuctionErrorCode::IllegalCancelAuction);

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


pub fn winner_nft<'info>(ctx: Context<'_, '_, '_, 'info, WinnerNft<'info>>) -> Result<()> {
    let auction_acc = &mut ctx.accounts.auction;
    let mint_key = ctx.accounts.mint.key();
    let price = auction_acc.current_bid;
    let bid_account = &mut ctx.accounts.bid_pda;
    let current_timestamp =  ctx.accounts.clock.unix_timestamp;

    require!(current_timestamp >= auction_acc.end_time , AuctionErrorCode::AuctionIsActive);
    require!(auction_acc.highest_bidder == ctx.accounts.bidder.key() , AuctionErrorCode::BidderIsNotValidWinner);

    require!(
        ctx.accounts.escrow_token_account.amount == 1,
        BuySellErrorCode::InvalidNFTAmont
    );

    let signer_seeds: &[&[u8]] = &[b"auction", mint_key.as_ref(), &[ctx.bumps.auction]];
    let signer_seeds_arr: &[&[&[u8]]] = &[signer_seeds];

    let signer_seeds_escorw: &[&[u8]] = &[b"escrow", mint_key.as_ref(), &[ctx.bumps.bid_pda]];
    let signer_seeds_arr_escrow: &[&[&[u8]]] = &[signer_seeds_escorw];


    // let signer_seeds: &[&[u8]] = &[b"auction", mint_key.as_ref(), &[ctx.bumps.bid_pda]];
    // let signer_seeds_arr: &[&[&[u8]]] = &[signer_seeds];

    let metadata_account =
        Metadata::safe_deserialize(&mut ctx.accounts.metadata_account.data.borrow())?;
    let seller_fees_points = metadata_account.seller_fee_basis_points;

    let total_royalty_amount = (price as u128 * seller_fees_points as u128 / 10000) as u64; 

    let mut account_index = 0;
    let mut distributed_royalty = 0u64;

    let creators = metadata_account.creators;

    if let Some(creators_vec) = creators {
        let bid_pda = bid_account.to_account_info();

        for creator in creators_vec.iter() {
            if creator.verified {
                let creator_share =
                    (total_royalty_amount as u128 * creator.share as u128 / 100) as u64;

                if creator.share > 0 {
                    if account_index < ctx.remaining_accounts.len() {
                        require!(
                            ctx.remaining_accounts[account_index].key() == creator.address,
                            BuySellErrorCode::InvalidCreatorAccount
                        );

                        let cpi_accounts = Transfer {
                            from: bid_pda.to_account_info(),
                            to: ctx.remaining_accounts[account_index].to_account_info(),
                        };

                        let cpi_program = ctx.accounts.system_program.to_account_info();
                        let cpi_context = CpiContext::new_with_signer(cpi_program, cpi_accounts,signer_seeds_arr_escrow);

                        anchor_lang::system_program::transfer(cpi_context, creator_share)?;
                        distributed_royalty += creator_share;
                    }
                    account_index += 1;
                } else {
                    return err!(BuySellErrorCode::InvalidCreators);
                }
            }
        }
    }

    let seller_amount = price - total_royalty_amount;

    let undistributed_royalty = total_royalty_amount - distributed_royalty;

    let total_seller_amount = seller_amount + undistributed_royalty;

    if total_seller_amount > 0 {
        let cpi_account = Transfer {
            from: ctx.accounts.bidder.to_account_info(),
            to: ctx.accounts.seller.to_account_info(),
        };
        let cpi_program = ctx.accounts.system_program.to_account_info();
        let cpi_context = CpiContext::new(cpi_program, cpi_account);
        anchor_lang::system_program::transfer(cpi_context, total_seller_amount)?;
    }

    let cpi_ctx = CpiContext::new_with_signer(
        ctx.accounts.token_program.to_account_info(),
        TransferChecked {
            from: ctx.accounts.escrow_token_account.to_account_info(),
            to: ctx.accounts.buyer_token_account.to_account_info(),
            authority: auction_acc.to_account_info(),
            mint: ctx.accounts.mint.to_account_info(),
        },
        signer_seeds_arr,
    );

    token_interface::transfer_checked(cpi_ctx, 1, ctx.accounts.mint.decimals)?;

    auction_acc.auction_status = AuctionStatus::Settled;
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

    #[msg("invalid bidder")]
    InvalidBidderAccount,

    #[msg("Insufficient funds!!")]
    InsufficientBalance,

    #[msg("illegal Cancel AUction!!")]
    IllegalCancelAuction,

    #[msg("Auction Is Active!!")]
    AuctionIsActive,

    #[msg("Auction Is Not Started!!")]
    AuctionIsNotStarted,

    #[msg("bidder is not valid winner")]
    BidderIsNotValidWinner
    
}
