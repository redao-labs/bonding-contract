use anchor_lang::prelude::*;
#[account]
#[derive(Default)]
//TODO - bond coupon accounts should be closed after redemption. Filter by redeemer address with GPA. GPA valid RPCs = quicknode, alchemy, triton one, ankr
pub struct BondCoupon {
    pub redemption_date: i64, //8 + 64
    pub is_redeemed: bool, //65
    pub period_index: u8, 
    pub coupon_count: u64,
    pub tokens_to_redeem: u64, // 129
    pub redeemer_address: Pubkey,
    pub token_state_address: Pubkey,
    pub coupon_bump: u8,
    pub id: [u8; 10] //1863 + 92 = 1955
}