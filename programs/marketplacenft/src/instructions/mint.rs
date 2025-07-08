use anchor_lang::{prelude::*, solana_program::program_option::COption};
use anchor_spl::{
    associated_token::AssociatedToken,
    token_interface::{self, TokenInterface,Mint, MintTo, TokenAccount},
};


use mpl_token_metadata::{
    instructions::{
        CreateMasterEditionV3, CreateMasterEditionV3InstructionArgs, CreateMetadataAccountV3,
        VerifyCollection,
    },
    types::{Collection, Creator, DataV2},
};
// use mpl_token_metadata::instructions::{CreateMasterEditionV3, CreateMasterEditionV3InstructionArgs};

// ----------------------------
// 3. Mint a specified amount of tokens to a user's token account
// ----------------------------
#[derive(Accounts)]
pub struct MintAndMintTo<'info> {
    #[account(mut)]
    pub signer: Signer<'info>,

    #[account(
            init,
            payer = signer,
            mint::decimals=9,
            mint::authority = signer.key(), // Set signer as the mint authority
            mint::freeze_authority = signer.key() // Set signer as the freeze authority
        )]
    pub mint: InterfaceAccount<'info, Mint>,

    #[account(
        init,
        payer = signer,
        associated_token::mint = mint,
        associated_token::authority = signer,
    )]
    pub token_account: InterfaceAccount<'info, TokenAccount>,  // Destination token account

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

    #[account(
            init,
            payer = signer,
            mint::decimals=0,  //nft  have 0 decimal
            mint::authority = signer.key(),
            mint::freeze_authority = signer.key()
        )]
    pub mint: InterfaceAccount<'info, Mint>,

    #[account(
        init,
        payer = signer,
        associated_token::mint = mint,
        associated_token::authority = signer,
    )]
    pub token_account: InterfaceAccount<'info, TokenAccount>,

    /// CHECK: This account is validated by the Metaplex program itself during CPI.
    #[account(
        mut,
        seeds = [
            b"metadata",
            token_metadata_program.key().as_ref(),
            mint.key().as_ref(),
        ],
        bump,
        seeds::program = token_metadata_program.key()
    )]
    pub metadata_account: UncheckedAccount<'info>,

    /// CHECK: This account is validated by the Metaplex program itself during CPI.
    #[account(
        mut,
        seeds = [
            b"metadata",
            token_metadata_program.key().as_ref(),
            mint.key().as_ref(),
            b"edition",
        ],
        bump,
        seeds::program = token_metadata_program.key()
    )]
    pub master_edition_account: UncheckedAccount<'info>,

    pub token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,

    /// CHECK: The address is hardcoded and checked by Anchor.
    #[account(address = mpl_token_metadata::ID)]
    pub token_metadata_program: UncheckedAccount<'info>,
}
#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct CreatorInput {
    pub address: Pubkey,
    pub verified: bool,
    pub share: u8,
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
    InvalidTokenAccountOwner,

    #[msg("Invalid royalty: Royalty must be less than 10000 (100%).")]
    InvalidRoyalty,
}

// ----------------------------
// Instruction: Mint tokens to a given account
// - Validates the mint authority
// - Mints the given amount
// ----------------------------
pub fn mint_to(_ctx: Context<MintAndMintTo>, _amount: u64) -> Result<()> {

    // Only allow minting if amount > 0
    require!(_amount > 0, MintErrorCode::InvalidAmount);

    // Make sure the signer is the mint authority
    require!(_ctx.accounts.mint.mint_authority == COption::Some(_ctx.accounts.signer.key()), MintErrorCode::InvalidMintAuthority);


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
// Instruction: Mint 1 NFT to a token account
// ----------------------------
pub fn mint_to_nft(
        ctx: Context<NftMintTo>,
        name: String,
        symbol: String,
        uri: String,
        royalty: u16,
        creators_input: Option<Vec<CreatorInput>>,
        collection_mint: Option<Pubkey>,
        collection_verified: Option<bool>,
        max_supply: Option<u64>,
    ) -> Result<()> {

    require!(ctx.accounts.mint.mint_authority == COption::Some(ctx.accounts.signer.key()), MintErrorCode::InvalidMintAuthority);

    require!(ctx.accounts.token_account.owner == ctx.accounts.signer.key(), MintErrorCode::InvalidTokenAccountOwner);
    
    let cpi_accounts = MintTo {
        mint: ctx.accounts.mint.to_account_info(),
        to: ctx.accounts.token_account.to_account_info(),
        authority: ctx.accounts.signer.to_account_info(),
    };
    let cpi_program = ctx.accounts.token_program.to_account_info();
    let cpi_context = CpiContext::new(cpi_program, cpi_accounts);
    token_interface::mint_to(cpi_context, 1)?;

    require!(royalty < 10000, MintErrorCode::InvalidRoyalty);

        // Convert CreatorInput to Metaplex Creator format
        let creators = if let Some(creator_inputs) = creators_input {
            let mut creators_vec = Vec::new();
            for creator_input in creator_inputs {
                creators_vec.push(Creator {
                    address: creator_input.address,
                    verified: creator_input.verified,
                    share: creator_input.share,
                });
            }
            Some(creators_vec)
        } else {
            None
        };

    
        let collection = if let Some(collection_mint_key) = collection_mint {
            Some(Collection {
                verified: collection_verified.unwrap_or(false), 
                key: collection_mint_key,
            })
        } else {
            None
        };

    
        let data_v2 = DataV2 {
            name,
            symbol,
            uri,
            seller_fee_basis_points: royalty,
            creators,
            collection,
            uses: None,
        };

        // Create the `CreateMetadataAccountV3` instruction
        let create_metadata_ix = CreateMetadataAccountV3 {
            metadata: ctx.accounts.metadata_account.key(),
            mint: ctx.accounts.mint.key(),
            mint_authority: ctx.accounts.signer.key(),
            payer: ctx.accounts.signer.key(),
            update_authority: (ctx.accounts.signer.key(),false),
            system_program: ctx.accounts.system_program.key(),
            rent: None, 
        };

        let metadata_args = mpl_token_metadata::instructions::CreateMetadataAccountV3InstructionArgs {
            data: data_v2,
            is_mutable: false,
            collection_details: None,
        };


        let combine_instruction = create_metadata_ix.instruction(metadata_args);

        anchor_lang::solana_program::program::invoke(
            &combine_instruction,
            &[
                ctx.accounts.metadata_account.to_account_info(),
                ctx.accounts.mint.to_account_info(),
                ctx.accounts.signer.to_account_info(),
                ctx.accounts.signer.to_account_info(),
                ctx.accounts.signer.to_account_info(),
                ctx.accounts.system_program.to_account_info(),
                ctx.accounts.token_metadata_program.to_account_info(),
            ],
        )?;

    
        let create_master_edition_ix = CreateMasterEditionV3 {
            edition: ctx.accounts.master_edition_account.key(),  
            mint: ctx.accounts.mint.key(),                      
            update_authority: ctx.accounts.signer.key(),        
            payer: ctx.accounts.signer.key(),                   
            mint_authority: ctx.accounts.signer.key(),          
            metadata: ctx.accounts.metadata_account.key(),      
            token_program: ctx.accounts.token_program.key(),    
            system_program: ctx.accounts.system_program.key(),  
            rent: None,                
        };

        let instruction_args = CreateMasterEditionV3InstructionArgs {
            max_supply, 
        };

        let combine_instruction = create_master_edition_ix.instruction(instruction_args);

    anchor_lang::solana_program::program::invoke(
        &combine_instruction,
        &[
            ctx.accounts.master_edition_account.to_account_info(),
            ctx.accounts.mint.to_account_info(),
            ctx.accounts.signer.to_account_info(),
            ctx.accounts.signer.to_account_info(),
            ctx.accounts.signer.to_account_info(),
            ctx.accounts.metadata_account.to_account_info(),
            ctx.accounts.token_program.to_account_info(),
            ctx.accounts.system_program.to_account_info(),
            ctx.accounts.token_metadata_program.to_account_info(),
        ],
    )?;

    Ok(())
}