use anchor_lang::{prelude::*, system_program::Transfer};
use anchor_spl::{
    associated_token::AssociatedToken, token_interface::{self, Mint, TokenAccount,CloseAccount, TokenInterface, TransferChecked}
};

use mpl_token_metadata::accounts::Metadata;
use crate::error::BuySellErrorCode;

/* 
    Create a new NFT listing: transfers NFT from seller to escrow account (PDA)
*/
pub fn create_listing(ctx: Context<CreateListing>, price: u64) -> Result<()> {
    require!(price > 0, BuySellErrorCode::PriceNotAllowed);

    let listing = &mut ctx.accounts.listing;

    listing.seller = ctx.accounts.seller.key();
    listing.mint = ctx.accounts.mint.key();
    listing.price = price;

    // Transfer NFT from seller's ATA to program-owned escrow ATA
    let cpi_ctx = CpiContext::new(
        ctx.accounts.token_program.to_account_info(),
        TransferChecked {
            from: ctx.accounts.seller_token_account.to_account_info(),
            to: ctx.accounts.escrow_token_account.to_account_info(),
            authority: ctx.accounts.seller.to_account_info(),
            mint: ctx.accounts.mint.to_account_info(),
        },
    );

    token_interface::transfer_checked(cpi_ctx, 1, ctx.accounts.mint.decimals)?;

    listing.status = ListingStatus::Listed;

    Ok(())
}

/* 
    Cancel a listing: transfers NFT back to seller from escrow and updates status
*/
pub fn cancel_listing(ctx: Context<CloseListing>) -> Result<()> {
    let listing = &mut ctx.accounts.listing;
    let mint_key = ctx.accounts.mint.key();

    require!(
        listing.status == ListingStatus::Listed,
        BuySellErrorCode::ListingNotActive
    );
    require!(
        ctx.accounts.seller.key() == listing.seller,
        BuySellErrorCode::NotOriginalLister
    );

    // Prepare signer seeds for PDA authority
    let signer_seeds: &[&[u8]] = &[b"listing", mint_key.as_ref(), &[ctx.bumps.listing]];

    let signer_seeds_arr: &[&[&[u8]]] = &[signer_seeds];

    let cpi_ctx = CpiContext::new_with_signer(
        ctx.accounts.token_program.to_account_info(),
        TransferChecked {
            from: ctx.accounts.escrow_token_account.to_account_info(),
            to: ctx.accounts.seller_token_account.to_account_info(),
            authority: listing.to_account_info(),
            mint: ctx.accounts.mint.to_account_info(),
        },
        signer_seeds_arr,
    );

    token_interface::transfer_checked(cpi_ctx, 1, ctx.accounts.mint.decimals)?;
    listing.status = ListingStatus::Cancelled;

    Ok(())
}

/*
    buy NFT: distributes royalties to creators, pays seller, and transfers NFT to buyer,
    use remaining account for distribute royalty
*/

pub fn buy_nft<'info>(ctx: Context<'_, '_, '_, 'info, BuyNft<'info>>) -> Result<()> {
    let listing = &mut ctx.accounts.listing;
    let mint_key = ctx.accounts.mint.key();
    let price = listing.price;

    require!(
        listing.status == ListingStatus::Listed,
        BuySellErrorCode::ListingNotActive
    );
    require!(
        ctx.accounts.escrow_token_account.amount == 1,
        BuySellErrorCode::InvalidNFTAmont
    );

    require!(ctx.accounts.buyer.key() != listing.seller.key(), BuySellErrorCode::BuyerNotValid);


    let signer_seeds: &[&[u8]] = &[b"listing", mint_key.as_ref(), &[ctx.bumps.listing]];
    let signer_seeds_arr: &[&[&[u8]]] = &[signer_seeds];

    let metadata_account =
        Metadata::safe_deserialize(&mut ctx.accounts.metadata_account.data.borrow())?;
    let seller_fees_points = metadata_account.seller_fee_basis_points;

    let total_royalty_amount = (price as u128 * seller_fees_points as u128 / 10000) as u64; // 0.5

    let mut account_index = 0;
    let mut distributed_royalty = 0u64;

    let creators = metadata_account.creators;

    if let Some(creators_vec) = creators {
        let buyer_info = ctx.accounts.buyer.to_account_info().clone();
        // let remaining_account = &ctx.remaining_accounts;

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
                            from: buyer_info.clone(),
                            to: ctx.remaining_accounts[account_index].to_account_info(),
                        };

                        let cpi_program = ctx.accounts.system_program.to_account_info();
                        let cpi_context = CpiContext::new(cpi_program, cpi_accounts);

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
            from: ctx.accounts.buyer.to_account_info(),
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
            authority: listing.to_account_info(),
            mint: ctx.accounts.mint.to_account_info(),
        },
        signer_seeds_arr,
    );

    token_interface::transfer_checked(cpi_ctx, 1, ctx.accounts.mint.decimals)?;

    let close_ata = CpiContext::new_with_signer(
        ctx.accounts.token_program.to_account_info(),
        CloseAccount {
            account: ctx.accounts.escrow_token_account.to_account_info(),
            destination: ctx.accounts.seller.to_account_info(), // refund rent to seller
            authority: listing.to_account_info(),
        },
            signer_seeds_arr
        );
        token_interface::close_account(close_ata)?;

    listing.status = ListingStatus::Sold;

    Ok(())
}

/* 
    Listing struct for storing listing data like seller account , mint nft public key , 
    price of nft , and status.
*/
#[account]
#[derive(InitSpace)]
pub struct Listing {
    pub seller: Pubkey,
    pub mint: Pubkey,
    pub price: u64,
    pub status: ListingStatus,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, InitSpace)]
pub enum ListingStatus {
    Listed,
    Sold,
    Cancelled,
}

#[derive(Accounts)]
pub struct BuyNft<'info> {
    #[account(mut)]
    pub seller: SystemAccount<'info>,

    #[account(mut)]
    pub buyer: Signer<'info>,

    #[account(
        mut,
        close = seller,
        seeds = [b"listing", mint.key().as_ref()],
        bump,
    )]
    pub listing: Account<'info, Listing>,

    /// CHECK: this account is used for metadata 
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
        associated_token::authority = buyer,
    )]
    pub buyer_token_account: InterfaceAccount<'info, TokenAccount>,

    #[account(
        mut,
        associated_token::mint = mint,
        associated_token::authority = listing,
    )]
    pub escrow_token_account: InterfaceAccount<'info, TokenAccount>,

    pub token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

/* init listing pda  with nft public key */

#[derive(Accounts)]
#[instruction()]
pub struct CreateListing<'info> {
    #[account(mut)]
    pub seller: Signer<'info>,

    #[account(
        init,
        payer = seller,
        seeds = [b"listing",mint.key().as_ref()],
        bump,
        space = 8 + Listing::INIT_SPACE
    )]
    pub listing: Account<'info, Listing>,

    #[account(
        constraint = mint.decimals == 0  @ BuySellErrorCode::InvalidDecimals,
        constraint = mint.supply == 1 @ BuySellErrorCode::InvalidMint,
    )]
    pub mint: InterfaceAccount<'info, Mint>,

    #[account(
        mut,
        associated_token::mint = mint,
        associated_token::authority = seller,
        constraint = seller_token_account.amount == 1 @ BuySellErrorCode::InvalidAmount,
        constraint = seller_token_account.owner == seller.key() @ BuySellErrorCode::UnauthorizedNFTListing,
    )]
    pub seller_token_account: InterfaceAccount<'info, TokenAccount>,

    #[account(
        init,
        payer = seller,
        associated_token::mint = mint,
        associated_token::authority = listing,
    )]
    pub escrow_token_account: InterfaceAccount<'info, TokenAccount>,

    pub token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct CloseListing<'info> {
    #[account(mut)]
    pub seller: Signer<'info>,

    #[account(
        mut,
        close = seller,
        seeds = [b"listing", mint.key().as_ref()],
        bump,
    )]
    pub listing: Account<'info, Listing>,

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
        associated_token::
        mint = mint,
        associated_token::authority = listing,
    )]
    pub escrow_token_account: InterfaceAccount<'info, TokenAccount>,

    pub token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}


