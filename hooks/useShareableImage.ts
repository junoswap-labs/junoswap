'use client'

import { useState, useCallback } from 'react'
import { toPng, toBlob } from 'html-to-image'
import { toastSuccess, toastError } from '@/lib/toast'

interface UseShareableImageReturn {
    downloadImage: (element: HTMLElement, filename?: string) => Promise<void>
    shareImage: (element: HTMLElement) => Promise<void>
    copyToClipboard: (element: HTMLElement) => Promise<void>
    isGenerating: boolean
}

export function useShareableImage(): UseShareableImageReturn {
    const [isGenerating, setIsGenerating] = useState(false)

    const generateImage = useCallback(async (element: HTMLElement): Promise<string> => {
        return toPng(element, {
            pixelRatio: 2,
            backgroundColor: '#0a0e1a',
        })
    }, [])

    const downloadImage = useCallback(
        async (element: HTMLElement, filename = 'junoswap-points.png') => {
            setIsGenerating(true)
            try {
                const dataUrl = await generateImage(element)
                const link = document.createElement('a')
                link.download = filename
                link.href = dataUrl
                link.click()
                toastSuccess('Image downloaded!')
            } catch (error) {
                toastError(error instanceof Error ? error : 'Failed to generate image')
            } finally {
                setIsGenerating(false)
            }
        },
        [generateImage]
    )

    const copyToClipboard = useCallback(
        async (element: HTMLElement) => {
            setIsGenerating(true)
            try {
                const blob = await toBlob(element, {
                    pixelRatio: 2,
                    backgroundColor: '#0a0e1a',
                })
                if (!blob) throw new Error('Failed to generate image')

                try {
                    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
                    toastSuccess('Card copied to clipboard!')
                } catch {
                    const dataUrl = await generateImage(element)
                    await navigator.clipboard.writeText(dataUrl)
                    toastSuccess('Card image link copied!')
                }
            } catch (error) {
                toastError(error instanceof Error ? error : 'Failed to copy image')
            } finally {
                setIsGenerating(false)
            }
        },
        [generateImage]
    )

    const shareImage = useCallback(
        async (element: HTMLElement) => {
            if (!navigator.share) {
                return copyToClipboard(element)
            }

            setIsGenerating(true)
            try {
                const blob = await toBlob(element, {
                    pixelRatio: 2,
                    backgroundColor: '#0a0e1a',
                })
                if (!blob) throw new Error('Failed to generate image')

                const file = new File([blob], 'junoswap-points.png', { type: 'image/png' })
                await navigator.share({
                    files: [file],
                    title: 'My Junoswap Points',
                })
            } catch (error) {
                if (error instanceof Error && error.name === 'AbortError') return
                toastError(error instanceof Error ? error : 'Failed to share image')
            } finally {
                setIsGenerating(false)
            }
        },
        [copyToClipboard]
    )

    return { downloadImage, shareImage, copyToClipboard, isGenerating }
}
