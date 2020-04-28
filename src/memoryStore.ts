import BackendInterface from "./BackendInterface";

const memoryStore: Record<string, string> = {};

const MemoryStore: BackendInterface = {
    setItem: async (key: string, value: string): Promise<void> => {
        memoryStore[key] = value;
    },

    getAllKeys: async (): Promise<string[]> => {
        return Object.keys(memoryStore);
    },

    getItem: async (key: string): Promise<string | null> => {
        return memoryStore[key] ?? null;
    },

    multiGet: async (keys: string[]): Promise<[string, string][]> => {
        const results: [string, string][] = [];
        for (const key of keys) {
            results.push([key, memoryStore[key] ?? null]);
        }

        return results;
    },

    multiRemove: async (keys: string[]): Promise<void> => {
        for (const key of keys) {
            delete memoryStore[key];
        }
    },

    removeItem: async (key: string): Promise<void> => {
        delete memoryStore[key];
    },

    // @ts-ignore: used for testing size of memoryStore
    _getUnderlyingObject: () => memoryStore,
};

export default MemoryStore;
