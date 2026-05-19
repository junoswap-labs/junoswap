import { NativeUsdPriceProvider } from '@/components/launchpad/native-usd-price-provider'

export default function LaunchpadLayout({ children }: { children: React.ReactNode }) {
    return <NativeUsdPriceProvider>{children}</NativeUsdPriceProvider>
}
