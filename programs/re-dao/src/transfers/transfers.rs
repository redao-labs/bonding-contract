use anchor_lang::prelude::*;

pub fn transfer_with_signer<'info>(
    authority: AccountInfo<'info>,
    from: AccountInfo<'info>,
    to: AccountInfo<'info>,
    token_program: AccountInfo<'info>,
    amount: u64,
    seeds: &[&[u8]]
) -> Result<()> {
    let signer = &[&seeds[..]];
    let cpi_accounts = anchor_spl::token::Transfer {
        from: from,
        to: to,
        authority: authority,
    };
    let cpi_program = token_program;
    let cpi_ctx = CpiContext::new_with_signer(cpi_program, cpi_accounts, signer);
    return anchor_spl::token::transfer(cpi_ctx, amount);
}

pub fn transfer<'info>(
    authority: AccountInfo<'info>,
    from: AccountInfo<'info>,
    to: AccountInfo<'info>,
    token_program: AccountInfo<'info>,
    amount: u64,
) -> Result<()> {
    let cpi_accounts = anchor_spl::token::Transfer {
        from: from,
        to: to,
        authority: authority,
    };
    let cpi_program = token_program;
    let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);
    return anchor_spl::token::transfer(cpi_ctx, amount);
}
