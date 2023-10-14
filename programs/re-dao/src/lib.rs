mod structs;
mod instructions;
mod params;
mod constants;
mod errors;
mod utils;
mod transfers;
mod calculations;

use anchor_lang::prelude::*;
use instructions::*;
use params::*;
declare_id!("2HwuzQnLG3HznwMPh6TNT3v1P5Pb1EWujLrzTrFgYWZT");

#[program]
pub mod re_dao {
    use crate::params::CreateBondingTokenParams;

    use super::*;

    pub fn create_base_tracker(
        ctx: Context<CreateBaseTracker>,
        id: String
    ) -> Result<()> {
        instructions::create_base_tracker::handle(ctx, id)
    }

    pub fn create_bonding_token(
        ctx: Context<CreateBondingToken>,
        id: String,
        params: CreateBondingTokenParams
    ) -> Result<()> {
        instructions::create_bonding_token::handle(ctx, id, params)
    }

    pub fn create_vote_account(
        ctx: Context<CreateVoteAccount>,
        id: String
    ) -> Result<()> {
        instructions::create_vote_account::handle(ctx, id)
    }

    pub fn bonding_vault_topup(
        ctx: Context<BondingVaultTopup>,
        amount: u64
    ) -> Result<()> {
        instructions::bonding_vault_topup::handle(ctx, amount)
    }

    pub fn bond(
        ctx: Context<Bond>,
        amount: u64,
        period_index: u8,
    ) -> Result<()> {
        instructions::bond::handle(ctx, amount, period_index)
    }
}

