use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};

declare_id!("6K4Er44wfQDDnGNUbRc8ucrceb5iwAJi8bEtbbpzKbQc");

/// Seed constants
const POOL_SEED: &[u8] = b"pool";
const VAULT_SEED: &[u8] = b"vault";
const FEE_VAULT_SEED: &[u8] = b"fee_vault";
const POSITION_SEED: &[u8] = b"position";

#[program]
pub mod chips_staking {
    use super::*;

    pub fn initialize_pool(
        ctx: Context<InitializePool>,
        agent_index: u8,
        fee_basis_points: u16,
    ) -> Result<()> {
        require!(agent_index < 8, StakingError::InvalidAgentIndex);
        require!(fee_basis_points <= 1000, StakingError::FeeTooHigh);

        let pool = &mut ctx.accounts.pool;
        pool.agent_index = agent_index;
        pool.authority = ctx.accounts.authority.key();
        pool.mint = ctx.accounts.mint.key();
        pool.vault = ctx.accounts.vault.key();
        pool.fee_vault = ctx.accounts.fee_vault.key();
        pool.total_shares = 0;
        pool.total_assets = 0;
        pool.deposited_amount = 0;
        pool.fee_basis_points = fee_basis_points;
        pool.paused = false;
        pool.bump = ctx.bumps.pool;
        pool.vault_bump = ctx.bumps.vault;
        pool.fee_vault_bump = ctx.bumps.fee_vault;

        msg!("Pool initialized for agent {}", agent_index);
        Ok(())
    }

    pub fn deposit(ctx: Context<Deposit>, amount: u64) -> Result<()> {
        require!(amount > 0, StakingError::ZeroAmount);
        require!(!ctx.accounts.pool.paused, StakingError::PoolPaused);

        let pool = &ctx.accounts.pool;
        let fee = amount
            .checked_mul(pool.fee_basis_points as u64)
            .unwrap()
            .checked_div(10_000)
            .unwrap();
        let net_amount = amount.checked_sub(fee).unwrap();

        let new_shares = if pool.total_shares == 0 {
            net_amount
        } else {
            net_amount
                .checked_mul(pool.total_shares)
                .unwrap()
                .checked_div(pool.total_assets)
                .unwrap()
        };
        require!(new_shares > 0, StakingError::ZeroShares);

        // Transfer net deposit to vault
        token::transfer(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.user_token_account.to_account_info(),
                    to: ctx.accounts.vault.to_account_info(),
                    authority: ctx.accounts.user.to_account_info(),
                },
            ),
            net_amount,
        )?;

        // Transfer fee to fee_vault
        if fee > 0 {
            token::transfer(
                CpiContext::new(
                    ctx.accounts.token_program.to_account_info(),
                    Transfer {
                        from: ctx.accounts.user_token_account.to_account_info(),
                        to: ctx.accounts.fee_vault.to_account_info(),
                        authority: ctx.accounts.user.to_account_info(),
                    },
                ),
                fee,
            )?;
        }

        let pool = &mut ctx.accounts.pool;
        pool.total_shares = pool.total_shares.checked_add(new_shares).unwrap();
        pool.total_assets = pool.total_assets.checked_add(net_amount).unwrap();
        pool.deposited_amount = pool.deposited_amount.checked_add(amount).unwrap();

        let position = &mut ctx.accounts.position;
        position.pool = pool.key();
        position.owner = ctx.accounts.user.key();
        position.shares = position.shares.checked_add(new_shares).unwrap();
        position.deposited_amount = position.deposited_amount.checked_add(amount).unwrap();
        position.bump = ctx.bumps.position;

        msg!("Deposited {} (net {}), minted {} shares", amount, net_amount, new_shares);
        Ok(())
    }

    pub fn withdraw(ctx: Context<Withdraw>, shares: u64) -> Result<()> {
        require!(shares > 0, StakingError::ZeroAmount);

        let position = &ctx.accounts.position;
        require!(position.shares >= shares, StakingError::InsufficientShares);

        let pool = &ctx.accounts.pool;
        let asset_value = shares
            .checked_mul(pool.total_assets)
            .unwrap()
            .checked_div(pool.total_shares)
            .unwrap();
        let fee = asset_value
            .checked_mul(pool.fee_basis_points as u64)
            .unwrap()
            .checked_div(10_000)
            .unwrap();
        let payout = asset_value.checked_sub(fee).unwrap();
        require!(payout > 0, StakingError::ZeroAmount);

        let agent_idx = [pool.agent_index];
        let vault_bump = [pool.vault_bump];
        let vault_seeds: &[&[u8]] = &[VAULT_SEED, &agent_idx, &vault_bump];
        let signer_seeds = &[vault_seeds];

        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.vault.to_account_info(),
                    to: ctx.accounts.user_token_account.to_account_info(),
                    authority: ctx.accounts.vault.to_account_info(),
                },
                signer_seeds,
            ),
            payout,
        )?;

        if fee > 0 {
            token::transfer(
                CpiContext::new_with_signer(
                    ctx.accounts.token_program.to_account_info(),
                    Transfer {
                        from: ctx.accounts.vault.to_account_info(),
                        to: ctx.accounts.fee_vault.to_account_info(),
                        authority: ctx.accounts.vault.to_account_info(),
                    },
                    signer_seeds,
                ),
                fee,
            )?;
        }

        let pool = &mut ctx.accounts.pool;
        pool.total_shares = pool.total_shares.checked_sub(shares).unwrap();
        pool.total_assets = pool.total_assets.checked_sub(asset_value).unwrap();

        let position = &mut ctx.accounts.position;
        position.shares = position.shares.checked_sub(shares).unwrap();

        msg!("Withdrew {} shares, payout {} (fee {})", shares, payout, fee);
        Ok(())
    }

    pub fn update_bankroll(ctx: Context<UpdateBankroll>, new_total: u64) -> Result<()> {
        let pool = &mut ctx.accounts.pool;
        let old = pool.total_assets;
        pool.total_assets = new_total;
        msg!("Bankroll updated: {} -> {}", old, new_total);
        Ok(())
    }

    pub fn set_paused(ctx: Context<SetPaused>, paused: bool) -> Result<()> {
        ctx.accounts.pool.paused = paused;
        msg!("Pool paused: {}", paused);
        Ok(())
    }

    /// Transfer tokens from vault back to an agent wallet to cover losses.
    /// Only callable by pool authority. Decreases total_assets accordingly.
    pub fn cover_loss(ctx: Context<CoverLoss>, amount: u64) -> Result<()> {
        require!(amount > 0, StakingError::ZeroAmount);

        let pool = &ctx.accounts.pool;
        require!(pool.total_assets >= amount, StakingError::InsufficientAssets);

        let agent_idx = [pool.agent_index];
        let vault_bump = [pool.vault_bump];
        let vault_seeds: &[&[u8]] = &[VAULT_SEED, &agent_idx, &vault_bump];
        let signer_seeds = &[vault_seeds];

        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.vault.to_account_info(),
                    to: ctx.accounts.destination.to_account_info(),
                    authority: ctx.accounts.vault.to_account_info(),
                },
                signer_seeds,
            ),
            amount,
        )?;

        let pool = &mut ctx.accounts.pool;
        pool.total_assets = pool.total_assets.checked_sub(amount).unwrap();

        msg!("Covered loss: {} tokens from vault", amount);
        Ok(())
    }

    pub fn collect_fees(ctx: Context<CollectFees>, amount: u64) -> Result<()> {
        require!(amount > 0, StakingError::ZeroAmount);

        let pool = &ctx.accounts.pool;
        let agent_idx = [pool.agent_index];
        let bump = [pool.bump];
        let pool_seeds: &[&[u8]] = &[POOL_SEED, &agent_idx, &bump];
        let signer = &[pool_seeds];

        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.fee_vault.to_account_info(),
                    to: ctx.accounts.admin_token_account.to_account_info(),
                    authority: ctx.accounts.pool.to_account_info(),
                },
                signer,
            ),
            amount,
        )?;

        msg!("Collected {} fees", amount);
        Ok(())
    }
}

// ─── Accounts ───────────────────────────────────────────────

#[derive(Accounts)]
#[instruction(agent_index: u8)]
pub struct InitializePool<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        init,
        payer = authority,
        space = 8 + Pool::INIT_SPACE,
        seeds = [POOL_SEED, &[agent_index]],
        bump,
    )]
    pub pool: Account<'info, Pool>,

    #[account(
        init,
        payer = authority,
        token::mint = mint,
        token::authority = vault,
        seeds = [VAULT_SEED, &[agent_index]],
        bump,
    )]
    pub vault: Account<'info, TokenAccount>,

    #[account(
        init,
        payer = authority,
        token::mint = mint,
        token::authority = pool,
        seeds = [FEE_VAULT_SEED, &[agent_index]],
        bump,
    )]
    pub fee_vault: Account<'info, TokenAccount>,

    pub mint: Account<'info, Mint>,
    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct Deposit<'info> {
    #[account(mut)]
    pub user: Signer<'info>,

    #[account(
        mut,
        has_one = vault,
        has_one = fee_vault,
    )]
    pub pool: Account<'info, Pool>,

    #[account(mut)]
    pub vault: Account<'info, TokenAccount>,

    #[account(mut)]
    pub fee_vault: Account<'info, TokenAccount>,

    #[account(
        init_if_needed,
        payer = user,
        space = 8 + Position::INIT_SPACE,
        seeds = [POSITION_SEED, pool.key().as_ref(), user.key().as_ref()],
        bump,
    )]
    pub position: Account<'info, Position>,

    #[account(
        mut,
        constraint = user_token_account.owner == user.key(),
        constraint = user_token_account.mint == pool.mint,
    )]
    pub user_token_account: Account<'info, TokenAccount>,

    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct Withdraw<'info> {
    #[account(mut)]
    pub user: Signer<'info>,

    #[account(
        mut,
        has_one = vault,
        has_one = fee_vault,
    )]
    pub pool: Account<'info, Pool>,

    #[account(mut)]
    pub vault: Account<'info, TokenAccount>,

    #[account(mut)]
    pub fee_vault: Account<'info, TokenAccount>,

    #[account(
        mut,
        seeds = [POSITION_SEED, pool.key().as_ref(), user.key().as_ref()],
        bump = position.bump,
        constraint = position.owner == user.key(),
    )]
    pub position: Account<'info, Position>,

    #[account(
        mut,
        constraint = user_token_account.owner == user.key(),
        constraint = user_token_account.mint == pool.mint,
    )]
    pub user_token_account: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct UpdateBankroll<'info> {
    #[account(
        constraint = authority.key() == pool.authority @ StakingError::Unauthorized,
    )]
    pub authority: Signer<'info>,

    #[account(mut)]
    pub pool: Account<'info, Pool>,
}

#[derive(Accounts)]
pub struct SetPaused<'info> {
    #[account(
        constraint = authority.key() == pool.authority @ StakingError::Unauthorized,
    )]
    pub authority: Signer<'info>,

    #[account(mut)]
    pub pool: Account<'info, Pool>,
}

#[derive(Accounts)]
pub struct CoverLoss<'info> {
    #[account(
        constraint = authority.key() == pool.authority @ StakingError::Unauthorized,
    )]
    pub authority: Signer<'info>,

    #[account(mut, has_one = vault)]
    pub pool: Account<'info, Pool>,

    #[account(mut)]
    pub vault: Account<'info, TokenAccount>,

    /// The agent's token account to receive the loss coverage
    #[account(mut)]
    pub destination: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct CollectFees<'info> {
    #[account(
        constraint = authority.key() == pool.authority @ StakingError::Unauthorized,
    )]
    pub authority: Signer<'info>,

    #[account(has_one = fee_vault)]
    pub pool: Account<'info, Pool>,

    #[account(mut)]
    pub fee_vault: Account<'info, TokenAccount>,

    #[account(
        mut,
        constraint = admin_token_account.owner == authority.key(),
        constraint = admin_token_account.mint == pool.mint,
    )]
    pub admin_token_account: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
}

// ─── State ──────────────────────────────────────────────────

#[account]
#[derive(InitSpace)]
pub struct Pool {
    pub agent_index: u8,
    pub authority: Pubkey,
    pub mint: Pubkey,
    pub vault: Pubkey,
    pub fee_vault: Pubkey,
    pub total_shares: u64,
    pub total_assets: u64,
    pub deposited_amount: u64,
    pub fee_basis_points: u16,
    pub paused: bool,
    pub bump: u8,
    pub vault_bump: u8,
    pub fee_vault_bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct Position {
    pub pool: Pubkey,
    pub owner: Pubkey,
    pub shares: u64,
    pub deposited_amount: u64,
    pub bump: u8,
}

// ─── Errors ─────────────────────────────────────────────────

#[error_code]
pub enum StakingError {
    #[msg("Invalid agent index (must be 0-7)")]
    InvalidAgentIndex,
    #[msg("Fee too high (max 1000 bps = 10%)")]
    FeeTooHigh,
    #[msg("Amount must be > 0")]
    ZeroAmount,
    #[msg("Pool is paused")]
    PoolPaused,
    #[msg("Insufficient shares")]
    InsufficientShares,
    #[msg("Calculated shares would be 0")]
    ZeroShares,
    #[msg("Unauthorized")]
    Unauthorized,
    #[msg("Insufficient assets in pool")]
    InsufficientAssets,
}
