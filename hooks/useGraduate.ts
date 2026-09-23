'use client'

import { useState, useCallback, useRef } from 'react'
import { useWriteContract, usePublicClient, useAccount } from 'wagmi'
import type { Address } from 'viem'
import { maxUint256, maxUint128, parseEther } from 'viem'
import { getAbi, planCurveCall, computeCurve, getDexes } from '@coshi190/juno-moneta-sdk'
import { getCurveState } from '@/lib/curve-state'
import { getGraduationMode } from '@/lib/launchpad-curve'
import { useLaunchpadContract } from '@/hooks/useLaunchpadChainId'
import { INTERMEDIARY_TOKENS } from '@/lib/routing-config'
import { findEventArgs } from '@/services/launchpad/receipt'

function isSqrtPriceWithinTolerance(
    current: bigint,
    target: bigint,
    toleranceBps: bigint
): boolean {
    if (target <= 0n) return false
    const diff = current > target ? current - target : target - current
    return diff <= (target * toleranceBps) / 10000n
}

// graduate() mints full range with 99% (V1.1) / 95% (V1) minimums, which only admit ~0.5% / ~2.5%
// of sqrtPrice skew. Stay inside the tighter one.
const PRICE_TOLERANCE_BPS = 25n

type PoolStatus = 'no_pool' | 'not_initialized' | 'correct' | 'wrong'

type GraduationStep =
    | 'idle'
    | 'checking-pool'
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
    /** Which curve deployment this token lives on. Defaults to the chain's primary launchpad. */
    launchpadId?: string
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

export function useGraduate({
    tokenAddr,
    launchpadId,
    enabled: _enabled = true,
}: UseGraduateParams): UseGraduateResult {
    const {
        chainId,
        address: bondingCurveAddress,
        launchpadId: resolvedLaunchpadId,
    } = useLaunchpadContract(launchpadId)
    const publicClient = usePublicClient({ chainId })
    const { address } = useAccount()
    const v3Config = getDexes(chainId, 'v3')[0]
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
            args?: readonly unknown[]
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

            const curve = await getCurveState(publicClient, {
                chainId,
                token: tokenAddr,
                launchpadId: resolvedLaunchpadId,
            })
            if (!curve) throw new Error('Bonding curve state unavailable')
            const { nativeReserve, tokenReserve } = curve

            const { graduation } = computeCurve({
                nativeReserve,
                tokenReserve,
                virtualAmount: curve.virtualAmount,
                graduationAmount: curve.graduationAmount,
                graduationMode: getGraduationMode(resolvedLaunchpadId),
                token: tokenAddr,
                wrappedNative,
            })

            if (!graduation.isReady) {
                throw new Error('Not ready to graduate — bonding curve has not reached the cap')
            }

            const correctSqrtPrice = graduation.sqrtPriceX96
            if (correctSqrtPrice <= 0n) {
                throw new Error('Invalid reserves for sqrtPriceX96 calculation')
            }

            const tokenIsToken0 = tokenAddr.toLowerCase() < wrappedNative.toLowerCase()
            const token0: Address = tokenIsToken0 ? tokenAddr : wrappedNative
            const token1: Address = tokenIsToken0 ? wrappedNative : tokenAddr

            const poolAddress = (await publicClient.readContract({
                address: factory,
                abi: getAbi('v3Factory'),
                functionName: 'getPool',
                args: [token0, token1, 10000],
            })) as Address

            let poolStatus: PoolStatus = 'no_pool'
            let currentSqrtPrice = 0n

            const ZERO_ADDR = '0x0000000000000000000000000000000000000000'
            if (poolAddress && poolAddress !== ZERO_ADDR) {
                const slot0 = (await publicClient.readContract({
                    address: poolAddress,
                    abi: getAbi('v3Pool'),
                    functionName: 'slot0',
                })) as [bigint, number, number, number, number, number, boolean]

                currentSqrtPrice = slot0[0]

                if (currentSqrtPrice === 0n) {
                    poolStatus = 'not_initialized'
                } else {
                    poolStatus = isSqrtPriceWithinTolerance(
                        currentSqrtPrice,
                        correctSqrtPrice,
                        PRICE_TOLERANCE_BPS
                    )
                        ? 'correct'
                        : 'wrong'
                }
            }

            const rescue = poolStatus === 'wrong'
            setNeedsRescue(rescue)

            // A missing or uninitialized pool is left to graduate(), which creates and initializes
            // it atomically with the mint at the curve's closing price.
            if (rescue) {
                const priceTooHigh = currentSqrtPrice > correctSqrtPrice
                // Lowering sqrtPrice sells token0 into the pool; raising it sells token1
                const swapTokenIn = priceTooHigh ? token0 : token1
                const swapTokenOut = priceTooHigh ? token1 : token0

                const tokenBalBefore = (await publicClient.readContract({
                    address: tokenAddr,
                    abi: getAbi('erc20'),
                    functionName: 'balanceOf',
                    args: [address],
                })) as bigint

                if (tokenBalBefore === 0n) {
                    // V1.1 closes buys once the curve is complete, so the rescue can't source tokens
                    if (getGraduationMode(resolvedLaunchpadId) === 'flat') {
                        throw new Error(
                            'The pool price must be corrected before graduating, which needs some of this token in your wallet'
                        )
                    }
                    setStep('buying-tokens')
                    await sendTx(
                        planCurveCall(
                            chainId,
                            {
                                kind: 'buy',
                                token: tokenAddr,
                                minOut: 0n,
                                value: parseEther('0.006'),
                            },
                            resolvedLaunchpadId
                        )
                    )
                }

                const kubToWrap = (nativeReserve * 85n) / 1000n
                const wkubBalBefore = (await publicClient.readContract({
                    address: wrappedNative,
                    abi: getAbi('erc20'),
                    functionName: 'balanceOf',
                    args: [address],
                })) as bigint

                if (wkubBalBefore < kubToWrap) {
                    setStep('wrapping-kub')
                    await sendTx({
                        address: wrappedNative,
                        abi: getAbi('weth9'),
                        functionName: 'deposit',
                        value: kubToWrap - wkubBalBefore,
                    })
                }

                const readAllowance = async (token: Address, spender: Address) =>
                    (await publicClient.readContract({
                        address: token,
                        abi: getAbi('erc20'),
                        functionName: 'allowance',
                        args: [address, spender],
                    })) as bigint

                const tokenBal = (await publicClient.readContract({
                    address: tokenAddr,
                    abi: getAbi('erc20'),
                    functionName: 'balanceOf',
                    args: [address],
                })) as bigint
                const wkubBal = (await publicClient.readContract({
                    address: wrappedNative,
                    abi: getAbi('erc20'),
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
                        needsApprove(
                            swapTokenIn,
                            swapRouter,
                            swapTokenIn === tokenAddr ? tokenBal : wkubBal
                        ),
                    ])
                ).some(Boolean)

                if (hasApproval) {
                    setStep('approving')
                    if (await needsApprove(tokenAddr, positionManager, tokenForLiq)) {
                        await sendTx({
                            address: tokenAddr,
                            abi: getAbi('erc20'),
                            functionName: 'approve',
                            args: [positionManager, maxUint256],
                        })
                    }
                    if (await needsApprove(wrappedNative, positionManager, wkubForLiq)) {
                        await sendTx({
                            address: wrappedNative,
                            abi: getAbi('erc20'),
                            functionName: 'approve',
                            args: [positionManager, maxUint256],
                        })
                    }
                    if (
                        await needsApprove(
                            swapTokenIn,
                            swapRouter,
                            swapTokenIn === tokenAddr ? tokenBal : wkubBal
                        )
                    ) {
                        await sendTx({
                            address: swapTokenIn,
                            abi: getAbi('erc20'),
                            functionName: 'approve',
                            args: [swapRouter, maxUint256],
                        })
                    }
                }

                const findRescuePosition = async (): Promise<bigint | null> => {
                    const count = (await publicClient.readContract({
                        address: positionManager,
                        abi: getAbi('positionManager'),
                        functionName: 'balanceOf',
                        args: [address],
                    })) as bigint
                    for (let i = 0n; i < count; i++) {
                        const tid = (await publicClient.readContract({
                            address: positionManager,
                            abi: getAbi('positionManager'),
                            functionName: 'tokenOfOwnerByIndex',
                            args: [address, i],
                        })) as bigint
                        const pos = (await publicClient.readContract({
                            address: positionManager,
                            abi: getAbi('positionManager'),
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
                        abi: getAbi('positionManager'),
                        functionName: 'mint',
                        args: [
                            {
                                token0,
                                token1,
                                fee: 10000,
                                tickLower: -887200,
                                tickUpper: 887200,
                                amount0Desired: tokenIsToken0 ? tokenForLiq : wkubForLiq,
                                amount1Desired: tokenIsToken0 ? wkubForLiq : tokenForLiq,
                                amount0Min: 0n,
                                amount1Min: 0n,
                                recipient: address,
                                deadline: BigInt(Math.floor(Date.now() / 1000) + 3600),
                            },
                        ],
                    })

                    const mintReceipt = await publicClient.getTransactionReceipt({
                        hash: mintHash,
                    })
                    const mintArgs = findEventArgs<{ tokenId: bigint }>(mintReceipt.logs, {
                        abi: getAbi('positionManager'),
                        eventName: 'IncreaseLiquidity',
                        address: positionManager,
                    })
                    tokenId = mintArgs?.tokenId ?? null
                    if (!tokenId) throw new Error('Failed to get position tokenId from mint')
                }

                const latestSlot0 = (await publicClient.readContract({
                    address: poolAddress,
                    abi: getAbi('v3Pool'),
                    functionName: 'slot0',
                })) as [bigint, number, number, number, number, number, boolean]
                const latestSqrtPrice = latestSlot0[0]
                const priceAlreadyCorrect = isSqrtPriceWithinTolerance(
                    latestSqrtPrice,
                    correctSqrtPrice,
                    PRICE_TOLERANCE_BPS
                )

                if (!priceAlreadyCorrect) {
                    setStep('correcting-price')

                    const swapAmount = (await publicClient.readContract({
                        address: swapTokenIn,
                        abi: getAbi('erc20'),
                        functionName: 'balanceOf',
                        args: [address],
                    })) as bigint
                    if (swapAmount > 0n) {
                        await sendTx({
                            address: swapRouter,
                            abi: getAbi('v3SwapRouter'),
                            functionName: 'exactInputSingle',
                            args: [
                                {
                                    tokenIn: swapTokenIn,
                                    tokenOut: swapTokenOut,
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

                const position = (await publicClient.readContract({
                    address: positionManager,
                    abi: getAbi('positionManager'),
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
                        abi: getAbi('positionManager'),
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

                await sendTx({
                    address: positionManager,
                    abi: getAbi('positionManager'),
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
            await sendTx(
                planCurveCall(chainId, { kind: 'graduate', token: tokenAddr }, resolvedLaunchpadId)
            )

            if (rescue) {
                setStep('unwrapping')
                const remainingWkub = (await publicClient.readContract({
                    address: wrappedNative,
                    abi: getAbi('erc20'),
                    functionName: 'balanceOf',
                    args: [address],
                })) as bigint

                if (remainingWkub > 0n) {
                    await sendTx({
                        address: wrappedNative,
                        abi: getAbi('weth9'),
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
    }, [
        tokenAddr,
        chainId,
        publicClient,
        v3Config,
        wrappedNative,
        address,
        bondingCurveAddress,
        resolvedLaunchpadId,
        sendTx,
    ])

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
