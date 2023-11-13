use crate::errors::{CustomErrorCode, OrArithError};

use crate::structs::{TokenTrackerBase, TokenState, BondVote};
use crate::transfers::transfers;
use crate::utils::ascii_trim::TrimAsciiWhitespace;

use anchor_lang::{
    prelude::{*},
    solana_program::system_program,
};
use anchor_spl::token::{TokenAccount, Token};

#[derive(Accounts)]
#[instruction()]
pub struct BondingVaultTopup<'info> {
    #[account(
        mut,
        address = token_state.creator_address
    )]
    pub user: Signer<'info>,
    #[account(
        seeds = [token_tracker_base.id.as_ref().trim_ascii_whitespace()],
        bump = token_tracker_base.token_tracker_bump,
    )]
    pub token_tracker_base: Account<'info, TokenTrackerBase>,
    #[account(
        mut,
        seeds = [token_tracker_base.key().as_ref(), token_state.id.as_ref().trim_ascii_whitespace()],
        bump = token_state.token_state_bump
    )]
    pub token_state: Box<Account<'info, TokenState>>,
    #[account(
        mut,
        seeds = [token_state.key().as_ref(), b"base_token".as_ref()],
        bump = token_state.base_token_vault_bump
    )]
    pub base_token_vault: Box<Account<'info, TokenAccount>>,
    #[account(
        mut,
        constraint = user_base_token.mint == token_state.base_mint_address,
        constraint = &user_base_token.owner == user.to_account_info().key
    )]
    pub user_base_token: Box<Account<'info, TokenAccount>>,
    #[account(address = anchor_spl::token::ID)]
    pub token_program: Program<'info, Token>,
    #[account(address = system_program::ID)]
    pub system_program: Program<'info, System>,
}

pub fn handle(ctx: Context<BondingVaultTopup>, amount: u64) -> Result<()> {
    let token_state = &mut ctx.accounts.token_state;
    //increment total topup
    token_state.total_topup = token_state.total_topup.checked_add(amount).or_arith_error()?;
    //transfer to bonding vault
    transfers::transfer(
        ctx.accounts.user.to_account_info(),
        ctx.accounts.user_base_token.to_account_info(),
        ctx.accounts.base_token_vault.to_account_info(),
        ctx.accounts.token_program.to_account_info(),
        amount,
    )?;
    Ok(())
}
