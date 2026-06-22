import * as React from 'react'

export function useIsMobile() {
    const [isMobile, setIsMobile] = React.useState(false)

    React.useEffect(() => {
        const mql = window.matchMedia('(max-width: 640px)')
        const update = () => setIsMobile(mql.matches)
        update()
        mql.addEventListener('change', update)
        return () => mql.removeEventListener('change', update)
    }, [])

    return isMobile
}
