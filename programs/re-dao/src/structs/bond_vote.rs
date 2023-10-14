use anchor_lang::prelude::*;
#[account]
#[derive(Default)]
//PDA = token_state address + index
//TODO - voting enabled/disabled, reset votes
//TODO - extra information such as string for link to vote details?
//TODO - bond vote auth to create new/reset old/disable
pub struct BondVote {
    pub token_state_address: Pubkey,
    pub id: [u8; 20],
    pub total_votes: u64,
    pub bond_vote_bump: u8,
}