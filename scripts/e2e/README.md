# On-chain e2e scripts

Two scripts that drive the earn contracts on **KUB testnet (25925)** with a real key and real
transactions, and print a PASS/FAIL line per feature.

| Script | Contracts | Run time |
| --- | --- | --- |
| `bun run e2e:token-staking` | `StakingRewardsFactory` + `StakingRewards` + `StakingRewardsLens` | ~7 min |
| `bun run e2e:juno-v3` | `JunoswapV3Staker` | ~6 min |

They are slow because the features under test are time-based: locks, epochs and incentive windows
all have to actually elapse on chain. Every transaction prints a Kubscan link as it goes.

## 1. Setup

Put this in `.env.local` (bun loads it automatically) or export it in your shell.

### Shared

```bash
PRIVATE_KEY=0x...                 # the account that pays gas and owns the tokens
RPC_URL=https://rpc-testnet.bitkubchain.io   # optional, this is the default
```

The account needs testnet KUB for gas — around 0.05 tKUB covers a full run of either script.

### Token staking (`e2e:token-staking`)

```bash
STAKING_FACTORY=0xaEfbD7E9a6984Eb061a2c952ED0EAa71CE65117c
STAKING_LENS=0xb740cD3df209905CdB28B18c1f6CbF2c96772012
STAKE_TOKEN=0x...                 # any ERC-20 you hold — this is what gets staked
REWARD_TOKEN=0x...                # optional, defaults to STAKE_TOKEN
```

Balance needed: `STAKE_AMOUNT_A + STAKE_AMOUNT_B` of the stake token (3 by default) and
`REWARD_AMOUNT × 2` of the reward token (20 by default). The script deploys its own throwaway pool,
so it never touches pools that already exist.

Optional knobs — shorten these to make the run faster, lengthen them if the RPC is lagging:

```bash
EPOCH_SECONDS=240      # first epoch length
EPOCH2_SECONDS=60      # second epoch length
LOCK_SECONDS=45        # per-lot lock in the first epoch
STAKE_AMOUNT_A=1
STAKE_AMOUNT_B=2
REWARD_AMOUNT=10
```

### Juno v3 staker (`e2e:juno-v3`)

```bash
JUNO_STAKER=0x17Bf4274D5a4AF99c7dfE641894F2bB340C10EF2
REWARD_TOKEN=0x...                # ERC-20 used as the incentive reward
POSITION_ID=123                   # optional, otherwise the first usable position is picked
SECOND_ADDRESS=0x...              # optional, only to exercise transferDeposit
```

**Requirement: the account must own a Uniswap-v3 position NFT that has liquidity and is currently
in range.** The staker refuses out-of-range positions by design, so the script scans your first 25
positions and stops on the first one that qualifies; if none do, it tells you and exits. Mint a
small position on any v3 pool first if you have none.

Balance needed: `REWARD_AMOUNT × 2` of the reward token (the script also tests topping the
incentive up before it starts). Optional knobs:

```bash
LEAD_SECONDS=45        # how far ahead the incentive starts
INCENTIVE_SECONDS=180  # how long it runs
REWARD_AMOUNT=10
```

> `SECOND_ADDRESS` moves the deposit to that address permanently. Leave it unset unless you want
> that — the script then skips both `transferDeposit` and the NFT withdrawal, and says so.

## 2. Run

```bash
bun run e2e:token-staking
bun run e2e:juno-v3
```

Exit code is 0 only when every step passed. The last block is a PASS/FAIL summary.

## 3. What each script covers

### Token staking

1. Reads the factory's service fee and pays it when one is configured
2. Deploys a pool with a lock and a staking-power cap
3. `poolInfo` records the creator and epoch 1
4. `statesByFactory` returns the pool with the parameters it was deployed with
5. Stake → `balanceOf`
6. A second stake becomes its own lot with its own unlock time
7. Staking past `maxStakingPower` reverts, and `remainingStakingPower` hits 0
8. `earned` grows while staked
9. `withdraw` before the unlock reverts, `withdrawableOf` is 0
10. `getReward` pays out even while the stake is locked
11. The lock expires on schedule and the whole balance becomes withdrawable
12. `withdrawFrom(index, amount)` withdraws one specific lot
13. The factory's `claimAll([pool])` batch claim pays out
14. `exit()` withdraws the remainder and claims in one call
15. `startEpoch` reverts while an epoch is still running
16. `startEpoch` after `periodFinish` opens epoch 2 with new parameters
17. Staking works in epoch 2 and is unlocked immediately when the lock is 0
18. `close()` retires the pool
19. A closed pool refuses both new stakes and new epochs
20. `recoverUnallocatedRewards()` returns the budget that ran with nothing staked

Not covered: `stakeWithPermit` (needs an EIP-2612 token and an offline signature) and
`setServiceFee` / ownership transfer (owner-only, and changing them affects every pool).

### Juno v3 staker

1. Reads `factory`, `nonfungiblePositionManager`, `maxIncentiveDuration`, `maxIncentiveStartLeadTime`
2. Picks an in-range position with liquidity, and resolves its pool
3. `createIncentive` rejects a past start time, an over-long duration, and a zero reward
4. `createIncentive` pulls the reward and records `totalReward` / `totalRewardUnclaimed`
5. Calling it again on the same key before the start tops the budget up
6. Depositing the NFT records owner and tick range in `deposits`
7. `stakeToken` before `startTime` reverts
8. `stakeToken` after the start records liquidity and bumps `numberOfStakes`
9. Staking the same token twice reverts
10. `withdrawToken` while staked reverts
11. `getRewardInfo` shows both the reward and in-range seconds growing
12. `endIncentive` reverts while a position is staked
13. `unstakeToken` banks the reward into `rewards[token][owner]`
14. `claimReward` with an amount pays exactly that; with 0 pays the rest
15. Re-stake, then `finalizeStake` after `endTime` records `secondsInsideFinal`
16. `finalizeStake` twice reverts
17. `stakeToken` into an ended incentive reverts
18. `unstakeToken` and claim work after the end
19. `transferDeposit` moves the deposit (only when `SECOND_ADDRESS` is set)
20. `withdrawToken` returns the NFT to its owner
21. `endIncentive` refunds whatever nobody earned

Not covered: the third-party eviction path in `unstakeToken` (needs a second funded account and a
position deliberately left out of range for `MIN_EVICTION_STAKE_AGE`), and `multicall`, which only
batches the calls already tested above.

## Notes

- KUB has no EIP-1559, so every transaction is forced to `type: 'legacy'`. Do not remove that.
- Each write is simulated before it is sent, so a revert shows its reason before gas is spent.
- The scripts never delete anything they did not create. The token-staking pool it deploys is left
  on chain, closed, with its address printed at the end.
