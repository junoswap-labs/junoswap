import { toast } from 'sonner'

const APP_VERSION = '1.4.2'

const MAX_ERROR_LENGTH = 100

function truncateErrorMessage(message: string, maxLength: number = MAX_ERROR_LENGTH): string {
    if (message.length <= maxLength) return message
    return message.slice(0, maxLength) + '...'
}

function formatError(error: Error | unknown, _context?: string): string {
    if (error instanceof Error) {
        const errorWithCode = error as Error & { code?: number }
        if (errorWithCode.code === 4001) {
            return 'Transaction rejected by user'
        }
        if (error.message.includes('network')) {
            return 'Network error. Please check your connection.'
        }
        return error.message
    }
    return _context || 'An error occurred'
}

export function toastError(input: Error | string, _context?: string) {
    let fullMessage: string

    if (input instanceof Error) {
        fullMessage = formatError(input, _context)
    } else {
        fullMessage = input
    }

    const truncated = truncateErrorMessage(fullMessage)
    const isTruncated = fullMessage.length > MAX_ERROR_LENGTH

    const baseAction = {
        label: 'Copy',
        onClick: () => {
            navigator.clipboard.writeText(fullMessage)
            toast.success('Error copied to clipboard')
        },
    }

    const toastOptions = {
        description: `v${APP_VERSION}`,
        action: isTruncated
            ? {
                  label: 'View Details',
                  onClick: () => {
                      toast(fullMessage, {
                          description: `v${APP_VERSION}`,
                          action: baseAction,
                      })
                  },
              }
            : baseAction,
    }

    toast.error(truncated, toastOptions)
}

export const toastSuccess = toast.success
export const toastWarning = toast.warning
