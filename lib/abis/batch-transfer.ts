export const BATCH_TRANSFER_ABI = [
    // Batch Transfer (User)
    {
        type: 'function',
        name: 'batchTransferNative',
        stateMutability: 'payable',
        inputs: [
            { name: 'recipients', type: 'address[]' },
            { name: 'amounts', type: 'uint256[]' },
        ],
        outputs: [],
    },
    {
        type: 'function',
        name: 'batchTransferNativeEqual',
        stateMutability: 'payable',
        inputs: [
            { name: 'recipients', type: 'address[]' },
            { name: 'amount', type: 'uint256' },
        ],
        outputs: [],
    },
    {
        type: 'function',
        name: 'batchTransferERC20',
        stateMutability: 'payable',
        inputs: [
            { name: 'token', type: 'address' },
            { name: 'recipients', type: 'address[]' },
            { name: 'amounts', type: 'uint256[]' },
        ],
        outputs: [],
    },
    {
        type: 'function',
        name: 'batchTransferERC20Equal',
        stateMutability: 'payable',
        inputs: [
            { name: 'token', type: 'address' },
            { name: 'recipients', type: 'address[]' },
            { name: 'amount', type: 'uint256' },
        ],
        outputs: [],
    },
    // Fee Config
    {
        type: 'function',
        name: 'feeConfig',
        stateMutability: 'view',
        inputs: [],
        outputs: [
            { name: 'feeType', type: 'uint8' },
            { name: 'feeToken', type: 'address' },
            { name: 'feeAmount', type: 'uint256' },
        ],
    },
    // ERC20 Approve (for fee token)
    {
        type: 'function',
        name: 'approve',
        stateMutability: 'nonpayable',
        inputs: [
            { name: 'spender', type: 'address' },
            { name: 'amount', type: 'uint256' },
        ],
        outputs: [{ name: '', type: 'bool' }],
    },
    // Events
    {
        type: 'event',
        name: 'BatchNativeTransfer',
        inputs: [
            { name: 'sender', type: 'address', indexed: true },
            { name: 'recipientCount', type: 'uint256', indexed: false },
            { name: 'totalAmount', type: 'uint256', indexed: false },
        ],
    },
    {
        type: 'event',
        name: 'BatchERC20Transfer',
        inputs: [
            { name: 'sender', type: 'address', indexed: true },
            { name: 'token', type: 'address', indexed: true },
            { name: 'recipientCount', type: 'uint256', indexed: false },
            { name: 'totalAmount', type: 'uint256', indexed: false },
        ],
    },
    {
        type: 'event',
        name: 'FeeCollected',
        inputs: [
            { name: 'payer', type: 'address', indexed: true },
            { name: 'feeToken', type: 'address', indexed: false },
            { name: 'feeAmount', type: 'uint256', indexed: false },
        ],
    },
] as const
