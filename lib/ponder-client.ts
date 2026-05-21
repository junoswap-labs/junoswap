import { GraphQLClient, ClientError } from 'graphql-request'

const ponderUrl = process.env.NEXT_PUBLIC_PONDER_URL ?? 'http://localhost:42069'

const client = new GraphQLClient(`${ponderUrl}/graphql`)

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

    return client.request<T>(query, variables).then(
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
