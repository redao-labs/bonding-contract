use anchor_lang::prelude::*;
use crate::errors::OrArithError;

pub fn total_emissions_at_epoch(genesis_supply: u64, epoch: u32) -> Result<u64> {
    //supply = genesis_supply * sum(1 /2^n) where n is us the amount of iterations
    let mut sum = 0 as u64;
    for n in 0..epoch {
        let eq_0 = (2 as u64).checked_pow(n).or_arith_error()?;
        let eq_1 = (1 as u64).checked_div(eq_0).or_arith_error()?;
        sum = sum.checked_add(eq_1).or_arith_error()?;
    } 
    let supply = genesis_supply.checked_mul(sum).or_arith_error()?;
    Ok(supply)
}

pub fn epoch_emissions(epoch: u32, genesis_emissions: u64) -> Result<u64> {    
    //e = genesis base emissions / 2^epoch
    let eq_0 = (2 as u64).checked_pow(epoch.into()).or_arith_error()?;
    let eq_final = genesis_emissions.checked_div(eq_0).or_arith_error()?;
    Ok(eq_final)
}

pub fn epoch_emission_rate(epoch: u32, genesis_emission_rate: u64) -> Result<u64> {
    //e = genesis base emissions / 2^epoch
    let eq_0 = (2 as u64).checked_pow(epoch.into()).or_arith_error()?;
    let eq_final = genesis_emission_rate.checked_div(eq_0).or_arith_error()?;
    Ok(eq_final)
}

pub fn surplus(quote_bonded: u64, reserve: u64) -> Result<u64> {
    //quote bonded - reserve
    let eq_final = quote_bonded.checked_sub(reserve).or_arith_error()?;
    Ok(eq_final)
}

pub fn reserve(floor_price: u64, total_emissions: u64, quote_decimals: u8) -> Result<u64> {
    //quote bonded / mps
    //TODO as floor price is leveled up, have to leve it down after eq
    let eq_0 = floor_price.checked_mul(total_emissions).or_arith_error()?;

    let base = 10 as u64;
    let base_pow = base.checked_pow(quote_decimals.into()).or_arith_error()?;
    let eq_final = eq_0.checked_div(base_pow).or_arith_error()?;
    Ok(eq_final)
}

pub fn floor_price(quote_bonded: u64, mps: u64, quote_decimals: u8) -> Result<u64> {
    //quote bonded / mps
    //TODO - have to multiply floor pool by 10^number of decimals?
    let base = 10 as u64;
    let base_pow = base.checked_pow(quote_decimals.into()).or_arith_error()?;
    let quote_bonded_n = quote_bonded.checked_mul(base_pow).or_arith_error()?;
    let eq_final = quote_bonded_n.checked_div(mps).or_arith_error()?;
    //TODO subtract downbards 1 point?
    Ok(eq_final)
}

pub fn bond_reward(amount: u64, cost: u64, emissions: u64, multiplier: u64, bps: u32) -> Result<u64> {
    //(((amount / cost) * emissions) * multiplier) / bps
    //amount * emissions -
    let eq_0: u128 = (amount as u128).checked_mul(emissions.into()).or_arith_error()?;
    //(amount / cost) * emissions
    let eq_1 = eq_0.checked_div(cost.into()).or_arith_error()?;
    //((amount / cost) * emissions) * multiplier
    let eq_2 = eq_1.checked_mul(multiplier.into()).or_arith_error()?;
    //(((amount / cost) * emissions) * multiplier) / bps
    let eq_final = eq_2.checked_div(bps.into()).or_arith_error()?;
    Ok(eq_final.try_into().unwrap())
}

pub fn bond_amount(bond_reward: u64, cost: u64, emissions: u64, multiplier: u64, bps: u32) -> Result<u64> {
    //(bps * bond_reward * cost)/(multiplier * emissions)
    //bps * bond_reward * cost
    let eq_0 = (bps as u64)
        .checked_mul(bond_reward).or_arith_error()?
        .checked_mul(cost).or_arith_error()?;
    //multiplier * emissions
    let eq_1 = multiplier.checked_mul(emissions).or_arith_error()?;
    //(bps * bond_reward * cost)/(multiplier * emissions)
    let eq_final = eq_0.checked_div(eq_1).or_arith_error()?;
    Ok(eq_final)
}

pub fn fee(amount: u64, fee: u64, max_bps: u64) -> Result<u64> {
    //(amount * fee) / max_bps
    let res = amount
        .checked_mul(fee)
        .or_arith_error()?
        .checked_div(max_bps)
        .or_arith_error()?;
    Ok(res)
}