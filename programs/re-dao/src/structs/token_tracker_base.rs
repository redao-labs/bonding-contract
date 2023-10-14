use anchor_lang::prelude::*;
#[account]
#[derive(Default)]
//can only be created by AUTH constant.
pub struct TokenTrackerBase {
    //tracking 
    pub id: [u8; 20], // 8 + 2+ - 28
    pub index: u64, //64 + 28 = 92
    pub token_tracker_bump: u8, //8 + 92 = 100

    //factory
    pub auth_wallet: Pubkey, //32 + 100 = 132

    //payment
    pub receive_mint: Pubkey, //32 + 132 = 164
    pub receive_token_account: Pubkey, //32 + 164 = 196
    pub total_received: u64,
    pub cost: u64, //64 + 196 = 260
    pub enabled: bool, //1 + 260 = 261
}