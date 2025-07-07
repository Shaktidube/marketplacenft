use anchor_lang::prelude::*;
use anchor_spl::{
    token::Token,
    token_interface::{Mint},
};

use mpl_token_metadata::{
    instructions::{
        CreateMasterEditionV3, CreateMasterEditionV3InstructionArgs, CreateMetadataAccountV3,
        VerifyCollection,
    },
    types::{Collection, Creator, DataV2},
};

// Accounts context for creating metadata for a mint
#[derive(Accounts)]
pub struct MetadataAcc<'info> {
    // Signer who pays and is the authority of the mint
    #[account(mut)]
    pub signer: Signer<'info>,

    /// Mint account for the NFT
    #[account(mut)]
    pub mint: InterfaceAccount<'info, Mint>,

    /* Metadata PDA account (PDA must match seeds for mint) */
    /// CHECK : This account is derived and verified using seeds 
    #[account(
            mut,
            seeds = [b"metadata", mpl_token_metadata::ID.as_ref(),mint.key().as_ref()],
            bump,
            seeds::program=mpl_token_metadata::ID
        )]
    pub metadata_account: UncheckedAccount<'info>,

    pub token_program: Program<'info, Token>,

    /// CHECK: this account is used for External program
    pub token_metadata_program: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
}

/// Custom input struct to define a Creator
#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct CreatorInput {
    pub address: Pubkey,
    pub verified: bool,
    pub share: u8,
}

/// Account context for creating a Master Edition
#[derive(Accounts)]
pub struct MasterEdition<'info> {
    #[account(mut)]
    pub signer: Signer<'info>,

    #[account(mut)]
    pub mint: InterfaceAccount<'info, Mint>,

    /// Metadata PDA for the mint
    /// CHECK: Verified using seeds
    #[account(
            mut,
            seeds = [b"metadata", mpl_token_metadata::ID.as_ref(),mint.key().as_ref()],
            bump,
            seeds::program=mpl_token_metadata::ID
        )]
    pub metadata_account: UncheckedAccount<'info>,

    /// Master Edition PDA account for the mint
    /// CHECK: Verified using seeds
    #[account(
            mut,
            seeds = [b"metadata",mpl_token_metadata::ID.as_ref(),mint.key().as_ref(),b"edition"],
            bump,
            seeds::program = mpl_token_metadata::ID
        )]
    pub master_edition_account: UncheckedAccount<'info>,

    pub token_program: Program<'info, Token>,

    /// CHECK: External program
    pub token_metadata_program: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
}

/// Account context for verifying an NFT against a collection
#[derive(Accounts)]
pub struct VerifyCollectionContext<'info> {
    /// Authority who owns the collection
    pub collection_authority: Signer<'info>,

    /// Payer of transaction fees
    #[account(mut)]
    pub payer: Signer<'info>,

    /// Metadata account of the NFT being verified
    /// CHECK: PDA validated using seeds
    #[account(
            mut,
            seeds = [
                b"metadata",
                mpl_token_metadata::ID.as_ref(),
                nft_mint.key().as_ref(),
            ],
            bump,
            seeds::program = mpl_token_metadata::ID
        )]
    pub metadata: UncheckedAccount<'info>,
    pub nft_mint: InterfaceAccount<'info, Mint>,
    pub collection_mint: InterfaceAccount<'info, Mint>,

    /// CHECK:This is the metadata PDA for the collection mint
    #[account(
            seeds = [
                b"metadata",
                mpl_token_metadata::ID.as_ref(),
                collection_mint.key().as_ref(),
            ],
            bump,
            seeds::program = mpl_token_metadata::ID
        )]
    pub collection_metadata: UncheckedAccount<'info>,

    /// Master edition account of the collection
    /// CHECK: PDA validated using seeds
    #[account(
            seeds = [
                b"metadata",
                mpl_token_metadata::ID.as_ref(),
                collection_mint.key().as_ref(),
                b"edition",
            ],
            bump,
            seeds::program = mpl_token_metadata::ID
        )]
    pub collection_master_edition: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,

    /// CHECK: This is the Metaplex Token Metadata program account
    #[account(address = mpl_token_metadata::ID)]
    pub token_metadata_program: UncheckedAccount<'info>,
}

#[error_code]
pub enum MetadataErrorCode {
    #[msg("100% royalty is not allowed")]
    InvalidRoyalty,
}

/*  Function to create metadata for a mint (used for NFTs)
 Creates on-chain metadata for an NFT using Metaplex Token Metadata V3.

- Validates royalty (<100%) and prepares creator & collection data.
- Uses CPI to invoke `CreateMetadataAccountV3`.
- Makes metadata immutable (`is_mutable: false`).

 Params:
- NFT name, symbol, URI, royalty, optional creators & collection info.

 Fails if:
/// - Royalty is 100% or more.  */
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
    // Prevent 100% royalty (10000 basis points = 100%)
    require!(_royalty < 10000, MetadataErrorCode::InvalidRoyalty);

    //  Convert CreatorInput to Metaplex Creator format
    let creators = if let Some(creator_inputs) = _creators {
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

    let collection = if let Some(collection_mint) = _collection_mint {
        Some(Collection {
            verified: _collection_verified.unwrap_or(false),
            key: collection_mint,
        })
    } else {
        None
    };

    let data_v2 = DataV2 {
        name: _token_name,
        symbol: _token_symbol,
        uri: _token_uri,
        seller_fee_basis_points: _royalty,
        creators,
        collection,
        uses: None,
    };

    let create_metadata_account_v3 = CreateMetadataAccountV3 {
        metadata: _ctx.accounts.metadata_account.key(),
        mint: _ctx.accounts.mint.key(),
        mint_authority: _ctx.accounts.signer.key(),
        payer: _ctx.accounts.signer.key(),
        update_authority: (_ctx.accounts.signer.key(), false),
        system_program: _ctx.accounts.system_program.key(),
        rent: None,
    };

    let instruction = mpl_token_metadata::instructions::CreateMetadataAccountV3InstructionArgs {
        data: data_v2,
        is_mutable: false,
        collection_details: None,
    };

    let combine_instruction = create_metadata_account_v3.instruction(instruction);

    anchor_lang::solana_program::program::invoke(
        &combine_instruction,
        &[
            _ctx.accounts.metadata_account.to_account_info(),
            _ctx.accounts.mint.to_account_info(),
            _ctx.accounts.signer.to_account_info(),
            _ctx.accounts.signer.to_account_info(),
            _ctx.accounts.signer.to_account_info(),
            _ctx.accounts.system_program.to_account_info(),
            _ctx.accounts.token_metadata_program.to_account_info(),
        ],
    )?;
    Ok(())
}

/*  Creates a Master Edition for an NFT using Metaplex.

 - Links the NFT's metadata with a master edition account.
 - Optionally sets a `max_supply` to limit the number of editions.

 `max_supply` controls how many editions (copies) can be printed:

- `Some(0)`: NFT is a unique 1-of-1 — no editions can be minted.
- `Some(n)`: Up to `n` editions can be minted.
- `None` or `null`: Unlimited editions can be printed.

 Uses CPI to call `CreateMasterEditionV3`.

/ Required for making the NFT non-fungible and enabling printing of editions.*/
pub fn master_edition(_ctx: Context<MasterEdition>, _max_supply: Option<u64>) -> Result<()> {
    let create_master_edition = CreateMasterEditionV3 {
        edition: _ctx.accounts.master_edition_account.key(),
        mint: _ctx.accounts.mint.key(),
        update_authority: _ctx.accounts.signer.key(),
        payer: _ctx.accounts.signer.key(),
        mint_authority: _ctx.accounts.signer.key(),
        metadata: _ctx.accounts.metadata_account.key(),
        token_program: _ctx.accounts.token_program.key(),
        system_program: _ctx.accounts.system_program.key(),
        rent: None,
    };

    let instruction = CreateMasterEditionV3InstructionArgs {
        max_supply: _max_supply,
    };

    let combine_instruction = create_master_edition.instruction(instruction);

    anchor_lang::solana_program::program::invoke(
        &combine_instruction,
        &[
            _ctx.accounts.master_edition_account.to_account_info(),
            _ctx.accounts.mint.to_account_info(),
            _ctx.accounts.signer.to_account_info(),
            _ctx.accounts.signer.to_account_info(),
            _ctx.accounts.signer.to_account_info(),
            _ctx.accounts.metadata_account.to_account_info(),
            _ctx.accounts.token_program.to_account_info(),
            _ctx.accounts.system_program.to_account_info(),
            _ctx.accounts.token_metadata_program.to_account_info(),
        ],
    )?;
    Ok(())
}

/*  Verifies that an NFT belongs to a specific verified collection (Metaplex).

- Links the NFT to a collection NFT (via metadata & master edition).
- Requires the collection authority's signature.
- Ensures the collection is authentic and verified on-chain.

/// Uses CPI to call `VerifyCollection` instruction (Metaplex v5.1.0).*/
pub fn verify_collection(ctx: Context<VerifyCollectionContext>) -> Result<()> {
    let verify_ix = VerifyCollection {
        metadata: ctx.accounts.metadata.key(),
        collection_authority: ctx.accounts.collection_authority.key(),
        payer: ctx.accounts.payer.key(),
        collection_mint: ctx.accounts.collection_mint.key(),
        collection: ctx.accounts.collection_metadata.key(),
        collection_master_edition_account: ctx.accounts.collection_master_edition.key(),
        collection_authority_record: None,
    };

    // For v5.1.0, try instruction without args first
    let instruction = verify_ix.instruction();

    anchor_lang::solana_program::program::invoke(
        &instruction,
        &[
            ctx.accounts.metadata.to_account_info(),
            ctx.accounts.collection_authority.to_account_info(),
            ctx.accounts.payer.to_account_info(),
            ctx.accounts.collection_mint.to_account_info(),
            ctx.accounts.collection_metadata.to_account_info(),
            ctx.accounts.collection_master_edition.to_account_info(),
            ctx.accounts.token_metadata_program.to_account_info(),
        ],
    )?;

    Ok(())
}
