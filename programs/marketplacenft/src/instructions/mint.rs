use anchor_lang::{prelude::*, solana_program::program_option::COption};
use anchor_spl::{
    associated_token::AssociatedToken,
    token_interface::{self, TokenInterface,Mint, MintTo, TokenAccount},
};
use mpl_token_metadata::instructions::{CreateMasterEditionV3, CreateMasterEditionV3InstructionArgs};


// ----------------------------
// 1. Create a regular fungible token mint
// ----------------------------
#[derive(Accounts)]
pub struct MintAccount<'info> {

    // The account that pays for the transaction and will be the mint authority
    #[account(mut)]
    pub signer: Signer<'info>,

    // Create a new mint account with 9 decimal places (typical for SPL tokens)
    #[account(
            init,
            payer = signer,
            mint::decimals=9,
            mint::authority = signer.key(), // Set signer as the mint authority
            mint::freeze_authority = signer.key() // Set signer as the freeze authority
        )]
    pub mint: InterfaceAccount<'info, Mint>,

    // Token program used for minting
    pub token_program: Interface<'info, TokenInterface>,

    pub system_program: Program<'info, System>,
}

// ----------------------------
// 2. Create an NFT mint (0 decimals)
// ----------------------------
#[derive(Accounts)]
pub struct NftAccount<'info> {
    #[account(mut)]
    pub signer: Signer<'info>,

    #[account(
            init,
            payer = signer,
            mint::decimals=0,  //nft  have 0 decimal
            mint::authority = signer.key(),
            mint::freeze_authority = signer.key()
        )]
    pub mint: InterfaceAccount<'info, Mint>,
    pub token_program: Interface<'info, TokenInterface>,
    pub system_program: Program<'info, System>,
}

// ----------------------------
// 3. Mint a specified amount of tokens to a user's token account
// ----------------------------
#[derive(Accounts)]
pub struct MintTokesTo<'info> {
    #[account(mut)]
    pub signer: Signer<'info>,

    #[account(mut)]
    pub token_account: InterfaceAccount<'info, TokenAccount>,  // Destination token account

    #[account(mut)]
    pub mint: InterfaceAccount<'info, Mint>,

    pub token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

// ----------------------------
// 4. Mint 1 token to an NFT token account (since NFTs = 1 token only)
// ----------------------------
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

// ----------------------------
// Error Codes (Custom messages for failed checks)
// ----------------------------
#[error_code]
pub enum MintErrorCode {
    #[msg("invalid amount")]
    InvalidAmount,

    #[msg("invalid mint authority")]
    InvalidMintAuthority,

    #[msg("invalid token account owner")]
    InvalidTokenAccountOwner
}

// ----------------------------
// Instruction: Initialize MintAccount (no logic inside, just uses #[account(init)])
// ----------------------------
pub fn create_mint(_ctx: Context<MintAccount>) -> Result<()> {
    Ok(())

}

// ----------------------------
// Instruction: Mint tokens to a given account
// - Validates the mint authority
// - Mints the given amount
// ----------------------------
pub fn mint_to(_ctx: Context<MintTokesTo>, _amount: u64) -> Result<()> {

    // Only allow minting if amount > 0
    require!(_amount > 0, MintErrorCode::InvalidAmount);

    // Make sure the signer is the mint authority
    require!(_ctx.accounts.mint.mint_authority == COption::Some(_ctx.accounts.signer.key()), MintErrorCode::InvalidMintAuthority);

    // Check if the signer owns the destination token account
    require!(_ctx.accounts.token_account.owner == _ctx.accounts.signer.key(), MintErrorCode::InvalidTokenAccountOwner);

    // Create CPI context and mint the tokens
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

// ----------------------------
// Instruction: Initialize an NFT Mint Account
// ----------------------------
pub fn nft_account(_ctx: Context<NftAccount>) -> Result<()> {
    Ok(())
}

// ----------------------------
// Instruction: Mint 1 NFT to a token account
// ----------------------------
pub fn mint_to_nft(_ctx: Context<NftMintTo>) -> Result<()> {

    require!(_ctx.accounts.mint.mint_authority == COption::Some(_ctx.accounts.signer.key()), MintErrorCode::InvalidMintAuthority);

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
// // ----------------------------
// // Instruction: Mint 1 NFT to a token account
// // ----------------------------
// pub fn mint_to_nft(_ctx: Context<NftMintTo>) -> Result<()> {

//     // Check that signer is mint authority
//     require!(_ctx.accounts.mint.mint_authority == COption::Some(_ctx.accounts.signer.key()), MintErrorCode::InvalidMintAuthority);

//     // Check that signer owns the token account
//     require!(_ctx.accounts.token_account.owner == _ctx.accounts.signer.key(), MintErrorCode::InvalidTokenAccountOwner);
    
//     // Mint exactly 1 NFT token
//     let cpi_accounts = MintTo {
//         mint: _ctx.accounts.mint.to_account_info(),
//         to: _ctx.accounts.token_account.to_account_info(),
//         authority: _ctx.accounts.signer.to_account_info(),
//     };
//     let cpi_program = _ctx.accounts.token_program.to_account_info();
//     let cpi_context = CpiContext::new(cpi_program, cpi_accounts);
//     token_interface::mint_to(cpi_context, 1)?;


//     // create master edition NFt 
//     let max_supply = Some(0);
//     let create_master_edition = CreateMasterEditionV3 {
//         edition: _ctx.accounts.master_edition_account.key(),
//         mint: _ctx.accounts.mint.key(),
//         update_authority: _ctx.accounts.signer.key(),
//         payer: _ctx.accounts.signer.key(),
//         mint_authority: _ctx.accounts.signer.key(),
//         metadata: _ctx.accounts.metadata_account.key(),
//         token_program: _ctx.accounts.token_program.key(),
//         system_program: _ctx.accounts.system_program.key(),
//         rent: None,
//     };

//     let instruction = CreateMasterEditionV3InstructionArgs {
//         max_supply: max_supply,
//     };

//     let combien_instruction = create_master_edition.instruction(instruction);

//     anchor_lang::solana_program::program::invoke(&combien_instruction, 
//     &[
//         _ctx.accounts.master_edition_account.to_account_info(),
//         _ctx.accounts.mint.to_account_info(),
//         _ctx.accounts.signer.to_account_info(),
//         _ctx.accounts.signer.to_account_info(),
//         _ctx.accounts.signer.to_account_info(),
//         _ctx.accounts.metadata_account.to_account_info(),
//         _ctx.accounts.token_program.to_account_info(),
//         _ctx.accounts.system_program.to_account_info(),
//         _ctx.accounts.token_metadata_program.to_account_info(),
//     ]
//     )?;


//     Ok(())
// }