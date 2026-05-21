import { NextRequest, NextResponse } from 'next/server'

const PONDER_URL = process.env.PONDER_URL

export async function POST(request: NextRequest) {
    if (!PONDER_URL) {
        return NextResponse.json(
            { errors: [{ message: 'Ponder not configured' }] },
            { status: 503 }
        )
    }

    const body = await request.json()

    try {
        const response = await fetch(`${PONDER_URL}/graphql`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
            signal: AbortSignal.timeout(5_000),
        })

        const data = await response.json()
        return NextResponse.json(data, { status: response.status })
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error'
        return NextResponse.json(
            { errors: [{ message: `Ponder fetch failed: ${message}` }] },
            { status: 502 }
        )
    }
}
