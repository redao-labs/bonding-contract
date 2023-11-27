use crate::calculations::calculations::{total_emissions_at_epoch, epoch_emissions, epoch_emission_rate};
use crate::errors::{CustomErrorCode, OrArithError};
use crate::structs::{BondVote, TokenState, TokenTrackerBase, BondCoupon};
use crate::utils::ascii_trim::TrimAsciiWhitespace;
use crate::{
    calculations::calculations::{bond_amount, bond_reward, fee, floor_price, reserve, surplus},
    transfers::transfers,
};
use anchor_lang::solana_program::vote;
use anchor_lang::{prelude::*, solana_program::system_program};
use anchor_spl::token::{self, Token, TokenAccount};
use anchor_lang::prelude::Clock;

//TODO, store how much bonded and emitted through each period value!
#[derive(Accounts)]
#[instruction(id: String)]
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
        seeds = [token_state.key().as_ref(), user.key().as_ref(), id.as_bytes()],
        bump,
        payer = user,
        space=420
    )]
    pub coupon: Box<Account<'info, BondCoupon>>,
    #[account(
        mut,
        constraint = &bond_vote.token_state_address == token_state.to_account_info().key
    )]
    pub bond_vote: Option<Account<'info, BondVote>>,
    pub token_program: Program<'info, Token>,
    #[account(address = system_program::ID)]
    pub system_program: Program<'info, System>,
}

pub fn handle(ctx: Context<Bond>, id: String, amount: u64, period_index: u8) -> Result<()> {
    //todo, min re out, could end up buying at next epoch accidentaly? specify epoch, epochs must == as a safety check
    //todo min amount should also cover runway fee too
    //TODO what if  amount to next halving is less than minimum amount? it is impossible to move forward? add min bond amount
    //todo check if pool is launched
    let id_bytes = id.as_bytes();
    if id_bytes.len() > 10 {
        return Err(error!(CustomErrorCode::InvalidIdLength));
    }
    let mut id_data = [b' '; 10];
    id_data[..id_bytes.len()].copy_from_slice(id_bytes);

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

    let mut amount_mut = amount;
    //apply runway fee
    let mut runway_fee_amount = fee(
        amount_mut,
        token_state.runway_fee.into(),
        token_state.fee_bps.into(),
    )?;
    let mut amount_post_fee = amount_mut.checked_sub(runway_fee_amount).or_arith_error()?;

    //bond cost is 0.01 sol per emission rate so calculate how much should be issued
    let period_length = token_state.period_lengths[period_index as usize];
    let multiplier: u64 = token_state.period_multipliers[period_index as usize].into();
    let treasury_split: u64 = token_state.treasury_split[period_index as usize].into();
    let cost = token_state.bonding_cost;
    let emissions = token_state.emission_rate;
    let mut reward = bond_reward(amount, cost, emissions, multiplier, token_state.reward_bps)?;
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
        amount_mut = bond_amount(reward, cost, emissions, multiplier.into(), token_state.fee_bps)?;
        runway_fee_amount = fee(
            amount_mut,
            token_state.runway_fee.into(),
            token_state.fee_bps.into(),
        )?;
        amount_post_fee = amount_mut.checked_sub(runway_fee_amount).or_arith_error()?;
        new_total_emissions = token_state
            .total_emissions
            .checked_add(reward)
            .or_arith_error()?;
        // msg!(
        //     "epoch crossover, reducing amounts:=reward-{reward}, {}, {}, {}, {}",
        //     amount_post_fee,
        //     cost,
        //     emissions,
        //     max_multiplier,
        //     token_state.reward_bps
        // );
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
        token_state.reward_bps
    );
    let mut max_reward = bond_reward(amount, cost, emissions, max_multiplier, token_state.reward_bps)?;
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
    
    //base pool allocation
    //growth pool
    //add growth pool fee to base pool
    //apply runway fee
    msg!(
        "amtpostfee:={},{}, {}",
        amount_post_fee,
        multiplier,
        token_state.reward_bps
    );
    let growth_pool_amount = fee(
        amount_post_fee,
        treasury_split,
        token_state.fee_bps.into(),
    )?;
    let base_pool_amount = amount_post_fee.checked_sub(growth_pool_amount).or_arith_error()?;
    msg!(
        "bb:={},{}",
        growth_pool_amount,
        base_pool_amount
    );
    //token_state.floor_price = new_floor_price;
    token_state.total_reserve = token_state.total_reserve.checked_add(base_pool_amount).or_arith_error()?;
    token_state.total_surplus_reserve = token_state.total_surplus_reserve.checked_add(growth_pool_amount).or_arith_error()?;
    // send quote tokens to reserve, surplus, runway
    if runway_fee_amount > 0 {
        //runway transfer
        transfers::transfer(
            ctx.accounts.user.to_account_info(),
            ctx.accounts.user_quote_token.to_account_info(),
            ctx.accounts.quote_runway_token_address.to_account_info(),
            ctx.accounts.token_program.to_account_info(),
            runway_fee_amount,
        )?;
    }
    
    
    if base_pool_amount > 0 {
        //reserve transfer
        transfers::transfer(
            ctx.accounts.user.to_account_info(),
            ctx.accounts.user_quote_token.to_account_info(),
            ctx.accounts.quote_reserve_token_address.to_account_info(),
            ctx.accounts.token_program.to_account_info(),
            base_pool_amount,
        )?;
    }

    if growth_pool_amount > 0 {
        //surplus transfer
        transfers::transfer(
            ctx.accounts.user.to_account_info(),
            ctx.accounts.user_quote_token.to_account_info(),
            ctx.accounts.quote_surplus_token_address.to_account_info(),
            ctx.accounts.token_program.to_account_info(),
            growth_pool_amount,
        )?;
    }

    //create bonding coupon
    token_state.bond_coupon_count = token_state.bond_coupon_count.checked_add(1).or_arith_error()?;
    let coupon = &mut ctx.accounts.coupon;
    coupon.is_redeemed = false;
    coupon.coupon_count = token_state.bond_coupon_count;
    coupon.period_index = period_index;
    coupon.token_state_address = token_state.key();
    coupon.redeemer_address = ctx.accounts.user.key();
    let clock = Clock::get()?;
    coupon.redemption_date = clock.unix_timestamp.checked_add(period_length).unwrap();
    coupon.tokens_to_redeem = reward;
    coupon.coupon_bump = *ctx.bumps.get("coupon").unwrap();
    coupon.id = id_data;
    //if epoch transition, next epoch
    if epoch_transition {
        //next epoch, iterate current epoch to next epoch
        token_state.epoch_count = token_state.epoch_count.checked_add(1).unwrap();
        //total emitted for new epoch
        token_state.total_epoch_emissions = epoch_emissions(token_state.epoch_count, token_state.genesis_supply)?;
        token_state.current_epoch_emissions = 0;
        //next halving
        token_state.next_halving = total_emissions_at_epoch(token_state.genesis_supply, token_state.epoch_count)?;
        //update emissions
        token_state.emission_rate = epoch_emission_rate(token_state.epoch_count, token_state.genesis_emission_rate)?;
    }
    //else advance current epoch
    else {
        token_state.current_epoch_emissions = token_state.current_epoch_emissions.checked_add(reward).or_arith_error()?;
    }
    //apply vote if exists
    //check for optional account
    //if account exists and voting is enabled, add points
    if token_state.voting_enabled_date > clock.unix_timestamp {
        let vote_account = &mut ctx.accounts.bond_vote;
        if let Some(vote) = vote_account {
            vote.total_votes = vote.total_votes.checked_add(amount).or_arith_error()?;
        }
    }
    Ok(())
}
