use crate::errors::CustomErrorCode;

use crate::structs::{TokenTrackerBase, TokenState, BondVote};
use crate::utils::ascii_trim::TrimAsciiWhitespace;

use anchor_lang::{
    prelude::{*},
    solana_program::system_program,
};
#[derive(Accounts)]
#[instruction(id: String)]
pub struct CreateVoteAccount<'info> {
    #[account(
        mut,
        address = token_state.creator_address
    )]
    pub creator: Signer<'info>,
    #[account(
        seeds = [token_tracker_base.id.as_ref().trim_ascii_whitespace()],
        bump = token_tracker_base.token_tracker_bump,
    )]
    pub token_tracker_base: Account<'info, TokenTrackerBase>,
    #[account(
        seeds = [token_tracker_base.key().as_ref(), token_state.id.as_ref().trim_ascii_whitespace()],
        bump = token_state.token_state_bump
    )]
    pub token_state: Box<Account<'info, TokenState>>,
    #[account(
        init,
        seeds = [
            token_state.key().as_ref(), 
            id.as_bytes()],
        bump,
        payer = creator,
        space=222
    )]
    pub bond_vote: Box<Account<'info, BondVote>>,
    #[account(address = system_program::ID)]
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

pub fn handle(ctx: Context<CreateVoteAccount>, id: String) -> Result<()> {
    let id_bytes = id.as_bytes();
    if id_bytes.len() >= 20 {
        return Err(error!(CustomErrorCode::InvalidIdLength));
    }
    let mut id_data = [b' '; 20];
    id_data[..id_bytes.len()].copy_from_slice(id_bytes);

    let bond_vote = &mut ctx.accounts.bond_vote;
    bond_vote.token_state_address = ctx.accounts.token_state.key();
    bond_vote.id = id_data;
    bond_vote.total_votes = 0;
    bond_vote.bond_vote_bump = *ctx.bumps.get("bond_vote").unwrap();
    Ok(())
}