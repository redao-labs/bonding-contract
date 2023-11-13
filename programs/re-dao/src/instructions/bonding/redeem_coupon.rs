use crate::errors::{CustomErrorCode, OrArithError};

use crate::structs::{TokenTrackerBase, TokenState, BondVote, BondCoupon};
use crate::transfers::transfers;
use crate::utils::ascii_trim::TrimAsciiWhitespace;

use anchor_lang::{
    prelude::{*},
    solana_program::system_program,
};
use anchor_spl::token::{TokenAccount, Token, self};

#[derive(Accounts)]
#[instruction(id: String)]

pub struct RedeemCoupon<'info> {
    #[account(
        mut,
        address = coupon.redeemer_address,
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
        seeds = [token_state.key().as_ref(), user.key().as_ref(), id.as_bytes()],
        bump = coupon.coupon_bump,
    )]
    pub coupon: Box<Account<'info, BondCoupon>>,
    #[account(
        mut,
        constraint = &user_base_token.mint == &token_state.base_mint_address,
        constraint = &user_base_token.owner == user.to_account_info().key
    )]
    pub user_base_token: Box<Account<'info, TokenAccount>>,
    #[account(
        mut,
        seeds = [token_state.key().as_ref(), b"base_token".as_ref()],
        bump = token_state.base_token_vault_bump
    )]
    pub base_token_vault: Box<Account<'info, TokenAccount>>,
    pub token_program: Program<'info, Token>,
    #[account(address = system_program::ID)]
    pub system_program: Program<'info, System>,
}


pub fn handle(ctx: Context<RedeemCoupon>, id: String) -> Result<()> {
    
    //check redemption date
    let base = &mut ctx.accounts.token_tracker_base;
    let token_state = &mut ctx.accounts.token_state;
    let coupon = &mut ctx.accounts.coupon;

    let clock = Clock::get()?;
    if clock.unix_timestamp > coupon.redemption_date {
        //send base tokens to user
        if !coupon.is_redeemed { 
            let id = token_state.id.as_ref();
            let base_key = base.key();
            let seeds = &[
                base_key.as_ref(),
                id.trim_ascii_whitespace(),
                &[token_state.token_state_bump],
            ];
            transfers::transfer_with_signer(
               token_state.to_account_info(),
                ctx.accounts.base_token_vault.to_account_info(),
                ctx.accounts.user_base_token.to_account_info(),
                ctx.accounts.token_program.to_account_info(),
                coupon.tokens_to_redeem,
                seeds,
            )?;
            //is_redeeemed = true
            coupon.is_redeemed = true;

            //update token state
            token_state.total_redeemed = token_state.total_redeemed.checked_add(coupon.tokens_to_redeem).or_arith_error()?;

            //close account -> send sol to user

        } else {
            return Err(error!(CustomErrorCode::CouponClaimedError));
            //throw
        }
        
    } else {
        return Err(error!(CustomErrorCode::CouponDateError));
        //throw
    }
    
    Ok(())
}