'use client'

import { useState, useCallback, useRef } from 'react'
import { useWriteContract, usePublicClient, useAccount } from 'wagmi'
import type { Address } from 'viem'
import { maxUint256, maxUint128, decodeEventLog, parseEther } from 'viem'
import { BONDING_CURVE_JUNOSWAP_ABI } from '@/lib/abis/bonding-curve-junoswap'
import { useLaunchpadContract } from '@/hooks/useLaunchpadChainId'
import { NONFUNGIBLE_POSITION_MANAGER_ABI } from '@/lib/abis/nonfungible-position-manager'
import { UNISWAP_V3_FACTORY_ABI } from '@/lib/abis/uniswap-v3-factory'
import { UNISWAP_V3_POOL_ABI } from '@/lib/abis/uniswap-v3-pool'
import { UNISWAP_V3_SWAP_ROUTER_ABI } from '@/lib/abis/uniswap-v3-swap-router'
import { WETH9_ABI } from '@/lib/abis/weth9'
import { ERC20_ABI } from '@/lib/abis/erc20'
import { calculateGraduationSqrtPriceX96 } from '@/lib/liquidity-helpers'
import { getV3Config } from '@/lib/dex-config'
import { INTERMEDIARY_TOKENS } from '@/lib/routing-config'

type PoolStatus = 'no_pool' | 'not_initialized' | 'correct' | 'wrong'

type GraduationStep =
    | 'idle'
    | 'checking-pool'
    | 'initializing-pool'
    | 'buying-tokens'
    | 'wrapping-kub'
    | 'approving'
    | 'adding-liquidity'
    | 'correcting-price'
    | 'removing-liquidity'
    | 'graduating'
    | 'unwrapping'
    | 'done'
    | 'error'

interface UseGraduateParams {
    tokenAddr: Address | null
    enabled?: boolean
}

interface UseGraduateResult {
    graduate: () => void
    step: GraduationStep
    stepLabel: string
    needsRescue: boolean | null
    isPreparing: boolean
    isExecuting: boolean
    isConfirming: boolean
    isSuccess: boolean
    isError: boolean
    error: Error | null
    hash: Address | undefined
}

const STEP_LABELS: Record<GraduationStep, string> = {
    idle: '',
    'checking-pool': 'Checking pool state...',
    'initializing-pool': 'Initializing pool...',
    'buying-tokens': 'Buying tokens from curve...',
    'wrapping-kub': 'Wrapping KUB...',
    approving: 'Approving tokens...',
    'adding-liquidity': 'Adding liquidity...',
    'correcting-price': 'Correcting pool price...',
    'removing-liquidity': 'Removing rescue liquidity...',
    graduating: 'Graduating token...',
    unwrapping: 'Unwrapping KUB...',
    done: 'Graduation complete!',
    error: 'Error',
}

// Contract hardcodes 5% slippage. We allow 4% price deviation.
const PRICE_TOLERANCE_BPS = 400n

// Mirrors INITIALTOKEN in BondingCurveJunoswap.sol (1B tokens, 18 decimals)
const INITIAL_TOKEN = 1_000_000_000n * 10n ** 18n

export function useGraduate({
    tokenAddr,
    enabled: _enabled = true,
}: UseGraduateParams): UseGraduateResult {
    const { chainId, address: bondingCurveAddress } = useLaunchpadContract()
    const publicClient = usePublicClient({ chainId })
    const { address } = useAccount()
    const v3Config = getV3Config(chainId)
    const wrappedNative = INTERMEDIARY_TOKENS[chainId]?.wrappedNative as Address | undefined

    const { writeContractAsync } = useWriteContract()

    const [step, setStep] = useState<GraduationStep>('idle')
    const [error, setError] = useState<Error | null>(null)
    const [lastHash, setLastHash] = useState<Address | undefined>()
    const [needsRescue, setNeedsRescue] = useState<boolean | null>(null)
    const [isSuccess, setIsSuccess] = useState(false)
    const isRunning = useRef(false)

    const sendTx = useCallback(
        async (params: {
            address: Address
            abi: readonly unknown[]
            functionName: string
            args?: unknown[]
            value?: bigint
        }) => {
            if (!publicClient || !address) throw new Error('Wallet not connected')

            const { request } = await publicClient.simulateContract({
                ...params,
                account: address,
            } as Parameters<typeof publicClient.simulateContract>[0])

            const hash = await writeContractAsync(
                request as Parameters<typeof writeContractAsync>[0]
            )
            setLastHash(hash)

            const receipt = await publicClient.waitForTransactionReceipt({ hash })
            if (receipt.status === 'reverted') {
                throw new Error(`Transaction reverted: ${hash}`)
            }
            return hash
        },
        [publicClient, address, writeContractAsync]
    )

    const graduate = useCallback(async () => {
        if (
            !tokenAddr ||
            !publicClient ||
            !v3Config ||
            !wrappedNative ||
            !address ||
            !bondingCurveAddress ||
            isRunning.current
        )
            return

        isRunning.current = true
        setError(null)
        setStep('checking-pool')

        try {
            const factory = v3Config.factory!
            const positionManager = v3Config.positionManager!
            const swapRouter = v3Config.swapRouter!

            const [freshReserves, onChainCap] = await Promise.all([
                publicClient.readContract({
                    address: bondingCurveAddress,
                    abi: BONDING_CURVE_JUNOSWAP_ABI,
                    functionName: 'pumpReserve',
                    args: [tokenAddr],
                }),
                publicClient.readContract({
                    address: bondingCurveAddress,
                    abi: BONDING_CURVE_JUNOSWAP_ABI,
                    functionName: 'graduationAmount',
                }),
            ])
            const nativeReserve = (freshReserves as [bigint, bigint])[0]
            const tokenReserve = (freshReserves as [bigint, bigint])[1]
            const cap = onChainCap as bigint

            // Same ratio check as the contract: token * cap <= INITIALTOKEN * native
            if (tokenReserve * cap > INITIAL_TOKEN * nativeReserve) {
                throw new Error('Not ready to graduate — bonding curve has not reached the cap')
            }

            const correctSqrtPrice = calculateGraduationSqrtPriceX96(
                tokenAddr,
                wrappedNative,
                nativeReserve,
                tokenReserve
            )

            // Sort tokens (same as contract)
            const tokenIsToken0 = tokenAddr.toLowerCase() < wrappedNative.toLowerCase()
            const token0: Address = tokenIsToken0 ? tokenAddr : wrappedNative
            const token1: Address = tokenIsToken0 ? wrappedNative : tokenAddr

            const poolAddress = (await publicClient.readContract({
                address: factory,
                abi: UNISWAP_V3_FACTORY_ABI,
                functionName: 'getPool',
                args: [token0, token1, 10000],
            })) as Address

            let poolStatus: PoolStatus = 'no_pool'
            let currentSqrtPrice = 0n

            const ZERO_ADDR = '0x0000000000000000000000000000000000000000'
            if (poolAddress && poolAddress !== ZERO_ADDR) {
                const slot0 = (await publicClient.readContract({
                    address: poolAddress,
                    abi: UNISWAP_V3_POOL_ABI,
                    functionName: 'slot0',
                })) as [bigint, number, number, number, number, number, boolean]

                currentSqrtPrice = slot0[0]

                if (currentSqrtPrice === 0n) {
                    poolStatus = 'not_initialized'
                } else {
                    const diff =
                        currentSqrtPrice > correctSqrtPrice
                            ? currentSqrtPrice - correctSqrtPrice
                            : correctSqrtPrice - currentSqrtPrice
                    const tolerance = (correctSqrtPrice * PRICE_TOLERANCE_BPS) / 10000n
                    poolStatus = diff <= tolerance ? 'correct' : 'wrong'
                }
            }

            const rescue = poolStatus === 'wrong'
            setNeedsRescue(rescue)

            // 3a. No pool or not initialized → create & init
            if (poolStatus === 'no_pool' || poolStatus === 'not_initialized') {
                setStep('initializing-pool')
                await sendTx({
                    address: positionManager,
                    abi: NONFUNGIBLE_POSITION_MANAGER_ABI,
                    functionName: 'createAndInitializePoolIfNecessary',
                    args: [token0, token1, 10000, correctSqrtPrice],
                })
            }

            // 3b. Wrong price → rescue
            if (rescue) {
                // Determine swap direction early (needed for approvals)
                const priceTooHigh = currentSqrtPrice > correctSqrtPrice

                // 3b.1 Buy tokens (skip if already have some)
                const tokenBalBefore = (await publicClient.readContract({
                    address: tokenAddr,
                    abi: ERC20_ABI,
                    functionName: 'balanceOf',
                    args: [address],
                })) as bigint

                if (tokenBalBefore === 0n) {
                    setStep('buying-tokens')
                    await sendTx({
                        address: bondingCurveAddress,
                        abi: BONDING_CURVE_JUNOSWAP_ABI,
                        functionName: 'buy',
                        args: [tokenAddr, 0n],
                        value: parseEther('0.006'),
                    })
                }

                // 3b.2 Wrap KUB (skip or wrap deficit)
                const kubToWrap = (nativeReserve * 85n) / 1000n
                const wkubBalBefore = (await publicClient.readContract({
                    address: wrappedNative,
                    abi: ERC20_ABI,
                    functionName: 'balanceOf',
                    args: [address],
                })) as bigint

                if (wkubBalBefore < kubToWrap) {
                    setStep('wrapping-kub')
                    await sendTx({
                        address: wrappedNative,
                        abi: WETH9_ABI,
                        functionName: 'deposit',
                        value: kubToWrap - wkubBalBefore,
                    })
                }

                // 3b.3 Approve tokens (skip each if allowance sufficient)
                const readAllowance = async (token: Address, spender: Address) =>
                    (await publicClient.readContract({
                        address: token,
                        abi: ERC20_ABI,
                        functionName: 'allowance',
                        args: [address, spender],
                    })) as bigint

                const tokenBal = (await publicClient.readContract({
                    address: tokenAddr,
                    abi: ERC20_ABI,
                    functionName: 'balanceOf',
                    args: [address],
                })) as bigint
                const wkubBal = (await publicClient.readContract({
                    address: wrappedNative,
                    abi: ERC20_ABI,
                    functionName: 'balanceOf',
                    args: [address],
                })) as bigint
                const tokenForLiq = (tokenBal * 20n) / 100n
                const wkubForLiq = (wkubBal * 20n) / 100n

                const needsApprove = async (token: Address, spender: Address, amount: bigint) => {
                    if (amount === 0n) return false
                    const allowance = await readAllowance(token, spender)
                    return allowance < amount
                }

                const hasApproval = (
                    await Promise.all([
                        needsApprove(tokenAddr, positionManager, tokenForLiq),
                        needsApprove(wrappedNative, positionManager, wkubForLiq),
                        priceTooHigh
                            ? needsApprove(tokenAddr, swapRouter, tokenBal)
                            : needsApprove(wrappedNative, swapRouter, wkubBal),
                    ])
                ).some(Boolean)

                if (hasApproval) {
                    setStep('approving')
                    if (await needsApprove(tokenAddr, positionManager, tokenForLiq)) {
                        await sendTx({
                            address: tokenAddr,
                            abi: ERC20_ABI,
                            functionName: 'approve',
                            args: [positionManager, maxUint256],
                        })
                    }
                    if (await needsApprove(wrappedNative, positionManager, wkubForLiq)) {
                        await sendTx({
                            address: wrappedNative,
                            abi: ERC20_ABI,
                            functionName: 'approve',
                            args: [positionManager, maxUint256],
                        })
                    }
                    if (priceTooHigh) {
                        if (await needsApprove(tokenAddr, swapRouter, tokenBal)) {
                            await sendTx({
                                address: tokenAddr,
                                abi: ERC20_ABI,
                                functionName: 'approve',
                                args: [swapRouter, maxUint256],
                            })
                        }
                    } else {
                        if (await needsApprove(wrappedNative, swapRouter, wkubBal)) {
                            await sendTx({
                                address: wrappedNative,
                                abi: ERC20_ABI,
                                functionName: 'approve',
                                args: [swapRouter, maxUint256],
                            })
                        }
                    }
                }

                // 3b.4 Add liquidity (skip if existing rescue position found)
                const findRescuePosition = async (): Promise<bigint | null> => {
                    const count = (await publicClient.readContract({
                        address: positionManager,
                        abi: NONFUNGIBLE_POSITION_MANAGER_ABI,
                        functionName: 'balanceOf',
                        args: [address],
                    })) as bigint
                    for (let i = 0n; i < count; i++) {
                        const tid = (await publicClient.readContract({
                            address: positionManager,
                            abi: NONFUNGIBLE_POSITION_MANAGER_ABI,
                            functionName: 'tokenOfOwnerByIndex',
                            args: [address, i],
                        })) as bigint
                        const pos = (await publicClient.readContract({
                            address: positionManager,
                            abi: NONFUNGIBLE_POSITION_MANAGER_ABI,
                            functionName: 'positions',
                            args: [tid],
                        })) as unknown as [
                            number,
                            Address,
                            Address,
                            Address,
                            number,
                            number,
                            number,
                            bigint,
                            bigint,
                            bigint,
                            bigint,
                            bigint,
                        ]
                        if (
                            pos[2].toLowerCase() === token0.toLowerCase() &&
                            pos[3].toLowerCase() === token1.toLowerCase() &&
                            pos[4] === 10000 &&
                            pos[7] > 0n
                        ) {
                            return tid
                        }
                    }
                    return null
                }

                let tokenId = await findRescuePosition()

                if (!tokenId) {
                    setStep('adding-liquidity')
                    const mintHash = await sendTx({
                        address: positionManager,
                        abi: NONFUNGIBLE_POSITION_MANAGER_ABI,
                        functionName: 'mint',
                        args: [
                            {
                                token0,
                                token1,
                                fee: 10000,
                                tickLower: -887200,
                                tickUpper: 887200,
                                amount0Desired: tokenForLiq,
                                amount1Desired: wkubForLiq,
                                amount0Min: 0n,
                                amount1Min: 0n,
                                recipient: address,
                                deadline: BigInt(Math.floor(Date.now() / 1000) + 3600),
                            },
                        ],
                    })

                    // Get tokenId from IncreaseLiquidity event
                    const mintReceipt = await publicClient.getTransactionReceipt({
                        hash: mintHash,
                    })
                    tokenId = null
                    for (const log of mintReceipt.logs) {
                        if (log.address.toLowerCase() === positionManager.toLowerCase()) {
                            try {
                                const decoded = decodeEventLog({
                                    abi: NONFUNGIBLE_POSITION_MANAGER_ABI,
                                    data: log.data,
                                    topics: log.topics,
                                })
                                if (decoded.eventName === 'IncreaseLiquidity') {
                                    tokenId = (decoded.args as { tokenId: bigint }).tokenId
                                    break
                                }
                            } catch {
                                // skip non-matching logs
                            }
                        }
                    }
                    if (!tokenId) throw new Error('Failed to get position tokenId from mint')
                }

                // 3b.5 Swap to correct price (skip if already correct)
                const latestSlot0 = (await publicClient.readContract({
                    address: poolAddress,
                    abi: UNISWAP_V3_POOL_ABI,
                    functionName: 'slot0',
                })) as [bigint, number, number, number, number, number, boolean]
                const latestSqrtPrice = latestSlot0[0]
                const latestDiff =
                    latestSqrtPrice > correctSqrtPrice
                        ? latestSqrtPrice - correctSqrtPrice
                        : correctSqrtPrice - latestSqrtPrice
                const latestTolerance = (correctSqrtPrice * PRICE_TOLERANCE_BPS) / 10000n
                const priceAlreadyCorrect = latestDiff <= latestTolerance

                if (!priceAlreadyCorrect) {
                    setStep('correcting-price')

                    if (priceTooHigh) {
                        const swapAmount = (await publicClient.readContract({
                            address: tokenAddr,
                            abi: ERC20_ABI,
                            functionName: 'balanceOf',
                            args: [address],
                        })) as bigint
                        if (swapAmount > 0n) {
                            await sendTx({
                                address: swapRouter,
                                abi: UNISWAP_V3_SWAP_ROUTER_ABI,
                                functionName: 'exactInputSingle',
                                args: [
                                    {
                                        tokenIn: token0,
                                        tokenOut: token1,
                                        fee: 10000,
                                        recipient: address,
                                        amountIn: swapAmount,
                                        amountOutMinimum: 0n,
                                        sqrtPriceLimitX96: correctSqrtPrice,
                                    },
                                ],
                            })
                        }
                    } else {
                        const swapAmount = (await publicClient.readContract({
                            address: wrappedNative,
                            abi: ERC20_ABI,
                            functionName: 'balanceOf',
                            args: [address],
                        })) as bigint
                        if (swapAmount > 0n) {
                            await sendTx({
                                address: swapRouter,
                                abi: UNISWAP_V3_SWAP_ROUTER_ABI,
                                functionName: 'exactInputSingle',
                                args: [
                                    {
                                        tokenIn: token1,
                                        tokenOut: token0,
                                        fee: 10000,
                                        recipient: address,
                                        amountIn: swapAmount,
                                        amountOutMinimum: 0n,
                                        sqrtPriceLimitX96: correctSqrtPrice,
                                    },
                                ],
                            })
                        }
                    }
                }

                // 3b.6 Remove liquidity (skip if already removed)
                const position = (await publicClient.readContract({
                    address: positionManager,
                    abi: NONFUNGIBLE_POSITION_MANAGER_ABI,
                    functionName: 'positions',
                    args: [tokenId],
                })) as unknown as [
                    number,
                    Address,
                    Address,
                    Address,
                    number,
                    number,
                    number,
                    bigint,
                    bigint,
                    bigint,
                    bigint,
                    bigint,
                ]
                const posLiquidity = position[7]

                if (posLiquidity > 0n) {
                    setStep('removing-liquidity')
                    await sendTx({
                        address: positionManager,
                        abi: NONFUNGIBLE_POSITION_MANAGER_ABI,
                        functionName: 'decreaseLiquidity',
                        args: [
                            {
                                tokenId,
                                liquidity: posLiquidity,
                                amount0Min: 0n,
                                amount1Min: 0n,
                                deadline: BigInt(Math.floor(Date.now() / 1000) + 3600),
                            },
                        ],
                    })
                }

                // Collect all tokens from position
                await sendTx({
                    address: positionManager,
                    abi: NONFUNGIBLE_POSITION_MANAGER_ABI,
                    functionName: 'collect',
                    args: [
                        {
                            tokenId,
                            recipient: address,
                            amount0Max: maxUint128,
                            amount1Max: maxUint128,
                        },
                    ],
                })
            }

            setStep('graduating')
            await sendTx({
                address: bondingCurveAddress,
                abi: BONDING_CURVE_JUNOSWAP_ABI,
                functionName: 'graduate',
                args: [tokenAddr],
            })

            if (rescue) {
                setStep('unwrapping')
                const remainingWkub = (await publicClient.readContract({
                    address: wrappedNative,
                    abi: ERC20_ABI,
                    functionName: 'balanceOf',
                    args: [address],
                })) as bigint

                if (remainingWkub > 0n) {
                    await sendTx({
                        address: wrappedNative,
                        abi: WETH9_ABI,
                        functionName: 'withdraw',
                        args: [remainingWkub],
                    })
                }
            }

            setStep('done')
            setIsSuccess(true)
        } catch (err) {
            setStep('error')
            setError(err instanceof Error ? err : new Error(String(err)))
        } finally {
            isRunning.current = false
        }
    }, [tokenAddr, publicClient, v3Config, wrappedNative, address, bondingCurveAddress, sendTx])

    const isPreparing = step === 'checking-pool'
    const isExecuting = !isPreparing && step !== 'idle' && step !== 'done' && step !== 'error'
    const isError = step === 'error'

    return {
        graduate,
        step,
        stepLabel: STEP_LABELS[step],
        needsRescue,
        isPreparing,
        isExecuting,
        isConfirming: false,
        isSuccess,
        isError,
        error,
        hash: lastHash,
    }
}
