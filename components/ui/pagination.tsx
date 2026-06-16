import * as React from 'react'
import { ChevronLeft, ChevronRight, MoreHorizontal } from 'lucide-react'

import { cn } from '@/lib/utils'
import { Button, buttonVariants } from '@/components/ui/button'

const Pagination = ({ className, ...props }: React.ComponentProps<'nav'>) => (
    <nav
        role="navigation"
        aria-label="pagination"
        className={cn('mx-auto flex w-full justify-center', className)}
        {...props}
    />
)

const PaginationContent = React.forwardRef<HTMLUListElement, React.ComponentProps<'ul'>>(
    ({ className, ...props }, ref) => (
        <ul ref={ref} className={cn('flex flex-row items-center gap-1', className)} {...props} />
    )
)
PaginationContent.displayName = 'PaginationContent'

const PaginationItem = React.forwardRef<HTMLLIElement, React.ComponentProps<'li'>>(
    ({ className, ...props }, ref) => <li ref={ref} className={cn('', className)} {...props} />
)
PaginationItem.displayName = 'PaginationItem'

type PaginationLinkProps = {
    isActive?: boolean
} & Pick<React.ComponentProps<typeof Button>, 'size'> &
    React.ComponentProps<'a'>

const PaginationLink = ({ className, isActive, size, ...props }: PaginationLinkProps) => (
    <a
        aria-current={isActive ? 'page' : undefined}
        className={cn(
            buttonVariants({
                variant: 'outline',
                size,
            }),
            'h-8 min-w-8 cursor-pointer',
            isActive &&
                'pointer-events-none border-transparent bg-foreground text-background shadow-sm',
            className
        )}
        {...props}
    />
)

const PaginationPrevious = ({
    className,
    ...props
}: React.ComponentProps<typeof PaginationLink>) => (
    <PaginationLink
        aria-label="Go to previous page"
        size="sm"
        className={cn('gap-1 pl-2.5', className)}
        {...props}
    >
        <ChevronLeft className="h-4 w-4" />
        <span>Prev</span>
    </PaginationLink>
)

const PaginationNext = ({ className, ...props }: React.ComponentProps<typeof PaginationLink>) => (
    <PaginationLink
        aria-label="Go to next page"
        size="sm"
        className={cn('gap-1 pr-2.5', className)}
        {...props}
    >
        <span>Next</span>
        <ChevronRight className="h-4 w-4" />
    </PaginationLink>
)

const PaginationEllipsis = ({ className, ...props }: React.ComponentProps<'span'>) => (
    <span
        aria-hidden
        className={cn('flex h-8 w-8 items-center justify-center text-muted-foreground', className)}
        {...props}
    >
        <MoreHorizontal className="h-4 w-4" />
    </span>
)

function generatePageRange(currentPage: number, totalPages: number, siblingCount: number = 1) {
    const totalNumbers = siblingCount * 2 + 3 // first + last + current + 2 siblings
    const totalSlots = totalNumbers + 2 // +2 for ellipsis

    if (totalPages <= totalSlots) {
        return Array.from({ length: totalPages }, (_, i) => i + 1)
    }

    const leftSibling = Math.max(currentPage - siblingCount, 1)
    const rightSibling = Math.min(currentPage + siblingCount, totalPages)

    const showLeftEllipsis = leftSibling > 2
    const showRightEllipsis = rightSibling < totalPages - 1

    if (!showLeftEllipsis && showRightEllipsis) {
        const leftCount = 3 + 2 * siblingCount
        const leftRange = Array.from({ length: leftCount }, (_, i) => i + 1)
        return [...leftRange, 'ellipsis-right', totalPages]
    }

    if (showLeftEllipsis && !showRightEllipsis) {
        const rightCount = 3 + 2 * siblingCount
        const rightRange = Array.from(
            { length: rightCount },
            (_, i) => totalPages - rightCount + i + 1
        )
        return [1, 'ellipsis-left', ...rightRange]
    }

    return [
        1,
        'ellipsis-left',
        ...Array.from({ length: rightSibling - leftSibling + 1 }, (_, i) => leftSibling + i),
        'ellipsis-right',
        totalPages,
    ]
}

interface PaginationControlsProps {
    currentPage: number
    totalPages: number
    onPageChange: (page: number) => void
    siblingCount?: number
}

function PaginationControls({
    currentPage,
    totalPages,
    onPageChange,
    siblingCount = 1,
}: PaginationControlsProps) {
    if (totalPages <= 1) return null

    const pages = generatePageRange(currentPage, totalPages, siblingCount)

    return (
        <Pagination>
            <PaginationContent>
                <PaginationItem>
                    <PaginationPrevious
                        onClick={() => currentPage > 1 && onPageChange(currentPage - 1)}
                        className={cn(currentPage <= 1 && 'pointer-events-none opacity-50')}
                    />
                </PaginationItem>

                {pages.map((page, i) => (
                    <PaginationItem key={i}>
                        {typeof page === 'number' ? (
                            <PaginationLink
                                isActive={page === currentPage}
                                onClick={() => onPageChange(page)}
                            >
                                {page}
                            </PaginationLink>
                        ) : (
                            <PaginationEllipsis />
                        )}
                    </PaginationItem>
                ))}

                <PaginationItem>
                    <PaginationNext
                        onClick={() => currentPage < totalPages && onPageChange(currentPage + 1)}
                        className={cn(
                            currentPage >= totalPages && 'pointer-events-none opacity-50'
                        )}
                    />
                </PaginationItem>
            </PaginationContent>
        </Pagination>
    )
}

export { PaginationControls }
