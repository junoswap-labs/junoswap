import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import { Loader2 } from 'lucide-react'

import { cn } from '@/lib/utils'

const buttonVariants = cva(
    'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0',
    {
        variants: {
            variant: {
                default:
                    'bg-gradient-to-r from-primary to-[#FF914D] text-white shadow-sm hover:opacity-90 active:opacity-80 active:scale-[0.98]',
                destructive:
                    'bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90',
                outline:
                    'border border-input bg-background shadow-sm hover:bg-accent hover:text-accent-foreground',
                secondary: 'bg-secondary text-secondary-foreground shadow-sm hover:bg-secondary/80',
                ghost: 'hover:bg-accent hover:text-accent-foreground',
                link: 'text-primary underline-offset-4 hover:underline',
                success:
                    'bg-emerald-600 text-white shadow-sm hover:bg-emerald-700 active:bg-emerald-800',
                danger: 'bg-red-600 text-white shadow-sm hover:bg-red-700 active:bg-red-800',
                warning: 'bg-amber-500 text-white shadow-sm hover:bg-amber-600 active:bg-amber-700',
            },
            size: {
                default: 'h-9 px-4 py-2',
                sm: 'h-8 px-3 text-xs',
                lg: 'h-10 px-8',
                xl: 'h-14 px-10 text-base',
                icon: 'h-9 w-9',
            },
        },
        defaultVariants: {
            variant: 'default',
            size: 'default',
        },
    }
)

interface ButtonProps
    extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
    asChild?: boolean
    isLoading?: boolean
    loadingText?: string
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
    (
        {
            className,
            variant,
            size,
            asChild = false,
            isLoading,
            loadingText,
            disabled,
            children,
            ...props
        },
        ref
    ) => {
        const Comp = asChild ? Slot : 'button'
        return (
            <Comp
                className={cn(
                    buttonVariants({ variant, size, className }),
                    isLoading && 'pointer-events-none opacity-80'
                )}
                disabled={disabled || isLoading}
                ref={ref}
                {...props}
            >
                {isLoading && !asChild && <Loader2 className="h-4 w-4 animate-spin" />}
                {isLoading && loadingText ? loadingText : children}
            </Comp>
        )
    }
)
Button.displayName = 'Button'

export { Button, buttonVariants }
