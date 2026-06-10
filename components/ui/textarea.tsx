import * as React from 'react'

import { cn } from '@/lib/utils'

const Textarea = React.forwardRef<HTMLTextAreaElement, React.ComponentProps<'textarea'>>(
    ({ className, value, ...props }, ref) => {
        const internalRef = React.useRef<HTMLTextAreaElement | null>(null)

        // Auto-grow to fit content. Watching `value` (not just onChange) keeps the
        // height in sync with controlled state — including programmatic resets.
        React.useLayoutEffect(() => {
            const el = internalRef.current
            if (!el) return
            el.style.height = 'auto'
            el.style.height = `${el.scrollHeight}px`
        }, [value])

        return (
            <textarea
                value={value}
                ref={(node) => {
                    internalRef.current = node
                    if (typeof ref === 'function') ref(node)
                    else if (ref) ref.current = node
                }}
                className={cn(
                    'flex min-h-9 max-h-48 w-full resize-none bg-transparent px-3 py-2 text-base transition-colors placeholder:text-muted-foreground focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm',
                    className
                )}
                {...props}
            />
        )
    }
)
Textarea.displayName = 'Textarea'

export { Textarea }
