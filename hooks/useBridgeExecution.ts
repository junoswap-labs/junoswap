'use client'

import { useState, useCallback } from 'react'
import type { Route } from '@lifi/types'
import { executeRoute } from '@lifi/sdk'
import type { RouteExtended } from '@lifi/sdk'
import { toastError, toastSuccess } from '@/lib/toast'

interface UseBridgeExecutionResult {
    execute: (route: Route) => Promise<void>
    isExecuting: boolean
    activeRoute: RouteExtended | null
    isSuccess: boolean
    isError: boolean
    error: string | null
    reset: () => void
}

export function useBridgeExecution(): UseBridgeExecutionResult {
    const [isExecuting, setIsExecuting] = useState(false)
    const [activeRoute, setActiveRoute] = useState<RouteExtended | null>(null)
    const [isSuccess, setIsSuccess] = useState(false)
    const [isError, setIsError] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const execute = useCallback(async (route: Route) => {
        setIsExecuting(true)
        setIsSuccess(false)
        setIsError(false)
        setError(null)

        try {
            const executedRoute = await executeRoute(route)

            setIsSuccess(true)
            setActiveRoute(executedRoute)
            toastSuccess('Bridge transaction submitted!')
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Bridge execution failed'
            setError(message)
            setIsError(true)
            toastError(err instanceof Error ? err : message, 'Bridge failed')
        } finally {
            setIsExecuting(false)
        }
    }, [])

    const reset = useCallback(() => {
        setIsExecuting(false)
        setActiveRoute(null)
        setIsSuccess(false)
        setIsError(false)
        setError(null)
    }, [])

    return {
        execute,
        isExecuting,
        activeRoute,
        isSuccess,
        isError,
        error,
        reset,
    }
}
