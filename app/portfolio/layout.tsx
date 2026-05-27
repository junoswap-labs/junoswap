import { NativeUsdPriceProvider } from '@/components/launchpad/native-usd-price-provider'

export default function PortfolioLayout({ children }: { children: React.ReactNode }) {
    return <NativeUsdPriceProvider>{children}</NativeUsdPriceProvider>
}
