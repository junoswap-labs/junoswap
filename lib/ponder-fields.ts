export interface LaunchTokenEntity {
    tokenAddr: string
    chainId: number
    creator: string
    name: string | null
    symbol: string | null
    logo: string | null
    description: string | null
    link1: string | null
    link2: string | null
    link3: string | null
    createdTime: number
    isGraduated: number | null
    graduatedAt: number | null
    createdAtBlock: number
}

export const LAUNCH_TOKEN_DETAIL_FIELDS = [
    'tokenAddr',
    'creator',
    'name',
    'symbol',
    'logo',
    'description',
    'link1',
    'link2',
    'link3',
    'createdTime',
    'isGraduated',
    'graduatedAt',
] as const satisfies readonly (keyof LaunchTokenEntity)[]

export const LAUNCH_TOKEN_META_FIELDS = [
    'tokenAddr',
    'name',
    'symbol',
    'logo',
] as const satisfies readonly (keyof LaunchTokenEntity)[]
