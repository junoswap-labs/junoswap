import { NativeUsdPriceProvider } from '@/components/launchpad/native-usd-price-provider'

export default function PointsLayout({ children }: { children: React.ReactNode }) {
    return <NativeUsdPriceProvider>{children}</NativeUsdPriceProvider>
}
