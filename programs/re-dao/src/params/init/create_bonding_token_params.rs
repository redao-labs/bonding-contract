use anchor_lang::prelude::*;

#[derive(AnchorSerialize, AnchorDeserialize, Default, Copy, Clone)]
pub struct CreateBondingTokenParams {
    pub next_halving: u64,
    pub emission_rate: u64,
    pub bonding_cost: u64,
    pub initial_reserve: u64,
    pub period_lengths: [i64; 10],
    pub period_multipliers: [u32; 10],
    pub treasury_split: [u32; 10],
    pub period_enabled: [bool; 10],
    //controls
    pub updates_allowed: bool,
    pub voting_enabled_date: i64,
    pub launch_date: i64,
    pub runway_fee: u32,
}