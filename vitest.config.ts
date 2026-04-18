import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
    resolve: {
        alias: {
            '@': path.resolve(__dirname, '.'),
        },
    },
    test: {
        environment: 'node',
        include: [
            'lib/__tests__/**/*.test.ts',
            'services/__tests__/**/*.test.ts',
            'services/**/__tests__/**/*.test.ts',
            'store/__tests__/**/*.test.ts',
            'hooks/__tests__/**/*.test.ts',
        ],
        globals: true,
        setupFiles: ['./store/__tests__/setup.ts'],
        coverage: {
            provider: 'v8',
            include: ['lib/**/*.ts', 'services/**/*.ts', 'store/**/*.ts', 'hooks/**/*.ts'],
            exclude: ['**/__tests__/**', '**/types/**', '**/abis/**'],
        },
    },
})
