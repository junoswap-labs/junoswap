'use server'

const ALLOWED_MIME_TYPES = [
    'image/png',
    'image/jpeg',
    'image/gif',
    'image/svg+xml',
    'image/webp',
] as const

const MAX_FILE_SIZE = 1024 * 1024 // 1MB
const PINATA_UPLOAD_URL = 'https://uploads.pinata.cloud/v3/files'
const PINATA_GATEWAY = 'https://cmswap.mypinata.cloud/ipfs'

interface UploadResult {
    success: true
    url: string
}

interface UploadError {
    success: false
    error: string
}

export async function uploadToPinata(formData: FormData): Promise<UploadResult | UploadError> {
    const jwt = process.env.PINATA_JWT
    if (!jwt) {
        return { success: false, error: 'Pinata is not configured. Set PINATA_JWT in .env.local.' }
    }

    const file = formData.get('file') as File | null
    if (!file) {
        return { success: false, error: 'No file provided.' }
    }

    if (!ALLOWED_MIME_TYPES.includes(file.type as (typeof ALLOWED_MIME_TYPES)[number])) {
        return {
            success: false,
            error: 'Invalid file type. Please upload a PNG, JPG, GIF, SVG, or WebP image.',
        }
    }

    if (file.size > MAX_FILE_SIZE) {
        return { success: false, error: 'File size must be under 1MB.' }
    }

    try {
        const pinataForm = new FormData()
        pinataForm.append('network', 'public')
        pinataForm.append('file', file)
        pinataForm.append('name', file.name || `token-logo-${Date.now()}`)

        const response = await fetch(PINATA_UPLOAD_URL, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${jwt}`,
            },
            body: pinataForm,
        })

        const text = await response.text()
        let json: Record<string, unknown> | undefined
        try {
            json = JSON.parse(text)
        } catch {
            // non-JSON response
        }

        if (!response.ok) {
            const detail = json ? JSON.stringify(json) : text
            console.error('Pinata upload failed:', response.status, detail)
            return { success: false, error: `Pinata error (${response.status}): ${detail}` }
        }

        const cid = (json as Record<string, Record<string, string>>)?.data?.cid
        if (!cid) {
            console.error('Pinata response missing CID:', json)
            return { success: false, error: `No CID in response: ${JSON.stringify(json)}` }
        }

        return { success: true, url: `${PINATA_GATEWAY}/${cid}` }
    } catch (err) {
        console.error('Pinata upload error:', err)
        return { success: false, error: 'Upload failed. Please try again.' }
    }
}
