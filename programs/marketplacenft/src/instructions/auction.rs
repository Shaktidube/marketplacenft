use anchor_lang::{ accounts::signer, prelude::*, system_program::{transfer, Transfer}};
use anchor_spl::{
    associated_token::AssociatedToken, token_interface::{self, spl_pod::option::Nullable, Mint, TokenAccount, TokenInterface,CloseAccount ,TransferChecked}
};
use mpl_token_metadata::accounts::Metadata;
use crate::error::{AuctionErrorCode,BuySellErrorCode};


/* This account stores all auction-related data   */
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

/* Represents the different states an auction can be in */
#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, InitSpace)]
pub enum AuctionStatus{
    Created,
    Ended,
    Active,
    Cancelled,
    Settled
}

/* storing bid */
#[account]
pub struct Escrow;


/* Accounts required to start a new NFT auction.
 Summary:
 - Initializes a new `Auction` account using a PDA.
 - Validates the NFT is a proper 1-of-1 mint (decimals == 0, supply == 1).
 - Transfers the NFT from the seller to an escrow token account owned by the auction PDA. 
*/
#[derive(Accounts)]
#[instruction()]
pub struct StartAuction<'info>{
    #[account(mut)]
    pub seller : Signer<'info>,

    #[account(
        init,
        payer = seller,
        seeds = [b"auction", nft_mint.key().as_ref()],
        space = 8 + Auction::INIT_SPACE, // 8 bytes for account discriminator + struct space
        bump 
    )]
    pub auction: Account<'info, Auction>,

    /// NFT Mint Account (must be an NFT: decimals = 0, supply = 1)
    #[account(
        constraint = nft_mint.decimals == 0 @ BuySellErrorCode::InvalidDecimals, // Must not be a fungible token
        constraint = nft_mint.supply == 1 @ BuySellErrorCode::InvalidMint, // NFT must have supply of 1
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
        // mut,
        init,
        payer = seller,
        associated_token::mint = nft_mint,
        associated_token::authority = auction,  // Escrow owned by auction PDA
    )]
    pub escrow_token_account: InterfaceAccount<'info, TokenAccount>,
    pub token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

/* 
    Accounts required to place a bid on an NFT in an ongoing auction.
    Purpose:
    This context sets up and processes a bid on an NFT auction. It includes:
    - Creating a new `bid_pda` to temporarily hold the bidder’s SOL (escrow).
    - Updating the auction account with the new bid information.
*/
#[derive(Accounts)]
pub struct PlaceBid<'info>{
    #[account(mut)]
    pub bidder: Signer<'info>,
    
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

/* 
    Accounts required to cancel an active NFT auction and reclaim the listed NFT.
    Purpose:
    This context allows the original seller to cancel an ongoing auction, reclaim their NFT from escrow,
    and close both the `auction` and `bid_pda` accounts. The rent from both accounts is refunded to the seller.
*/
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

    /// CHECK : this account hold sol only
    #[account(
        mut,
        seeds = [b"escrow", mint.key().as_ref()],
        bump,
    )]
    pub bid_pda: UncheckedAccount<'info>,

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

/* 
    Accounts context for awarding the NFT to the auction winner (highest bidder),
    transferring the NFT from escrow to the winner, and closing the auction.
    also seller has power of call this fucntion : seller claim highest bid and higest bidder gets winner nft.
    Purpose:
    This context is used after an auction is won. It transfers the NFT from the escrow account
    to the winning bidder, closes the auction account, and handles associated clean-up.
*/

#[derive(Accounts)]
pub struct WinnerNft<'info> {

    #[account(mut)]
    pub signer : Signer<'info>,

    #[account(mut)]
    pub seller: SystemAccount<'info>,

    #[account(mut)]
    pub bidder: SystemAccount<'info>,

    #[account(
        mut,
        close = seller,
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


/* 
    Creates a new auction by transferring the seller's NFT to an escrow account
    and initializing the auction details.
    Purpose:
    - Transfers the NFT from the seller to the escrow ATA.
    - Validates the auction start time.
    - Sets the auction parameters such as start time, duration, starting price, and seller.
*/
pub fn create_auction(ctx:Context<StartAuction>,start_time:i64,bid_start_from:u64,duration:i64) -> Result<()> {

    let auction = &mut ctx.accounts.auction;
    let clock = Clock::get()?;
    let now = clock.unix_timestamp;
    require!(start_time >= now , AuctionErrorCode::AuctionStartTimeInPast);

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

/*
    Places a bid on an active auction. Handles bid validation, lamport transfer,
    and refund of the previous highest bidder (if any).
    Purpose:
    - Accepts a new bid during an active auction.
    - Transfers lamports from the bidder to the bid PDA.
    - Refunds the previous highest bidder if applicable.
    - Updates auction state with new highest bidder and bid amount.
*/

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
    require!(ctx.accounts.bidder.key() != auciton.seller.key(),AuctionErrorCode::CurrentBidderIsNotValid);
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

/*
    Cancels an active auction **only if no bids have been placed**.
    Purpose:
     - Allows the original seller to cancel their auction **after the auction has ended**,
       but **only if no bids were placed** (i.e., `highest_bidder` is `None`).
     - Transfers the NFT back from the escrow token account to the seller's token account.
     - Closes the auction and associated accounts, marking the auction as cancelled.
*/
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

    let signer_seeds_escorw: &[&[u8]] = &[b"escrow", mint_key.as_ref(), &[ctx.bumps.bid_pda]];
    let signer_seeds_arr_escrow: &[&[&[u8]]] = &[signer_seeds_escorw];
    
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

    let close_ata = CpiContext::new_with_signer(
    ctx.accounts.token_program.to_account_info(),
    CloseAccount {
        account: ctx.accounts.escrow_token_account.to_account_info(),
        destination: ctx.accounts.seller.to_account_info(), // refund rent to seller
        authority: auction.to_account_info(),
    },
        signer_seeds_arr
    );
    token_interface::close_account(close_ata)?;

    let bid_escrow = &mut ctx.accounts.bid_pda;
    let remaining_lamports = bid_escrow.lamports();

    if remaining_lamports > 0 {
        let cpi_account = Transfer {
            from: ctx.accounts.bid_pda.to_account_info(),
            to: ctx.accounts.seller.to_account_info(),
        };
        let cpi_program = ctx.accounts.system_program.to_account_info();
        let cpi_context = CpiContext::new_with_signer(cpi_program, cpi_account,signer_seeds_arr_escrow);
        anchor_lang::system_program::transfer(cpi_context, remaining_lamports)?;
    }

    Ok(())
}

/* 
    Settles the auction and transfers the NFT to the winning bidder.
    Purpose:
    - Called by either the `seller` or the `winner (highest bidder)` **after the auction has ended**.
    - Distributes the bid amount: sends royalties to verified creators and the remaining amount to the seller.
    - Transfers the NFT from the auction's escrow token account to the winner's token account.
    - Closes the escrow token account and the bid holding PDA.
    - If the **winner does not claim** the NFT, the seller **has the authority to settle** this function.
*/
pub fn winner_nft<'info>(ctx: Context<'_, '_, '_, 'info, WinnerNft<'info>>) -> Result<()> {
    let auction_acc = &mut ctx.accounts.auction;
    let mint_key = ctx.accounts.mint.key();
    let price = auction_acc.current_bid;
    let bid_account = &mut ctx.accounts.bid_pda;
    let current_timestamp =  ctx.accounts.clock.unix_timestamp;

    require!(ctx.accounts.signer.key() == auction_acc.highest_bidder || ctx.accounts.signer.key() == auction_acc.seller , AuctionErrorCode::UnAuthorizedSigner);

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

    let metadata_account =
        Metadata::safe_deserialize(&mut ctx.accounts.metadata_account.data.borrow())?;
    let seller_fees_points = metadata_account.seller_fee_basis_points;

    let total_royalty_amount = (price as u128 * seller_fees_points as u128 / 10000) as u64; 

    let mut account_index = 0;
    let mut distributed_royalty = 0u64;

    let creators = metadata_account.creators;
    let bid_pda = bid_account.to_account_info();

    if let Some(creators_vec) = creators {

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

        let ix = solana_program::system_instruction::transfer(
            &bid_pda.key(),
            &ctx.accounts.seller.key(),
            total_seller_amount,
        );

        solana_program::program::invoke_signed(
            &ix,
            &[
                bid_account.to_account_info(),
                ctx.accounts.seller.to_account_info(),
                ctx.accounts.system_program.to_account_info(),
            ],
            signer_seeds_arr_escrow,
        )?;
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

    let close_ata = CpiContext::new_with_signer(
    ctx.accounts.token_program.to_account_info(),
    CloseAccount {
        account: ctx.accounts.escrow_token_account.to_account_info(),
        destination: ctx.accounts.seller.to_account_info(), // refund rent to seller
        authority: auction_acc.to_account_info(),
    },
        signer_seeds_arr
    );
    token_interface::close_account(close_ata)?;

    let bid_escrow = &mut ctx.accounts.bid_pda;
    let remaining_lamports = bid_escrow.lamports();

    if remaining_lamports > 0 {
        let cpi_account = Transfer {
            from: ctx.accounts.bid_pda.to_account_info(),
            to: ctx.accounts.seller.to_account_info(),
        };
        let cpi_program = ctx.accounts.system_program.to_account_info();
        let cpi_context = CpiContext::new_with_signer(cpi_program, cpi_account,signer_seeds_arr_escrow);
        anchor_lang::system_program::transfer(cpi_context, remaining_lamports)?;
    }
    Ok(())
}

