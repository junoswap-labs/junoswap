import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockToastError = vi.fn()

vi.mock('sonner', () => ({
    toast: Object.assign(vi.fn(), {
        error: mockToastError,
    }),
}))

describe('lib/toast', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        vi.stubGlobal('navigator', {
            clipboard: {
                writeText: vi.fn(),
            },
        })
    })

    async function getModule() {
        return await import('@/lib/toast')
    }

    describe('toastError', () => {
        it('handles user rejection (code 4001)', async () => {
            const { toastError } = await getModule()
            const error = Object.assign(new Error('User rejected'), { code: 4001 })
            toastError(error)
            expect(mockToastError).toHaveBeenCalledWith(
                'Transaction rejected by user',
                expect.anything()
            )
        })

        it('handles network errors', async () => {
            const { toastError } = await getModule()
            toastError(new Error('network timeout'))
            expect(mockToastError).toHaveBeenCalledWith(
                'Network error. Please check your connection.',
                expect.anything()
            )
        })

        it('truncates long messages', async () => {
            const { toastError } = await getModule()
            const longMsg = 'A'.repeat(200)
            toastError(longMsg)
            const call = mockToastError.mock.calls[0]!
            expect(call[0].length).toBeLessThanOrEqual(103) // 100 + '...'
        })
    })
})
