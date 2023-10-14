use anchor_lang::prelude::*;
#[account]
#[derive(Default)]
pub struct TokenState {
    //adresses
    pub base_mint_address: Pubkey, //8 + 32 = 40
    pub base_mint_token_address: Pubkey, //72
    pub quote_mint_address: Pubkey, //104
    //bumps
    pub token_state_bump: u8,
    pub base_token_vault_bump: u8,
    //pub quote_mint_token_address: Pubkey, //136
    pub quote_reserve_token_address: Pubkey, //168
    pub total_reserve: u64,
    pub quote_surplus_token_address: Pubkey, //168
    pub total_surplus_reserve: u64,
    pub quote_runway_token_address: Pubkey, //168
    pub total_runway_reserve: u64,
    pub creator_address: Pubkey, //200
    //state
    pub epoch_count: u32, //232 //current epoch
    pub next_halving: u64, //296 //total supply needed for next epoch
    pub current_epoch_emissions: u64, //supply emitted this epoch
    pub total_epoch_emissions: u64, //supply that will be emitted for this epoch
    pub total_redeemed: u64, //424 //supply that has been redeemed
    pub bond_coupon_count: u64, //488 //total amount of bond coupons issued
    
    pub total_topup: u64, //how many base tokens have been deposited into the base vault
    pub quote_bonded: u64, //total quote tokens that have been bonded
    pub total_emissions: u64, //supply emitted in total
    
    pub initial_reserve: u64, //how much has already been minted, offset for the current_epoch_emissions
    pub mps: u64, //maximum potential supply if all bonding was at maximum period & rate
    pub avg_price: u64, //
    pub floor_price: u64, //
    pub emission_rate: u64, //552 //supply emitted per bonding cost
    pub bonding_cost: u64, //616 //cost of emission rate

    //bonding periods
    //TODO - how many periods?
    pub period_lengths: [i64; 10], //1256 //the length of bonding
    pub period_multipliers: [u32; 10], //1576 //multiplier for bonding longer
    pub period_enabled: [bool; 10], //1586 //which periods are enabled
    
    //bonding period totals
    //total quote bonded
    //pub quote_bonded: [u64; 10], //total quote bonded in period
    //pub base_emitted: [u64; 10], //total base emitted in period


    //controls
    pub voting_enabled_date: i64,
    pub updates_allowed: bool, //1715
    pub launch_date: i64, //1779
    pub runway_fee: u32,
    pub bps: u32,
    //indexing
    pub state_index: u64, //1843
    pub id: [u8; 20] //1863 + 92 = 1955
}