import { GraphQLClient, ClientError } from 'graphql-request'

const ponderUrl = process.env.NEXT_PUBLIC_PONDER_URL || undefined
const ponderEnabled = !!ponderUrl

const client = ponderEnabled ? new GraphQLClient(`${ponderUrl}/graphql`) : null

const REQUEST_TIMEOUT_MS = 5_000

let consecutiveFailures = 0
let circuitOpenUntil = 0

export function isPonderError(error: unknown): boolean {
    if (error instanceof ClientError) return true
    return error instanceof Error
}

export function ponderRequest<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
    if (!ponderEnabled) {
        throw new Error('Ponder not configured')
    }

    if (Date.now() < circuitOpenUntil) {
        throw new Error('Ponder circuit breaker open')
    }

    const signal = AbortSignal.timeout(REQUEST_TIMEOUT_MS)

    return client!
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
