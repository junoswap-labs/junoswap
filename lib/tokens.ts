import type { Token } from '@/types/tokens'
import type { Address } from 'viem'
import { kubTestnet, jbc, bitkub, worldchain, base, bsc, isNativeToken } from './wagmi'

export const KUSDT_ADDRESS = '0x7d984C24d2499D840eB3b7016077164e15E5faA6' as const

/**
 * Get the allowance function name for a token
 * Most tokens use 'allowance', but KUSDT uses 'allowances' (plural)
 */
export function getAllowanceFunctionName(tokenAddress: Address): 'allowance' | 'allowances' {
    return tokenAddress.toLowerCase() === KUSDT_ADDRESS.toLowerCase() ? 'allowances' : 'allowance'
}

export const KUB_TESTNET_TOKENS: Token[] = [
    {
        address: '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee' as const,
        symbol: 'KUB',
        name: 'KUB',
        decimals: 18,
        chainId: kubTestnet.id,
        logo: 'https://cmswap.mypinata.cloud/ipfs/bafkreifelq2ktrxybwnkyabw7veqzec3p4v47aoco7acnzdwj34sn7q56u',
    },
    {
        address: '0x700D3ba307E1256e509eD3E45D6f9dff441d6907' as const,
        symbol: 'tKKUB',
        name: 'Wrapped KUB',
        decimals: 18,
        chainId: kubTestnet.id,
        logo: 'https://cmswap.mypinata.cloud/ipfs/bafkreifelq2ktrxybwnkyabw7veqzec3p4v47aoco7acnzdwj34sn7q56u',
    },
    {
        address: '0xE7f64C5fEFC61F85A8b851d8B16C4E21F91e60c0' as const,
        symbol: 'testKUB',
        name: 'testKUB',
        decimals: 18,
        chainId: kubTestnet.id,
        logo: 'https://cmswap.mypinata.cloud/ipfs/bafkreihqaivu4woi3ibymi4w5lrgv6dnylnuasa4qjkpgqmm655et2lpia',
    },
    {
        address: '0x23352915164527e0AB53Ca5519aec5188aa224A2' as const,
        symbol: 'testToken',
        name: 'testToken',
        decimals: 18,
        chainId: kubTestnet.id,
        logo: 'https://cmswap.mypinata.cloud/ipfs/bafkreiglz7dfa4xf6octr7aktdrb6oza6vvcf5t6n26onvg6gymnuhdose',
    },
    {
        address: '0x70138f1b88BEe73dD2Cb06F24146f964Dde6144e' as const,
        symbol: 'KUSDT',
        name: 'KUSDT',
        decimals: 18,
        chainId: kubTestnet.id,
        logo: 'https://cmswap.mypinata.cloud/ipfs/bafkreieg7yf6iwx7obygg62hz252bwnaddedanvlizonaawagk7eze4qcu',
    },
]

export const JB_CHAIN_TOKENS: Token[] = [
    {
        address: '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee' as const,
        symbol: 'JBC',
        name: 'JBC',
        decimals: 18,
        chainId: jbc.id,
        logo: 'https://cmswap.mypinata.cloud/ipfs/bafkreihej2whwsw4p57ayfqxhwijnpmgxtnwhngh5f5pxpvxw73s636hzy',
    },
    {
        address: '0xC4B7C87510675167643e3DE6EEeD4D2c06A9e747' as const,
        symbol: 'WJBC',
        name: 'WJBC',
        decimals: 18,
        chainId: jbc.id,
        logo: 'https://cmswap.mypinata.cloud/ipfs/bafkreihej2whwsw4p57ayfqxhwijnpmgxtnwhngh5f5pxpvxw73s636hzy',
    },
    {
        address: '0x99999999990FC47611b74827486218f3398A4abD' as const,
        symbol: 'jWJBC',
        name: 'jibswap Wrapped JBC',
        decimals: 18,
        chainId: jbc.id,
        logo: 'https://cmswap.mypinata.cloud/ipfs/bafkreihej2whwsw4p57ayfqxhwijnpmgxtnwhngh5f5pxpvxw73s636hzy',
    },
    {
        address: '0x24599b658b57f91E7643f4F154B16bcd2884f9ac' as const,
        symbol: 'JUSDT',
        name: 'JUSDT',
        decimals: 18,
        chainId: jbc.id,
        logo: 'https://gateway.pinata.cloud/ipfs/bafkreif3vllg6mwswlqypqgtsh7i7wwap7zgrkvtlhdjoc63zjm7uv6vvi',
    },
    {
        address: '0xFD8Ef75c1cB00A594D02df48ADdc27414Bd07F8a' as const,
        symbol: 'USDT',
        name: 'USDT',
        decimals: 18,
        chainId: jbc.id,
        logo: 'https://jibswap.com/images/tokens/USDT.png',
    },
    {
        address: '0xE67E280f5a354B4AcA15fA7f0ccbF667CF74F97b' as const,
        symbol: 'CMJ',
        name: 'CMJ',
        decimals: 18,
        chainId: jbc.id,
        logo: 'https://gateway.pinata.cloud/ipfs/bafkreiabbtn5pc6di4nwfgpqkk3ss6njgzkt2evilc5i2r754pgiru5x4u',
    },
    {
        address: '0x7414e2D8Fb8466AfA4F85A240c57CB8615901FFB' as const,
        symbol: 'DoiJIB',
        name: 'DoiJIB',
        decimals: 18,
        chainId: jbc.id,
        logo: 'https://gateway.pinata.cloud/ipfs/bafybeicfkse4uvkhhkrhfwtap4h3v5msef6lg3t3xvb2hspw3xd5wegzfi',
    },
    {
        address: '0x8fcC6e3a23a0255057bfD9A97799b3a995Bf3D24' as const,
        symbol: 'BB',
        name: 'BB',
        decimals: 18,
        chainId: jbc.id,
        logo: 'https://daobuddy.xyz/img/commuDao/token/BB.png',
    },
]

export const KUB_MAINNET_TOKENS: Token[] = [
    {
        address: '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee' as const,
        symbol: 'KUB',
        name: 'KUB',
        decimals: 18,
        chainId: bitkub.id,
        logo: 'https://cmswap.mypinata.cloud/ipfs/bafkreifelq2ktrxybwnkyabw7veqzec3p4v47aoco7acnzdwj34sn7q56u',
    },
    {
        address: '0x67eBD850304c70d983B2d1b93ea79c7CD6c3F6b5' as const,
        symbol: 'KKUB',
        name: 'Wrapped KUB',
        decimals: 18,
        chainId: bitkub.id,
        logo: 'https://cmswap.mypinata.cloud/ipfs/bafkreifelq2ktrxybwnkyabw7veqzec3p4v47aoco7acnzdwj34sn7q56u',
    },
    {
        address: '0x7d984C24d2499D840eB3b7016077164e15E5faA6' as const,
        symbol: 'KUSDT',
        name: 'KUSDT',
        decimals: 18,
        chainId: bitkub.id,
        logo: 'https://cmswap.mypinata.cloud/ipfs/bafkreieg7yf6iwx7obygg62hz252bwnaddedanvlizonaawagk7eze4qcu',
    },
    {
        address: '0x9B005000A10Ac871947D99001345b01C1cEf2790' as const,
        symbol: 'CMM',
        name: 'CMM',
        decimals: 18,
        chainId: bitkub.id,
        logo: 'https://cmswap.mypinata.cloud/ipfs/bafkreiavqn4meapmjfpe756wrg4fsdnd33brbrsi55mb27tmttoctbyzme',
    },
    {
        address: '0x95013Dcb6A561e6C003AED9C43Fb8B64008aA361' as const,
        symbol: 'LUMI',
        name: 'LUMI',
        decimals: 18,
        chainId: bitkub.id,
        logo: 'https://cmswap.mypinata.cloud/ipfs/bafkreif336hux427usw7cdeyxgfuls7xkstal6yphat2fdxwvvb4icnkcq',
    },
    {
        address: '0xC8925E89bE4Ce76218a3e52B995C5Ae02662A94F' as const,
        symbol: 'ISOLA',
        name: 'ISOLA',
        decimals: 18,
        chainId: bitkub.id,
        logo: 'https://cmswap.mypinata.cloud/ipfs/bafkreiggs47xpvrutabszgn73mwchzambqbv4dspreoglqqioazof4k2sa',
    },
    {
        address: '0x9cf6dF95b918307Ff81feF70E616a094e9977a28' as const,
        symbol: 'KSOLA',
        name: 'KSOLA',
        decimals: 18,
        chainId: bitkub.id,
        logo: 'https://cmswap.mypinata.cloud/ipfs/bafkreie7n4loanq3vbji47ijr6xhsf47xsbf4fybrjwzkerwd2aonnr6xq',
    },
    {
        address: '0x9BEc198c43B0714aEEd3c1bF21498ecBeFEB19F8' as const,
        symbol: 'KJFIN',
        name: 'KJFIN',
        decimals: 18,
        chainId: bitkub.id,
        logo: 'https://cmswap.mypinata.cloud/ipfs/bafkreicsaxloa43u6xq2pscenskkmqwyb2w5gwauik735opgoc2qzpmob4',
    },
    {
        address: '0xF27DF35ead39E2aed24cc05C52db303Ef4C4aA83' as const,
        symbol: 'SHK',
        name: 'SHK',
        decimals: 18,
        chainId: bitkub.id,
        logo: 'https://cmswap.mypinata.cloud/ipfs/bafybeictpc76cigf42dly6c3qtnbu5cbtons4qvsqr4juxcs7g7k4nbche',
    },
]

export const WORLDCHAIN_TOKENS: Token[] = [
    {
        address: '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee' as const,
        symbol: 'ETH',
        name: 'ETH',
        decimals: 18,
        chainId: worldchain.id,
        logo: 'https://raw.githubusercontent.com/SmolDapp/tokenAssets/refs/heads/main/tokens/8453/0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee/logo-32.png',
    },
    {
        address: '0x4200000000000000000000000000000000000006' as const,
        symbol: 'WETH',
        name: 'Wrapped ETH',
        decimals: 18,
        chainId: worldchain.id,
        logo: 'https://coin-images.coingecko.com/coins/images/39810/large/weth.png?1724139790',
    },
    {
        address: '0x79A02482A880bCE3F13e09Da970dC34db4CD24d1' as const,
        symbol: 'USDC',
        name: 'USDC',
        decimals: 6,
        chainId: worldchain.id,
        logo: 'https://coin-images.coingecko.com/coins/images/6319/large/usdc.png?1696506694',
    },
    {
        address: '0x2cFc85d8E48F8EAB294be644d9E25C3030863003' as const,
        symbol: 'WLD',
        name: 'WLD',
        decimals: 18,
        chainId: worldchain.id,
        logo: 'https://coin-images.coingecko.com/coins/images/31069/large/worldcoin.jpeg?1696529903',
    },
    {
        address: '0x03C7054BCB39f7b2e5B2c7AcB37583e32D70Cfa3' as const,
        symbol: 'WBTC',
        name: 'Wrapped BTC',
        decimals: 8,
        chainId: worldchain.id,
        logo: 'https://coin-images.coingecko.com/coins/images/51159/large/wbtc_28.png?1730242311',
    },
    {
        address: '0x9B8Df6E244526ab5F6e6400d331DB28C8fdDdb55' as const,
        symbol: 'uSOL',
        name: 'uSOL',
        decimals: 18,
        chainId: worldchain.id,
        logo: 'https://coin-images.coingecko.com/coins/images/39987/large/UA-SOL_1.png?1725027946',
    },
    {
        address: '0xab09A728E53d3d6BC438BE95eeD46Da0Bbe7FB38' as const,
        symbol: 'SUSHI',
        name: 'SUSHI',
        decimals: 18,
        chainId: worldchain.id,
        logo: 'https://dd.dexscreener.com/ds-data/tokens/worldchain/0xab09a728e53d3d6bc438be95eed46da0bbe7fb38.png?size=lg&key=574fa0',
    },
    {
        address: '0xcd1E32B86953D79a6AC58e813D2EA7a1790cAb63' as const,
        symbol: 'ORO',
        name: 'ORO',
        decimals: 18,
        chainId: worldchain.id,
        logo: 'https://coin-images.coingecko.com/coins/images/70441/large/oro.png?1762076294',
    },
]

export const BASE_TOKENS: Token[] = [
    {
        address: '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee' as const,
        symbol: 'ETH',
        name: 'ETH',
        decimals: 18,
        chainId: base.id,
        logo: 'https://raw.githubusercontent.com/SmolDapp/tokenAssets/refs/heads/main/tokens/8453/0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee/logo-32.png',
    },
    {
        address: '0x4200000000000000000000000000000000000006' as const,
        symbol: 'WETH',
        name: 'Wrapped ETH',
        decimals: 18,
        chainId: base.id,
        logo: 'https://coin-images.coingecko.com/coins/images/39810/large/weth.png?1724139790',
    },
    {
        address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' as const,
        symbol: 'USDC',
        name: 'USDC',
        decimals: 6,
        chainId: base.id,
        logo: 'https://coin-images.coingecko.com/coins/images/6319/large/usdc.png?1696506694',
    },
    {
        address: '0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf' as const,
        symbol: 'cbBTC',
        name: 'cbBTC',
        decimals: 8,
        chainId: base.id,
        logo: 'https://coin-images.coingecko.com/coins/images/40143/large/cbbtc.webp?1726136727',
    },
    {
        address: '0x940181a94A35A4569E4529A3CDfB74e38FD98631' as const,
        symbol: 'AERO',
        name: 'AERO',
        decimals: 18,
        chainId: base.id,
        logo: 'https://coin-images.coingecko.com/coins/images/31745/large/token.png?1696530564',
    },
    {
        address: '0x0b3e328455c4059EEb9e3f84b5543F74E24e7E1b' as const,
        symbol: 'VIRTUAL',
        name: 'VIRTUAL',
        decimals: 18,
        chainId: base.id,
        logo: 'https://coin-images.coingecko.com/coins/images/34057/large/LOGOMARK.png?1708356054',
    },
    {
        address: '0x1111111111166b7FE7bd91427724B487980aFc69' as const,
        symbol: 'ZORA',
        name: 'ZORA',
        decimals: 18,
        chainId: base.id,
        logo: 'https://coin-images.coingecko.com/coins/images/54693/large/zora.jpg?1741094751',
    },
    {
        address: '0x696F9436B67233384889472Cd7cD58A6fB5DF4f1' as const,
        symbol: 'AVNT',
        name: 'AVNT',
        decimals: 18,
        chainId: base.id,
        logo: 'https://coin-images.coingecko.com/coins/images/68972/large/avnt-token.png?1757134448',
    },
    {
        address: '0x1bc0c42215582d5A085795f4baDbaC3ff36d1Bcb' as const,
        symbol: 'CLANKER',
        name: 'CLANKER',
        decimals: 18,
        chainId: base.id,
        logo: 'https://coin-images.coingecko.com/coins/images/51440/large/CLANKER.png?1731232869',
    },
]

export const BSC_TOKENS: Token[] = [
    {
        address: '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee' as const,
        symbol: 'BNB',
        name: 'BNB',
        decimals: 18,
        chainId: bsc.id,
        logo: 'https://raw.githubusercontent.com/SmolDapp/tokenAssets/refs/heads/main/tokens/56/0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee/logo-32.png',
    },
    {
        address: '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c' as const,
        symbol: 'WBNB',
        name: 'Wrapped BNB',
        decimals: 18,
        chainId: bsc.id,
        logo: 'https://cmswap.mypinata.cloud/ipfs/bafkreihej2whwsw4p57ayfqxhwijnpmgxtnwhngh5f5pxpvxw73s636hzy',
    },
    {
        address: '0x55d398326f99059fF775485246999027B3197955' as const,
        symbol: 'USDT',
        name: 'USDT',
        decimals: 18,
        chainId: bsc.id,
        logo: 'https://cmswap.mypinata.cloud/ipfs/bafkreieg7yf6iwx7obygg62hz252bwnaddedanvlizonaawagk7eze4qcu',
    },
    {
        address: '0x7130d2A12B9BCbFAe4f2634d864A1Ee1Ce3Ead9c' as const,
        symbol: 'BTCB',
        name: 'Bitcoin BEP2',
        decimals: 18,
        chainId: bsc.id,
        logo: 'https://cmswap.mypinata.cloud/ipfs/bafkreibdegct4vlxyb7k2vsyt6dn3ulo2xslegjkttvge73244rvshxiju',
    },
]

/**
 * Token list by chain ID
 */
export const TOKEN_LISTS: Record<number, Token[]> = {
    [kubTestnet.id]: KUB_TESTNET_TOKENS,
    [bitkub.id]: KUB_MAINNET_TOKENS,
    [jbc.id]: JB_CHAIN_TOKENS,
    [worldchain.id]: WORLDCHAIN_TOKENS,
    [base.id]: BASE_TOKENS,
    [bsc.id]: BSC_TOKENS,
}

/**
 * Get tokens for a specific chain
 */
export function getTokensForChain(chainId: number): Token[] {
    return TOKEN_LISTS[chainId] || []
}

/**
 * Find token by address on a specific chain
 */
export function findTokenByAddress(chainId: number, address: string): Token | undefined {
    const tokens = TOKEN_LISTS[chainId] || []
    // Handle native token
    if (isNativeToken(address as Address)) {
        return tokens.find((t) => t.address === '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee')
    }
    return tokens.find((t) => t.address.toLowerCase() === address.toLowerCase())
}
