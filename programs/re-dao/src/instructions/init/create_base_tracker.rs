use anchor_lang::solana_program::native_token::LAMPORTS_PER_SOL;
use crate::errors::*;

use crate::structs::token_tracker_base::TokenTrackerBase;
use crate::constants::constants::AUTH;
use {anchor_lang::{
        prelude::{*},
        solana_program::system_program,
    },
    anchor_spl::token::{Mint, Token, TokenAccount, ID}
};
#[derive(Accounts)]
#[instruction(id: String)]
pub struct CreateBaseTracker<'info> {
    #[account(
        mut,
        address = AUTH.parse::<Pubkey>().unwrap(),
    )]
    pub creator: Signer<'info>,
    #[account(
        init,
        seeds = [id.as_ref()],
        bump,
        payer = creator,
        space=261
    )]
    pub token_tracker_base: Account<'info, TokenTrackerBase>,
    #[account(
        constraint = payment_mint.to_account_info().owner == &ID,
        constraint = payment_mint.decimals >= 1
    )]
    pub payment_mint: Box<Account<'info, Mint>>,
    #[account(
        mut,
        constraint = &payment_token_address.mint == payment_mint.to_account_info().key
    )]
    pub payment_token_address: Box<Account<'info, TokenAccount>>,
    #[account(address = system_program::ID)]
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}
pub fn handle(ctx: Context<CreateBaseTracker>, id: String) -> Result<()> {
    let tracker: &mut Account<'_, TokenTrackerBase> = &mut ctx.accounts.token_tracker_base;
    tracker.token_tracker_bump = *ctx.bumps.get("token_tracker_base").unwrap();
    tracker.index = 0;
    let id_bytes: &[u8] = id.as_bytes();
    let mut id_data: [u8; 20] = [b' '; 20];
    id_data[..id_bytes.len()].copy_from_slice(id_bytes);
    tracker.id = id_data;

    //set auth
    tracker.auth_wallet = ctx.accounts.creator.key();

    //set receive wallet
    tracker.receive_token_account = ctx.accounts.payment_token_address.key();

    //cost - TODO -> is it maybe better to funnel this through bonding? must bond at least x SOL for creating
    tracker.cost = (15 as u64)
        .checked_mul(LAMPORTS_PER_SOL)
        .or_arith_error()?;

    //enabled
    tracker.enabled = false;
    tracker.total_received = 0;
    Ok(())
}