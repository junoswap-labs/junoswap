import { GraphQLClient, ClientError } from 'graphql-request'

let client: GraphQLClient | null = null

function getClient() {
    if (!client) {
        const origin = typeof window !== 'undefined' ? window.location.origin : ''
        client = new GraphQLClient(`${origin}/api/ponder/graphql`)
    }
    return client
}

const REQUEST_TIMEOUT_MS = 5_000

let consecutiveFailures = 0
let circuitOpenUntil = 0

export function isPonderError(error: unknown): boolean {
    if (error instanceof ClientError) return true
    return error instanceof Error
}

export function ponderRequest<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
    if (Date.now() < circuitOpenUntil) {
        throw new Error('Ponder circuit breaker open')
    }

    const signal = AbortSignal.timeout(REQUEST_TIMEOUT_MS)

    return getClient()
        .request<T>({
            document: query,
            variables,
            signal,
        })
        .then(
            (result) => {
                consecutiveFailures = 0
                return result
            },
            (error) => {
                if (isPonderError(error)) {
                    consecutiveFailures++
                    if (consecutiveFailures >= 3) {
                        circuitOpenUntil = Date.now() + 30_000
                    }
                }
                throw error
            }
        )
}

export interface PonderPageInfo {
    hasNextPage: boolean
    endCursor: string | null
}

// Walk every page of a Ponder list query via opaque cursor. The cursor must be
// pageInfo.endCursor (a raw row id is rejected server-side). Ponder caps a list
// response at 50 items without an explicit limit, so callers must pass `limit`
// (and a matching `$after` variable) in their query.
export async function fetchAllPages<TResponse, TItem>(
    query: string,
    variables: Record<string, unknown>,
    select: (r: TResponse) => { pageInfo: PonderPageInfo; items: TItem[] }
): Promise<TItem[]> {
    const items: TItem[] = []
    let after: string | null = null
    for (;;) {
        const result = await ponderRequest<TResponse>(query, { ...variables, after })
        const conn = select(result)
        items.push(...conn.items)
        if (!conn.pageInfo.hasNextPage || !conn.pageInfo.endCursor) break
        after = conn.pageInfo.endCursor
    }
    return items
}
