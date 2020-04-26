import BackendInterface from "./BackendInterface";

const memoryStore: Record<string, string> = {};

const MemoryStore: BackendInterface = {
    setItem: async (key: string, value: string): Promise<void> => {
        memoryStore[key] = value;
    },

    getAllKeys: async (): Promise<string[]> => {
        return Object.keys(memoryStore);
    },

    getItem: async (key: string): Promise<string> => {
        return memoryStore[key];
    },

    multiGet: async (keys: string[]): Promise<[string, string][]> => {
        const results: [string, string][] = [];
        for (const key of keys) {
            results.push([key, memoryStore[key]]);
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
    }
};

export default MemoryStore;
