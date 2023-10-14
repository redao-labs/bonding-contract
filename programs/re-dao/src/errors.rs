use anchor_lang::prelude::*;
use std::result::Result as StdResult;


pub trait OrArithError<T> {
    fn or_arith_error(self) -> StdResult<T, Error>;
}
impl OrArithError<u128> for Option<u128> {
    fn or_arith_error(self) -> StdResult<u128, Error> {
        self.ok_or(error!(CustomErrorCode::ArithmeticError))
    }
}
impl OrArithError<u64> for Option<u64> {
    fn or_arith_error(self) -> StdResult<u64, Error> {
        self.ok_or(error!(CustomErrorCode::ArithmeticError))
    }
}
impl OrArithError<u8> for Option<u8> {
    fn or_arith_error(self) -> StdResult<u8, Error> {
        self.ok_or(error!(CustomErrorCode::ArithmeticError))
    }
}

#[error_code]
pub enum CustomErrorCode {
    #[msg("Reserve delta mismatch.")]
    ReserveDeltaMismatchError,
    #[msg("Runway fee can't exceed 100%.")]
    RunwayFeeError,
    #[msg("Period is disabled.")]
    DisabledPeriodError,
    #[msg("Amount must not be zero.")]
    AmountIsZeroError,
    #[msg("Initial reserve too large!")]
    InitialReserveTooLargeError,
    #[msg("Base and quote address match!")]
    BaseAndQuoteMatch,
    #[msg("Invalid creator!")]
    InvalidCreator,
    #[msg("Invalid id length!")]
    InvalidIdLength,
    #[msg("Period lengths must not be larger than 10")]
    PeriodLengthError,
    #[msg("Zero Error")]
    ZeroError,
    #[msg("Arithmetic Error")]
    ArithmeticError,
    #[msg("Overflow")]
    OverflowError,
    #[msg("Underflow")]
    UnderflowError,
}