import Link from 'next/link'
import { Button } from '@/components/ui/button'

export function CTA() {
    return (
        <section className="py-16">
            <div className="mx-auto max-w-7xl px-6 lg:px-8">
                <div className="relative overflow-hidden rounded-3xl bg-card border border-border/50 px-6 py-20 sm:px-12 sm:py-24 lg:px-16 transition-all duration-500">
                    <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_100%,hsl(0_100%_60%_/_0.08),transparent)] pointer-events-none" />
                    <div className="absolute -top-24 -right-24 h-64 w-64 rounded-full bg-primary/20 blur-3xl pointer-events-none" />
                    <div className="absolute -bottom-24 -left-24 h-48 w-48 rounded-full bg-primary/10 blur-3xl pointer-events-none" />
                    <div className="relative z-10 mx-auto max-w-2xl text-center">
                        <p className="text-base font-semibold leading-7 text-primary">
                            Get Started
                        </p>
                        <h2 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">
                            Ready to start trading?
                        </h2>
                        <p className="mt-6 text-lg text-muted-foreground">
                            No registration required — just connect your wallet.
                        </p>
                        <div className="mt-10 flex flex-col gap-4 sm:flex-row sm:justify-center">
                            <Link href="/swap">
                                <Button size="xl" className="group w-full sm:w-auto">
                                    Launch App
                                </Button>
                            </Link>
                        </div>
                    </div>
                </div>
            </div>
        </section>
    )
}
