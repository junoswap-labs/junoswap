// Launchpad logos are pinned on our Pinata account, so any gateway.pinata.cloud
// URL is also served by our faster dedicated gateway. Safe to rewrite the host.
export function normalizePinataGateway(url: string): string {
    return url.replace('https://gateway.pinata.cloud/ipfs/', 'https://cmswap.mypinata.cloud/ipfs/')
}
