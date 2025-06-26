use std::time::SystemTime;

use anchor_lang::{prelude::*, solana_program::program_option::COption};
use anchor_spl::{
    associated_token::AssociatedToken,
    token_interface::{self, TokenInterface,Mint, MintTo, TokenAccount},
};

#[derive(Accounts)]
pub struct MintAccount<'info> {
    #[account(mut)]
    pub signer: Signer<'info>,

    #[account(
            init,
            payer = signer,
            mint::decimals=9,
            mint::authority = signer.key(),
            mint::freeze_authority = signer.key()
        )]
    pub mint: InterfaceAccount<'info, Mint>,

    pub token_program: Interface<'info, TokenInterface>,

    pub system_program: Program<'info, System>,
}
#[derive(Accounts)]
pub struct NftAccount<'info> {
    #[account(mut)]
    pub signer: Signer<'info>,

    #[account(
            init,
            payer = signer,
            mint::decimals=0,
            mint::authority = signer.key(),
            mint::freeze_authority = signer.key()
        )]
    pub mint: InterfaceAccount<'info, Mint>,
    pub token_program: Interface<'info, TokenInterface>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct MintTokesTo<'info> {
    #[account(mut)]
    pub signer: Signer<'info>,

    #[account(mut)]
    pub token_account: InterfaceAccount<'info, TokenAccount>,

    #[account(mut)]
    pub mint: InterfaceAccount<'info, Mint>,

    pub token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}
#[derive(Accounts)]
pub struct NftMintTo<'info> {
    #[account(mut)]
    pub signer: Signer<'info>,

    #[account(mut)]
    pub token_account: InterfaceAccount<'info, TokenAccount>,

    #[account(mut)]
    pub mint: InterfaceAccount<'info, Mint>,

    pub token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

#[error_code]
pub enum MintErrorCode {
    #[msg("invalid amount")]
    InvalidAmount,

    #[msg("invalid mint authority")]
    InvalidMintAuthority,

    #[msg("invalid token account owner")]
    InvalidTokenAccountOwner
}

pub fn create_mint(_ctx: Context<MintAccount>) -> Result<()> {
    Ok(())
}

pub fn mint_to(_ctx: Context<MintTokesTo>, _amount: u64) -> Result<()> {

    require!(_amount > 0, MintErrorCode::InvalidAmount);

    require!(_ctx.accounts.mint.mint_authority == COption::Some(_ctx.accounts.signer.key()), MintErrorCode::InvalidMintAuthority);

    require!(_ctx.accounts.token_account.owner == _ctx.accounts.signer.key(), MintErrorCode::InvalidTokenAccountOwner);

    let cpi_accounts = MintTo {
        mint: _ctx.accounts.mint.to_account_info(),
        to: _ctx.accounts.token_account.to_account_info(),
        authority: _ctx.accounts.signer.to_account_info(),
    };
    let cpi_program = _ctx.accounts.token_program.to_account_info();
    let cpi_context = CpiContext::new(cpi_program, cpi_accounts);
    token_interface::mint_to(cpi_context, _amount)?;
    Ok(())
}

pub fn nft_account(_ctx: Context<NftAccount>) -> Result<()> {
    Ok(())
}

pub fn mint_to_nft(_ctx: Context<NftMintTo>) -> Result<()> {

    require!(_ctx.accounts.mint.mint_authority == COption::Some(_ctx.accounts.signer.key()), MintErrorCode::InvalidMintAuthority);

    SystemTime::now();

    require!(_ctx.accounts.token_account.owner == _ctx.accounts.signer.key(), MintErrorCode::InvalidTokenAccountOwner);
    
    let cpi_accounts = MintTo {
        mint: _ctx.accounts.mint.to_account_info(),
        to: _ctx.accounts.token_account.to_account_info(),
        authority: _ctx.accounts.signer.to_account_info(),
    };
    let cpi_program = _ctx.accounts.token_program.to_account_info();
    let cpi_context = CpiContext::new(cpi_program, cpi_accounts);
    token_interface::mint_to(cpi_context, 1)?;
    Ok(())
}