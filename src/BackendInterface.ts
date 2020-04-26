export default interface BackendInterface {
    getAllKeys: () => Promise<string[]>;
    setItem: (key: string, value: string) => Promise<void>;
    getItem: (key: string) => Promise<string | null>;
    removeItem: (key: string) => Promise<void>
    multiGet: (keys: string[]) => Promise<[string, string][]>;
    multiRemove: (keys: string[]) => Promise<void>;
}
