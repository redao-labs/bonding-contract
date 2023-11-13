use anchor_spl::token;

use crate::errors::*;
use crate::params::init::CreateBondingTokenParams;
use crate::structs::TokenState;
use crate::structs::{
    token_tracker_base::TokenTrackerBase,
    token_tracker::TokenTracker
};
use crate::utils::ascii_trim::TrimAsciiWhitespace;
use crate::constants::constants::AUTH;
use {anchor_lang::{
        prelude::{*},
        solana_program::system_program,
    },
    anchor_spl::token::{Mint, Token, TokenAccount, ID}
};
#[derive(Accounts)]
#[instruction(id: String)]
pub struct CreateBondingToken<'info> {
    #[account(
        mut,
        address = AUTH.parse::<Pubkey>().unwrap(),
    )]
    pub creator: Signer<'info>,
    #[account(
        mut,
        seeds = [token_tracker_base.id.as_ref().trim_ascii_whitespace()],
        bump = token_tracker_base.token_tracker_bump,
    )]
    pub token_tracker_base: Account<'info, TokenTrackerBase>,
    #[account(
        init,
        seeds = [
            token_tracker_base.key().as_ref(), 
            token_tracker_base.index
            .checked_add(1)
            .or_arith_error()?
            .to_string().as_bytes()],
        bump,
        payer = creator,
        space=132
    )]
    pub token_tracker: Box<Account<'info, TokenTracker>>,
    #[account(
        init,
        seeds = [token_tracker_base.key().as_ref(), id.as_bytes()],
        bump,
        payer = creator,
        space=2200
    )]
    pub token_state: Box<Account<'info, TokenState>>,
    #[account(
        constraint = base_mint.to_account_info().owner == &ID,
        constraint = base_mint.decimals >= 1,
        constraint = base_mint.decimals == quote_mint.decimals 
    )]
    pub base_mint: Box<Account<'info, Mint>>,
    #[account(init,
        token::mint = base_mint,
        token::authority = token_state,
        seeds = [token_state.key().as_ref(), b"base_token".as_ref()],
        bump,
        payer = creator
    )]
    pub base_token_vault: Box<Account<'info, TokenAccount>>,
    #[account(
        constraint = quote_mint.to_account_info().owner == &ID,
        constraint = quote_mint.decimals >= 1,
        constraint = quote_mint.decimals == base_mint.decimals
    )]
    pub quote_mint: Box<Account<'info, Mint>>,
    #[account(
        mut,
        constraint = &quote_reserve_token_address.mint == quote_mint.to_account_info().key
    )]
    pub quote_reserve_token_address: Box<Account<'info, TokenAccount>>,
    #[account(
        mut,
        constraint = &quote_reserve_token_address.mint == quote_mint.to_account_info().key
    )]
    pub quote_surplus_token_address: Box<Account<'info, TokenAccount>>,
    #[account(
        mut,
        constraint = &quote_reserve_token_address.mint == quote_mint.to_account_info().key
    )]
    pub quote_runway_token_address: Box<Account<'info, TokenAccount>>,
    #[account(address = ID)]
    pub token_program: Program<'info, Token>,
    #[account(address = system_program::ID)]
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

fn validate(params: CreateBondingTokenParams) -> Result<()> {
    if params.next_halving == 0 {
        return Err(error!(CustomErrorCode::ZeroError));
    }
    if params.emission_rate == 0 {
        return Err(error!(CustomErrorCode::ZeroError));
    }
    if params.bonding_cost == 0 {
        return Err(error!(CustomErrorCode::ZeroError));
    }
    if params.period_lengths.len() != 10 {
        return Err(error!(CustomErrorCode::PeriodLengthError));
    }
    if params.period_multipliers.len() != 10 {
        return Err(error!(CustomErrorCode::PeriodLengthError));
    }
    if params.period_enabled.len() != 10 {
        return Err(error!(CustomErrorCode::PeriodLengthError));
    }
    if (params.initial_reserve) > params.next_halving {
        return Err(error!(CustomErrorCode::InitialReserveTooLargeError)); //todo, just auto go into next epoch?
    }
    //additional validation
    //period multipliers are larger than prev - if enabled
    //period lengths are larger than prev - if enabled
    //next halving > emission rate
    //first period is always 1000
    //max decimals vs supply max_decimals = floor(log10(2^64/max_whole_units_supply))
    Ok(())
}
#[access_control(validate(params))]
pub fn handle(ctx: Context<CreateBondingToken>, id: String, params: CreateBondingTokenParams) -> Result<()> {

    let id_bytes = id.as_bytes();
    if id_bytes.len() >= 20 {
        return Err(error!(CustomErrorCode::InvalidIdLength));
    }
    let mut id_data = [b' '; 20];
    id_data[..id_bytes.len()].copy_from_slice(id_bytes);

    //TODO, add vanity ID costs.

    let token_state = &mut ctx.accounts.token_state;
    let token_tracker = &mut ctx.accounts.token_tracker;
    let token_tracker_base = &mut ctx.accounts.token_tracker_base;

    if token_tracker_base.index == 0 {
        if ctx.accounts.creator.key() != AUTH.parse::<Pubkey>().unwrap() {
            return Err(error!(CustomErrorCode::InvalidCreator));
        }
    }
    token_tracker_base.index = token_tracker_base.index.checked_add(1).or_arith_error()?;
    token_tracker.token_state = token_state.key();
    token_tracker.id = id_data;
    token_tracker.index = token_tracker_base.index;
    token_tracker.token_tracker_bump = *ctx.bumps.get("token_tracker").unwrap();

    //
    token_state.base_mint_address = ctx.accounts.base_mint.key();
    token_state.base_mint_token_address = ctx.accounts.base_token_vault.key();
    token_state.quote_mint_address = ctx.accounts.quote_mint.key();
    token_state.quote_reserve_token_address = ctx.accounts.quote_reserve_token_address.key();
    token_state.quote_surplus_token_address = ctx.accounts.quote_surplus_token_address.key();
    token_state.quote_runway_token_address = ctx.accounts.quote_runway_token_address.key();
    if token_state.base_mint_address == token_state.quote_mint_address {
        return Err(error!(CustomErrorCode::BaseAndQuoteMatch));
    }

    //state
    token_state.state_index = token_tracker.index;
    token_state.creator_address = ctx.accounts.creator.key();
    token_state.next_halving = params.next_halving;
    token_state.emission_rate = params.emission_rate;
    token_state.bonding_cost = params.bonding_cost;
    token_state.initial_reserve = params.initial_reserve;
    token_state.launch_date = params.launch_date;
    token_state.period_enabled = params.period_enabled;
    token_state.period_multipliers = params.period_multipliers;
    token_state.period_lengths = params.period_lengths;
    token_state.updates_allowed = params.updates_allowed;
    token_state.voting_enabled_date = params.voting_enabled_date;

    token_state.epoch_count = 0;
    token_state.current_epoch_emissions = params.initial_reserve;
    token_state.total_emissions = params.initial_reserve;
    token_state.quote_bonded = 0;
    token_state.total_topup = 0;

    token_state.mps = params.initial_reserve;
    token_state.avg_price = 0;
    token_state.floor_price = 0;
    token_state.total_reserve = 0;
    token_state.total_surplus_reserve = 0;
    token_state.total_runway_reserve = 0;
    token_state.bps = 100000;
    if params.runway_fee > token_state.bps {
        return Err(error!(CustomErrorCode::RunwayFeeError));
    }
    token_state.runway_fee = params.runway_fee;
    

    //bumps
    token_state.id = id_data;
    token_state.token_state_bump = *ctx.bumps.get("token_state").unwrap();
    token_state.base_token_vault_bump = *ctx.bumps.get("base_token_vault").unwrap();

    Ok(())
}