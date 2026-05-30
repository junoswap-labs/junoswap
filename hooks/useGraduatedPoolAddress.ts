'use client'

import { useQuery } from '@tanstack/react-query'
import type { Address } from 'viem'
import { ponderRequest } from '@/lib/ponder-client'

const V3_POOL_QUERY = `
  query V3Pool($tokenAddr: String!, $wrappedNative: String!) {
    v3Pools(
      where: {
        token0: $tokenAddr,
        token1: $wrappedNative,
        fee: 10000
      },
      limit: 1
    ) {
      items {
        address
      }
    }
  }
`

interface V3PoolResponse {
    v3Pools: {
        items: Array<{
            address: string
        }>
    }
}

/**
 * Fetches the V3 pool address for a graduated launch token from Ponder.
 * Returns undefined if no pool found or if the token is not graduated.
 */
export function useGraduatedPoolAddress(
    tokenAddr: Address | undefined,
    wrappedNative: Address | undefined
) {
    return useQuery({
        queryKey: [
            'graduated-pool-address',
            tokenAddr?.toLowerCase(),
            wrappedNative?.toLowerCase(),
        ],
        queryFn: async () => {
            if (!tokenAddr || !wrappedNative) return undefined

            // Try token0=token, token1=wrappedNative
            let result = await ponderRequest<V3PoolResponse>(V3_POOL_QUERY, {
                tokenAddr: tokenAddr.toLowerCase(),
                wrappedNative: wrappedNative.toLowerCase(),
            })

            const first = result.v3Pools.items[0]
            if (first) {
                return first.address as Address
            }

            // Try reversed: token0=wrappedNative, token1=token
            const REVERSED_POOL_QUERY = `
              query V3PoolReversed($wrappedNative: String!, $tokenAddr: String!) {
                v3Pools(
                  where: {
                    token0: $wrappedNative,
                    token1: $tokenAddr,
                    fee: 10000
                  },
                  limit: 1
                ) {
                  items {
                    address
                  }
                }
              }
            `
            result = await ponderRequest<V3PoolResponse>(REVERSED_POOL_QUERY, {
                wrappedNative: wrappedNative.toLowerCase(),
                tokenAddr: tokenAddr.toLowerCase(),
            })

            const reversed = result.v3Pools.items[0]
            if (reversed) {
                return reversed.address as Address
            }

            return undefined
        },
        enabled: !!tokenAddr && !!wrappedNative,
        staleTime: 60_000,
    })
}
