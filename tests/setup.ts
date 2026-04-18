// Polyfill localStorage for Zustand persist middleware in Node environment
// Bun provides a partial localStorage polyfill that may not have all methods

const store: Record<string, string> = {}
const localStorageMock = {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => {
        store[key] = value
    },
    removeItem: (key: string) => {
        delete store[key]
    },
    clear: () => {
        for (const key of Object.keys(store)) delete store[key]
    },
    get length() {
        return Object.keys(store).length
    },
    key: (_index: number) => null,
}

// Override any existing localStorage with a fully functional one
globalThis.localStorage = localStorageMock as Storage
