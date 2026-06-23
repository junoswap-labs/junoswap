'use client'

import { useEffect, useRef, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useChainId, useSwitchChain } from 'wagmi'
import { useDebounce } from './useDebounce'
import { useSwapStore } from '@/store/swap-store'
import { useReferralStore } from '@/store/referral-store'
import {
    parseSwapSearchParams,
    buildSwapSearchParams,
    parseAndValidateSwapParams,
} from '@/lib/swap-params'
import { toast } from 'sonner'
import { getChainMetadata } from '@/lib/wagmi'
import type { Token } from '@/types/tokens'

const URL_UPDATE_DEBOUNCE_MS = 500

/** True when the store token's address matches the URL address (or the URL has no such param). */
function matchesUrlAddress(token: Token | null, address: string | undefined): boolean {
    if (!address) return true
    return !!token && token.address.toLowerCase() === address.toLowerCase()
}

export function useSwapUrlSync(tokens?: Token[], isTokensLoading = false) {
    const router = useRouter()
    const searchParams = useSearchParams()
    const chainId = useChainId()
    const { switchChain, isPending: isSwitchingChain } = useSwitchChain()
    const storedReferrer = useReferralStore((s) => s.referrer)
    const {
        tokenIn,
        tokenOut,
        amountIn,
        setTokenIn,
        setTokenOut,
        setAmountIn,
        setIsUpdatingFromUrl,
    } = useSwapStore()
    // Mirror the latest token list in a ref so applyUrlParams can resolve dynamic
    // (graduated / V3) tokens without forcing the main URL effect to depend on `tokens`
    // (which would re-run the chain-switch toast logic on every list update).
    const tokensRef = useRef(tokens)
    tokensRef.current = tokens
    const hasInitializedRef = useRef(false)
    const isUpdatingFromUrlRef = useRef(false)
    const pendingUrlParamsRef = useRef<ReturnType<typeof parseSwapSearchParams> | null>(null)
    const lastProcessedChainIdRef = useRef<number | null>(null)
    const isInitialLoadRef = useRef(true)
    const initialSearchParamsRef = useRef<string | null>(null)
    const applyUrlParams = useCallback(
        (urlParams: ReturnType<typeof parseSwapSearchParams>, targetChainId: number) => {
            const parsed = parseAndValidateSwapParams(targetChainId, urlParams, tokensRef.current)
            isUpdatingFromUrlRef.current = true
            setIsUpdatingFromUrl(true)
            if (parsed.tokenIn) {
                setTokenIn(parsed.tokenIn)
            }
            if (parsed.tokenOut) {
                setTokenOut(parsed.tokenOut)
            }
            if (parsed.amountIn) {
                setAmountIn(parsed.amountIn)
            }
            setTimeout(() => {
                isUpdatingFromUrlRef.current = false
                setIsUpdatingFromUrl(false)
            }, 0)
        },
        [setTokenIn, setTokenOut, setAmountIn, setIsUpdatingFromUrl]
    )
    useEffect(() => {
        if (isUpdatingFromUrlRef.current) return
        const urlParams = parseSwapSearchParams(searchParams)
        const parsed = parseAndValidateSwapParams(chainId, urlParams)
        if (initialSearchParamsRef.current === null) {
            initialSearchParamsRef.current = searchParams.toString()
        }
        if (parsed.targetChainId && parsed.targetChainId !== chainId) {
            if (isInitialLoadRef.current) {
                pendingUrlParamsRef.current = urlParams
                const targetChainMeta = getChainMetadata(parsed.targetChainId)
                const chainName = targetChainMeta?.name || `Chain ${parsed.targetChainId}`
                toast.info(`Switch to ${chainName}?`, {
                    description: 'The shared link requires a different network.',
                    action: {
                        label: 'Switch',
                        onClick: () => {
                            switchChain(
                                { chainId: parsed.targetChainId! },
                                {
                                    onSuccess: () => {
                                        toast.success(`Switched to ${chainName}`)
                                    },
                                    onError: (error) => {
                                        toast.error('Failed to switch network', {
                                            description: error.message,
                                        })
                                        pendingUrlParamsRef.current = null
                                        const newParams = buildSwapSearchParams({
                                            input: urlParams.input,
                                            output: urlParams.output,
                                            amount: urlParams.amount,
                                            ref: urlParams.ref,
                                        })
                                        const newUrl = `${window.location.pathname}${newParams.toString() ? `?${newParams.toString()}` : ''}`
                                        router.replace(newUrl, { scroll: false })
                                    },
                                }
                            )
                        },
                    },
                    duration: 10000,
                })
                isInitialLoadRef.current = false
                hasInitializedRef.current = true
                return
            }
            isInitialLoadRef.current = false
            hasInitializedRef.current = true
            lastProcessedChainIdRef.current = chainId
            return
        }
        applyUrlParams(urlParams, chainId)
        isInitialLoadRef.current = false
        hasInitializedRef.current = true
        lastProcessedChainIdRef.current = chainId
    }, [searchParams, chainId, switchChain, applyUrlParams, router])
    useEffect(() => {
        if (pendingUrlParamsRef.current && lastProcessedChainIdRef.current !== chainId) {
            const urlParams = pendingUrlParamsRef.current
            const parsed = parseAndValidateSwapParams(chainId, urlParams)
            if (!parsed.targetChainId || parsed.targetChainId === chainId) {
                applyUrlParams(urlParams, chainId)
                pendingUrlParamsRef.current = null
                lastProcessedChainIdRef.current = chainId
            }
        }
    }, [chainId, applyUrlParams])
    // Backfill launchpad / V3 tokens that aren't in the static list and only become
    // resolvable once the async token list loads. This runs separately from the main
    // URL→store effect and ONLY fills empty slots — it never overwrites a token the
    // user picked, so manual token changes are never reverted.
    useEffect(() => {
        if (!hasInitializedRef.current) return
        if (isUpdatingFromUrlRef.current) return
        if (pendingUrlParamsRef.current) return
        if (!tokens || tokens.length === 0) return
        const urlParams = parseSwapSearchParams(searchParams)
        const parsed = parseAndValidateSwapParams(chainId, urlParams, tokens)
        if (parsed.targetChainId && parsed.targetChainId !== chainId) return
        const state = useSwapStore.getState()
        const needIn = !!parsed.tokenIn && !state.tokenIn
        const needOut = !!parsed.tokenOut && !state.tokenOut
        if (!needIn && !needOut) return
        isUpdatingFromUrlRef.current = true
        setIsUpdatingFromUrl(true)
        if (needIn) setTokenIn(parsed.tokenIn!)
        if (needOut) setTokenOut(parsed.tokenOut!)
        setTimeout(() => {
            isUpdatingFromUrlRef.current = false
            setIsUpdatingFromUrl(false)
        }, 0)
    }, [tokens, searchParams, chainId, setTokenIn, setTokenOut, setIsUpdatingFromUrl])
    const debouncedTokenIn = useDebounce(tokenIn, URL_UPDATE_DEBOUNCE_MS)
    const debouncedTokenOut = useDebounce(tokenOut, URL_UPDATE_DEBOUNCE_MS)
    const debouncedAmountIn = useDebounce(amountIn, URL_UPDATE_DEBOUNCE_MS)
    useEffect(() => {
        if (!hasInitializedRef.current) return
        if (isUpdatingFromUrlRef.current) return
        if (isSwitchingChain) return
        if (pendingUrlParamsRef.current) return
        const newParams = buildSwapSearchParams({
            input: debouncedTokenIn?.address,
            output: debouncedTokenOut?.address,
            amount: debouncedAmountIn || undefined,
            chain: chainId.toString(),
            // Re-append the persisted referrer so the ?ref= link survives navigation
            ref: searchParams.get('ref') || storedReferrer || undefined,
        })
        const currentParams = new URLSearchParams(searchParams.toString())
        const newParamsStr = newParams.toString()
        const currentParamsStr = currentParams.toString()

        if (newParamsStr !== currentParamsStr) {
            isUpdatingFromUrlRef.current = true
            const newUrl = `${window.location.pathname}${newParamsStr ? `?${newParamsStr}` : ''}`
            router.replace(newUrl, { scroll: false })
            setTimeout(() => {
                isUpdatingFromUrlRef.current = false
            }, 100)
        }
    }, [
        debouncedTokenIn,
        debouncedTokenOut,
        debouncedAmountIn,
        chainId,
        router,
        searchParams,
        isSwitchingChain,
        storedReferrer,
    ])

    // Whether a URL-provided token is still waiting to be applied to the store.
    // While true, the swap card must not run its default-token initialization, or it
    // would clobber the (possibly async-resolving) URL token.
    const rawUrlParams = parseSwapSearchParams(searchParams)
    const hasUrlTokenParam = !!(rawUrlParams.input || rawUrlParams.output)
    const storeMatchesUrl =
        matchesUrlAddress(tokenIn, rawUrlParams.input) &&
        matchesUrlAddress(tokenOut, rawUrlParams.output)
    const urlTokensPending =
        hasUrlTokenParam && !storeMatchesUrl && (isTokensLoading || !hasInitializedRef.current)

    return { isUpdatingFromUrl: isUpdatingFromUrlRef.current, urlTokensPending }
}
