use crate::errors::{CustomErrorCode, OrArithError};
use crate::structs::{BondVote, TokenState, TokenTrackerBase, BondCoupon};
use crate::utils::ascii_trim::TrimAsciiWhitespace;
use crate::{
    calculations::calculations::{bond_amount, bond_reward, fee, floor_price, reserve, surplus},
    transfers::transfers,
};
use anchor_lang::{prelude::*, solana_program::system_program};
use anchor_spl::token::{self, Token, TokenAccount};

//TODO, store how much bonded and emitted through each period value!
#[derive(Accounts)]
#[instruction()]
pub struct Bond<'info> {
    #[account(mut)]
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
        constraint = &user_quote_token.mint == &token_state.quote_mint_address,
        constraint = &user_quote_token.owner == user.to_account_info().key
    )]
    pub user_quote_token: Box<Account<'info, TokenAccount>>,
    #[account(
        mut,
        constraint = &quote_runway_token_address.mint == &token_state.quote_mint_address,
        address = token_state.quote_runway_token_address,
    )]
    pub quote_runway_token_address: Box<Account<'info, TokenAccount>>,
    #[account(
        mut,
        constraint = &quote_reserve_token_address.mint == &token_state.quote_mint_address,
        address = token_state.quote_reserve_token_address,
    )]
    pub quote_reserve_token_address: Box<Account<'info, TokenAccount>>,
    #[account(
        mut,
        constraint = &quote_surplus_token_address.mint == &token_state.quote_mint_address,
        address = token_state.quote_surplus_token_address,
    )]
    pub quote_surplus_token_address: Box<Account<'info, TokenAccount>>,
    #[account(
        init,
        seeds = [token_state.key().as_ref(), user.key().as_ref(), 
        token_state.bond_coupon_count
        .checked_add(1)
        .or_arith_error()?
        .to_string().as_bytes()],
        bump,
        payer = user,
        space=420
    )]
    pub coupon: Box<Account<'info, BondCoupon>>,
    #[account(address = anchor_spl::token::ID)]
    pub token_program: Program<'info, Token>,
    #[account(address = system_program::ID)]
    pub system_program: Program<'info, System>,
}

pub fn handle(ctx: Context<Bond>, amount: u64, period_index: u8) -> Result<()> {
    //todo, min re out, could end up buying at next epoch accidentaly? specify epoch, epochs must == as a safety check
    //todo min amount should also cover runway fee too
    //TODO what if  amount to next halving is less than minimum amount? it is impossible to move forward?

    if amount == 0 {
        return Err(error!(CustomErrorCode::ZeroError));
    }
    let token_state = &mut ctx.accounts.token_state;
    //check if period_index is < 10
    if period_index as usize >= token_state.period_enabled.len() {
        return Err(error!(CustomErrorCode::PeriodLengthError));
    }
    //check if period index is enabled
    let period_enabled = token_state.period_enabled[period_index as usize];
    if !period_enabled {
        return Err(error!(CustomErrorCode::DisabledPeriodError));
    }

    //apply runway fee
    let runway_fee_amount = fee(
        amount,
        token_state.runway_fee.into(),
        token_state.bps.into(),
    )?;
    let mut amount_post_fee = amount.checked_sub(runway_fee_amount).or_arith_error()?;

    //bond cost is 0.01 sol per emission rate so calculate how much should be issued
    let period_length = token_state.period_lengths[period_index as usize];
    let multiplier: u64 = token_state.period_multipliers[period_index as usize].into();
    let cost = token_state.bonding_cost;
    let emissions = token_state.emission_rate;
    let bps = token_state.bps;
    let mut reward = bond_reward(amount, cost, emissions, multiplier, bps)?;
    // if the amount issued goes into the next epoch, reduce the amount and advance into the next epoch
    // add to total supply
    let mut new_total_emissions = token_state
        .total_emissions
        .checked_add(reward)
        .or_arith_error()?;
    let mut epoch_transition = false;

    if new_total_emissions > token_state.next_halving.into() {
        epoch_transition = true;
        let surplus_emissions = new_total_emissions
            .checked_div(token_state.next_halving)
            .or_arith_error()?;
        reward = reward.checked_sub(surplus_emissions).or_arith_error()?;
        amount_post_fee = bond_amount(reward, cost, emissions, multiplier.into(), bps)?;
        new_total_emissions = token_state
            .total_emissions
            .checked_add(reward)
            .or_arith_error()?;
    }

    // mps
    let last_true_index = token_state
        .period_enabled
        .iter()
        .enumerate()
        .rev()
        .find(|&(_, &item)| item)
        .map(|(index, _)| index)
        .unwrap();
    let max_multiplier: u64 = token_state.period_multipliers[last_true_index as usize].into();
    msg!(
        ":={}, {}, {}, {}, {}",
        amount_post_fee,
        cost,
        emissions,
        max_multiplier,
        bps
    );
    let mut max_reward = bond_reward(amount, cost, emissions, max_multiplier, bps)?;
    //add to total maximum supply
    let mut new_total_maximum_emissions =
        token_state.mps.checked_add(max_reward).or_arith_error()?;
    msg!(":={}, {}", new_total_maximum_emissions, max_reward);
    if new_total_maximum_emissions > token_state.next_halving {
        let surplus_emissions = new_total_emissions
            .checked_div(token_state.next_halving)
            .or_arith_error()?;
        max_reward = max_reward.checked_sub(surplus_emissions).or_arith_error()?;
        new_total_maximum_emissions = token_state.mps.checked_add(max_reward).or_arith_error()?;
        //amount is left out
    }

    token_state.total_emissions = new_total_emissions;
    token_state.mps = new_total_maximum_emissions;

    //add to quote bonded
    token_state.quote_bonded = token_state
        .quote_bonded
        .checked_add(amount_post_fee)
        .or_arith_error()?;
    //add to runway fee
    token_state.total_runway_reserve = token_state
        .total_runway_reserve
        .checked_add(runway_fee_amount)
        .or_arith_error()?;
    msg!(
        ":={},{}, {}",
        token_state.quote_bonded,
        token_state.mps,
        new_total_maximum_emissions
    );
    //calculate new floor price
    let new_floor_price = floor_price(token_state.quote_bonded, token_state.mps, 9)?;
    //calculate new reserve for this bond
    let mut new_reserve = reserve(new_floor_price, token_state.total_emissions, 9)?;
    //calculate new surplus for this bond
    let mut new_surplus = surplus(token_state.quote_bonded, new_reserve)?;
    if new_floor_price == 0 {
        //if the price is so low it registers as zero
        //all funds go to reserve
        new_reserve = token_state
            .total_reserve
            .checked_add(amount_post_fee)
            .or_arith_error()?;
        new_surplus = token_state.total_surplus_reserve;
    }
    msg!(":={},{}, {}", new_floor_price, new_reserve, new_surplus);
    //calculate difference
    //let floor_delta = new_floor_price.checked_sub(token_state.floor_price).or_arith_error()?;
    let reserve_delta = new_reserve
        .checked_sub(token_state.total_reserve)
        .or_arith_error()?;
    let surplus_delta = new_surplus
        .checked_sub(token_state.total_surplus_reserve)
        .or_arith_error()?;

    //reserve + suprlus == amount bonded
    let total_delta = reserve_delta.checked_add(surplus_delta).or_arith_error()?;
    if total_delta != amount_post_fee {
        return Err(error!(CustomErrorCode::ReserveDeltaMismatchError));
    }

    //set new reserve values
    token_state.floor_price = new_floor_price;
    token_state.total_reserve = new_reserve;
    token_state.total_surplus_reserve = new_surplus;

    // send quote tokens to reserve, surplus, runway
    if runway_fee_amount > 0 {
        transfers::transfer(
            ctx.accounts.user.to_account_info(),
            ctx.accounts.user_quote_token.to_account_info(),
            ctx.accounts.quote_runway_token_address.to_account_info(),
            ctx.accounts.token_program.to_account_info(),
            runway_fee_amount,
        )?;
    }
    //runway transfer
    
    if reserve_delta > 0 {
        //reserve transfer
        transfers::transfer(
            ctx.accounts.user.to_account_info(),
            ctx.accounts.user_quote_token.to_account_info(),
            ctx.accounts.quote_reserve_token_address.to_account_info(),
            ctx.accounts.token_program.to_account_info(),
            reserve_delta,
        )?;
    }

    if surplus_delta > 0 {
        //surplus transfer
        transfers::transfer(
            ctx.accounts.user.to_account_info(),
            ctx.accounts.user_quote_token.to_account_info(),
            ctx.accounts.quote_surplus_token_address.to_account_info(),
            ctx.accounts.token_program.to_account_info(),
            surplus_delta,
        )?;
    }

    // create bonding coupon

    // if epoch transition, next epoch

    // else advance current epoch

    //apply vote if exists

    if epoch_transition {}
    Ok(())
}
