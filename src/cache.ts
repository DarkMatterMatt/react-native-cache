import BackendInterface from "./BackendInterface";

export interface ICacheOptions {
    // backend is expected to have the same static interface as AsyncStorage
    backend: BackendInterface;
    namespace: string;
    policy: ICachePolicy;
}

export interface ICachePolicy {
    maxEntries: number;
}

export default class Cache implements BackendInterface {
    protected backend: BackendInterface;
    protected namespace: string;
    protected policy: ICachePolicy;

    constructor(options: ICacheOptions) {
        this.namespace = options.namespace;
        this.backend = options.backend;
        this.policy = options.policy;
    }

    /**
     * Fetches all keys in cache
     */
    public async getAllKeys() {
        const keys = await this.backend.getAllKeys();
        return keys
            .filter(k => k.startsWith(this.namespace) && k !== this.getLRUKey())
            .map(k => this.fromCompositeKey(k));
    }

    /**
     * Sets value for key
     */
    public async setItem(key: string, value: string): Promise<void> {
        const compositeKey = this.makeCompositeKey(key);
        await this.backend.setItem(compositeKey, value);
        await this.refreshLRU(key);
        return this.enforceLimits();
    }

    /**
     * @deprecated Use setItem instead
     */
    public set = this.setItem

    /**
     * Fetches value for key
     */
    public async getItem(key: string): Promise<string | null> {
        const value = await this.peek(key);

        if (!value) {
            return null;
        }

        this.refreshLRU(key);

        return value;
    }

    /**
     * @deprecated Use getItem instead
     */
    public async get(key: string): Promise<string | undefined> {
        return await this.getItem(key) || undefined;
    }

    /**
     * Removes key from the cache
     */
    public async removeItem(key: string): Promise<void> {
        const compositeKey = this.makeCompositeKey(key);
        await this.backend.removeItem(compositeKey);

        await this.removeFromLRU(key);
    }

    /**
     * @deprecated Use removeItem instead
     */
    public remove = this.removeItem

    /**
     * Fetches values for keys
     * @returns An array of [key, value] pairs in the form: [['k1', 'val1'], ['k2', 'val2']]
     */
    public async multiGet(keys: string[]): Promise<[string, string][]> {
        // TODO: optimize into one call
        keys.map(k => this.refreshLRU(k));

        const compositeKeys = keys.map(k => this.makeCompositeKey(k));
        const results = await this.backend.multiGet(compositeKeys);
        return results.map(([k, v]) => [this.fromCompositeKey(k), v]);
    }

    /**
     * Delete all the keys in the keys array.
     * @returns An array of [key, value] pairs in the form: [['k1', 'val1'], ['k2', 'val2']]
     */
    public async multiRemove(keys: string[]) {
        // TODO: optimize into one call
        keys.map(k => this.removeFromLRU(k));

        const compositeKeys = keys.map(k => this.makeCompositeKey(k));
        await this.backend.multiRemove(compositeKeys);
    }

    public async clearAll() {
        const keys = await this.backend.getAllKeys();
        const namespaceKeys = keys.filter((key: string) => {
            return key.substr(0, this.namespace.length) === this.namespace;
        });

        await this.backend.multiRemove(namespaceKeys);

        return this.setLRU([]);
    }

    public async enforceLimits(): Promise<void> {
        if (!this.policy.maxEntries) {
            return;
        }

        const lru = await this.getLRU();
        const victimCount = Math.max(0, lru.length - this.policy.maxEntries);
        const victimList = lru.slice(0, victimCount);

        const removePromises = [];
        for (const victimKey of victimList) {
            removePromises.push(this.remove(victimKey));
        }

        await Promise.all(removePromises);

        const survivorList = lru.slice(victimCount);
        return this.setLRU(survivorList);
    }

    public async getAll() {
        const keys = await this.getAllKeys();
        const results = await this.multiGet(keys);
        return results;
    }

    public async peek(key: string) {
        const compositeKey = this.makeCompositeKey(key);
        const value = await this.backend.getItem(compositeKey);
        return value;
    }

    protected async addToLRU(key: string) {
        const lru = await this.getLRU();

        lru.push(key);

        return this.setLRU(lru);
    }

    protected async getLRU() {
        const lruString = await this.backend.getItem(this.getLRUKey());
        let lru: string[];

        if (!lruString) {
            lru = [];
        } else {
            lru = JSON.parse(lruString);
        }

        return lru;
    }

    protected getLRUKey() {
        return this.makeCompositeKey("_lru");
    }

    protected makeCompositeKey(key: string) {
        return `${this.namespace}:${key}`;
    }

    protected fromCompositeKey(compositeKey: string) {
        return compositeKey.slice(this.namespace.length + 1);
    }

    protected async refreshLRU(key: string) {
        await this.removeFromLRU(key);
        return this.addToLRU(key);
    }

    protected async removeFromLRU(key: string) {
        const lru = await this.getLRU();

        const newLRU = lru.filter((item: string) => {
            return item !== key;
        });

        return this.setLRU(newLRU);
    }

    protected async setLRU(lru: string[]) {
        return this.backend.setItem(this.getLRUKey(), JSON.stringify(lru));
    }
}
