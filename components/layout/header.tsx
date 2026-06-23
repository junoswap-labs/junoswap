'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useAccount } from 'wagmi'
import { ConnectButton } from '@/components/web3/connect-button'
import { NetworkSwitcher } from '@/components/web3/network-switcher'
import {
    NavigationMenu,
    NavigationMenuItem,
    NavigationMenuLink,
    NavigationMenuList,
} from '@/components/ui/navigation-menu'
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Button } from '@/components/ui/button'
import { Menu, ChevronDown } from 'lucide-react'
import { useEffect, useState } from 'react'

// Social / community links surfaced through the "More" menu.
const socialLinks = [
    {
        label: 'X',
        href: 'https://x.com/junoswaptrade',
        icon: (
            <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24" aria-hidden>
                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
            </svg>
        ),
    },
    {
        label: 'Telegram',
        href: 'https://t.me/junoswaptrade',
        icon: (
            <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24" aria-hidden>
                <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
            </svg>
        ),
    },
    {
        label: 'Discord',
        href: 'https://discord.gg/caE5wzQBME',
        icon: (
            <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24" aria-hidden>
                <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
            </svg>
        ),
    },
    {
        label: 'GitHub',
        href: 'https://github.com/coshi190/junoswap',
        icon: (
            <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24" aria-hidden>
                <path
                    fillRule="evenodd"
                    d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"
                    clipRule="evenodd"
                />
            </svg>
        ),
    },
]

export function Header() {
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)
    const pathname = usePathname()
    const { address } = useAccount()
    const isLanding = pathname === '/'

    // The Portfolio link points at the connected wallet so the page opens on the
    // user's own portfolio; clicking a leaderboard row instead passes that trader's
    // address. Active highlighting still matches on the bare /portfolio path.
    const navHref = (href: string) =>
        href === '/portfolio' && address ? `/portfolio?address=${address}` : href

    // On the landing page the hero renders behind this nav. Keep the nav
    // transparent while the hero is still under it, then restore the normal
    // translucent background once the user scrolls past the hero.
    const [scrolled, setScrolled] = useState(false)
    useEffect(() => {
        if (!isLanding) {
            setScrolled(false)
            return
        }
        const onScroll = () => setScrolled(window.scrollY > window.innerHeight - 64)
        onScroll()
        window.addEventListener('scroll', onScroll, { passive: true })
        window.addEventListener('resize', onScroll)
        return () => {
            window.removeEventListener('scroll', onScroll)
            window.removeEventListener('resize', onScroll)
        }
    }, [isLanding])

    const transparent = isLanding && !scrolled
    const navLinks = [
        { href: '/swap', label: 'Swap' },
        { href: '/earn', label: 'Earn' },
        { href: '/bridge', label: 'Bridge' },
        { href: '/launchpad', label: 'Launchpad' },
        { href: '/portfolio', label: 'Portfolio' },
        { href: '/leaderboard', label: 'Leaderboard' },
        { href: '/points', label: 'Points' },
    ]
    return (
        <header
            className={`sticky top-0 z-50 w-full transition-colors duration-300 ${
                transparent
                    ? // Hero is dark in both themes, so force the nav into the dark
                      // token context while it's transparent over it. `text-foreground`
                      // is set on the header itself so its computed (light) color
                      // inherits down to icon-only elements (hamburger, chain chevron)
                      // that don't carry their own text-color class — without it they'd
                      // keep inheriting the body's light-theme (dark) color and vanish.
                      // Portaled overlays (mobile sheet, modals) render elsewhere and
                      // keep their own page-theme styling.
                      'dark bg-transparent text-foreground'
                    : 'bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60'
            }`}
        >
            <div className="flex h-16 items-center px-4 lg:px-6">
                {/* Left group: Logo + Desktop Nav */}
                <div className="flex items-center gap-1 md:gap-6 lg:gap-8">
                    {/* Logo */}
                    <Link href="/" className="flex items-center space-x-2">
                        <div
                            className="bg-gradient-to-br from-primary to-[#FF914D]"
                            style={{
                                width: 28,
                                height: 28,
                                WebkitMaskImage: 'url(/logo.svg)',
                                maskImage: 'url(/logo.svg)',
                                WebkitMaskSize: 'contain',
                                maskSize: 'contain',
                                WebkitMaskRepeat: 'no-repeat',
                                maskRepeat: 'no-repeat',
                            }}
                        />
                        <span className="hidden md:inline text-xl font-bold bg-gradient-to-r from-primary to-[#FF914D] bg-clip-text text-transparent">
                            Junoswap
                        </span>
                    </Link>

                    {/* Desktop navigation */}
                    <NavigationMenu className="hidden md:flex">
                        <NavigationMenuList className="!justify-start gap-1">
                            {navLinks.map((link) => {
                                const isActive = pathname === link.href
                                return (
                                    <NavigationMenuItem key={link.href}>
                                        <NavigationMenuLink asChild>
                                            <Link
                                                href={navHref(link.href)}
                                                className={`relative inline-flex items-center px-4 py-2 text-[13px] font-medium leading-none rounded-lg transition-all duration-200 ease-out ${
                                                    isActive
                                                        ? 'text-foreground'
                                                        : 'text-muted-foreground'
                                                }`}
                                            >
                                                {link.label}
                                            </Link>
                                        </NavigationMenuLink>
                                    </NavigationMenuItem>
                                )
                            })}
                            <NavigationMenuItem>
                                <DropdownMenu>
                                    <DropdownMenuTrigger className="group inline-flex cursor-pointer items-center gap-1 px-4 py-2 text-[13px] font-medium leading-none rounded-lg text-muted-foreground outline-none transition-all duration-200 ease-out hover:text-foreground data-[state=open]:text-foreground">
                                        More
                                        <ChevronDown className="h-3.5 w-3.5 transition-transform duration-200 group-data-[state=open]:rotate-180" />
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent
                                        align="start"
                                        sideOffset={8}
                                        className="w-48 rounded-xl border-border/60 bg-popover/95 p-1.5 backdrop-blur"
                                    >
                                        {socialLinks.map((social) => (
                                            <DropdownMenuItem key={social.label} asChild>
                                                <a
                                                    href={social.href}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-[13px] font-medium text-muted-foreground transition-colors focus:text-foreground"
                                                >
                                                    {social.icon}
                                                    {social.label}
                                                </a>
                                            </DropdownMenuItem>
                                        ))}
                                    </DropdownMenuContent>
                                </DropdownMenu>
                            </NavigationMenuItem>
                        </NavigationMenuList>
                    </NavigationMenu>
                </div>

                <div className="flex-1" />

                {/* Right controls */}
                <div className="flex items-center gap-2">
                    <NetworkSwitcher />
                    <ConnectButton />
                    {/* Mobile hamburger - right edge */}
                    <Sheet open={isMobileMenuOpen} onOpenChange={setIsMobileMenuOpen}>
                        <SheetTrigger asChild>
                            <Button variant="ghost" size="icon" className="md:hidden -mr-2 ml-1">
                                <Menu className="h-5 w-5" />
                                <span className="sr-only">Toggle menu</span>
                            </Button>
                        </SheetTrigger>
                        <SheetContent
                            side="top"
                            className="bg-background/95 backdrop-blur top-16 max-h-[calc(100vh-4rem)] overflow-y-auto"
                        >
                            <SheetTitle className="sr-only">Navigation menu</SheetTitle>

                            {/* Nav links */}
                            <nav className="flex flex-col gap-1">
                                {navLinks.map((link) => {
                                    const isActive = pathname === link.href
                                    return (
                                        <Link
                                            key={link.href}
                                            href={navHref(link.href)}
                                            className={`flex items-center min-h-[48px] px-4 py-3 text-[15px] font-medium transition-all duration-150 ${
                                                isActive
                                                    ? 'text-foreground'
                                                    : 'text-muted-foreground border-transparent'
                                            }`}
                                            onClick={() => setIsMobileMenuOpen(false)}
                                        >
                                            {link.label}
                                        </Link>
                                    )
                                })}
                            </nav>

                            {/* Social links */}
                            <div className="mt-3 border-t border-border/60 px-4 pt-4">
                                <div className="flex items-center gap-2">
                                    {socialLinks.map((social) => (
                                        <a
                                            key={social.label}
                                            href={social.href}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            aria-label={social.label}
                                            className="flex h-10 w-10 items-center justify-center rounded-lg border border-border/60 text-muted-foreground transition-colors hover:border-border hover:text-foreground"
                                            onClick={() => setIsMobileMenuOpen(false)}
                                        >
                                            {social.icon}
                                        </a>
                                    ))}
                                </div>
                            </div>
                        </SheetContent>
                    </Sheet>
                </div>
            </div>
        </header>
    )
}
