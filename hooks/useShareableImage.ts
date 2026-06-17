'use client'

import { useState, useCallback } from 'react'
import { toBlob } from 'html-to-image'
import { toastError } from '@/lib/toast'

interface UseShareableImageReturn {
    downloadImage: (element: HTMLElement, filename?: string, title?: string) => Promise<void>
    isGenerating: boolean
}

// iPadOS 13+ reports its user agent as `Macintosh`, so it's detected via touch points.
function isMobileDevice(): boolean {
    if (typeof navigator === 'undefined') return false
    const ua = navigator.userAgent
    const isIOS =
        /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)
    return isIOS || /Android/.test(ua)
}

export function useShareableImage(): UseShareableImageReturn {
    const [isGenerating, setIsGenerating] = useState(false)

    const downloadImage = useCallback(
        async (
            element: HTMLElement,
            filename = 'junoswap-points.png',
            title = 'My Junoswap Points'
        ) => {
            setIsGenerating(true)
            try {
                const blob = await toBlob(element, {
                    pixelRatio: 2,
                    backgroundColor: '#0a0e1a',
                })
                if (!blob) throw new Error('Failed to generate image')

                const file = new File([blob], filename, { type: 'image/png' })

                // iOS/Android ignore the <a download> attribute, so route mobile through
                // the native share sheet — its "Save Image" action writes to the photo album.
                if (isMobileDevice() && navigator.canShare?.({ files: [file] })) {
                    try {
                        await navigator.share({ files: [file], title })
                        return
                    } catch (error) {
                        if (error instanceof Error && error.name === 'AbortError') return
                        // any other share failure: fall through to the anchor download
                    }
                }

                const url = URL.createObjectURL(blob)
                const link = document.createElement('a')
                link.download = filename
                link.href = url
                link.rel = 'noopener'
                document.body.appendChild(link)
                link.click()
                link.remove()
                URL.revokeObjectURL(url)
            } catch (error) {
                toastError(error instanceof Error ? error : 'Failed to generate image')
            } finally {
                setIsGenerating(false)
            }
        },
        []
    )

    return { downloadImage, isGenerating }
}
