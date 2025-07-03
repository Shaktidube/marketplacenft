use anchor_lang::prelude::*;

#[error_code]
pub enum AuctionErrorCode {
    #[msg("auction is not active")]
    AuctionIsNotactive,


    #[msg("start time should not be in the past")]
    AuctionStartTimeInPast,

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
    BidderIsNotValidWinner,

    #[msg("seller is not valid winner")]
    SellerIsNotValidWinner,
}

#[error_code]
pub enum BuySellErrorCode {
    #[msg("Creator account does not match metadata")]
    InvalidCreatorAccount,

    #[msg("fungible token")]
    InvalidDecimals,

    #[msg("Mint account is not valid nft")]
    InvalidMint,

    #[msg("insufficient balance")]
    InvalidAmount,

    #[msg("missing creator account")]
    InvalidCreators,

    #[msg("listing is not active")]
    ListingNotActive,

    #[msg("price not allowed")]
    PriceNotAllowed,

    #[msg("not original lister")]
    NotOriginalLister,

    #[msg("escrow has no nft")]
    InvalidNFTAmont,
}
