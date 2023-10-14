use anchor_lang::prelude::*;
#[account]
#[derive(Default)]
pub struct TokenTracker {
    pub token_state: Pubkey, // 8 + 32 = 40
    pub id: [u8; 20], // 20 + 40 = 60
    pub index: u64, // 64 + 60 = 124
    pub token_tracker_bump: u8 //8 + 124 = 132
}