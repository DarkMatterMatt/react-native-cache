import BackendInterface from "./BackendInterface";
import byteLength from "./helpers";

export interface ICacheOptions {
    // backend is expected to have the same static interface as AsyncStorage
    backend: BackendInterface;
    namespace: string;
    policy: ICachePolicy;
}

export interface ICachePolicy {
    maxEntries?: number;
    maxSize?: number;
}

// LRU contains [[key1, size1], [key2, size2]]
type LRU = [string, number][];

interface Metadata {
    lru: LRU;
    size: number;
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
     * Calculate size in bytes of string(s)
     */
    protected static calculateSize(...strings: string[]) {
        // sum the number of bytes of the input strings
        return strings.reduce((a, b) => a + byteLength(b), 0);
    }

    /**
     * Fetches all keys in cache
     */
    public async getAllKeys() {
        const keys = await this.backend.getAllKeys();
        return keys
            .filter(k => k.startsWith(this.namespace) && k !== this.getMetadataKey())
            .map(k => this.fromCompositeKey(k));
    }

    /**
     * Sets value for key
     */
    public async setItem(key: string, value: string): Promise<void> {
        const compositeKey = this.makeCompositeKey(key);
        if (compositeKey === this.getMetadataKey()) {
            throw new Error("Illegal key. '" + key + "' is reserved for internal cache use.");
        }

        const size = Cache.calculateSize(compositeKey, value);

        if (this.policy.maxSize && size > this.policy.maxSize) {
            // we can't fit this in the cache
            return;
        }

        const metadataAndSize = await this.getMetadataAndSize();
        const [metadata] = metadataAndSize;
        let [, metadataSize] = metadataAndSize;

        await this.addToMetadata(metadata, [key, size]);
        metadataSize += Cache.calculateSize(JSON.stringify([key, size])) + 2; // +1 for the comma, +1 for an additional size digit

        await this.enforceLimits(metadata, metadataSize);
        await this.setMetadata(metadata);

        // sometimes we can't fit it in the cache, enforceLimits deletes everything
        if (metadata.lru.length > 0) {
            await this.backend.setItem(compositeKey, value);
        }
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

        if (value !== null) {
            const metadata = await this.getMetadata();
            if (await this.refreshLRU(metadata, key)) {
                await this.setMetadata(metadata);
            }
        }

        return value;
    }

    /**
     * @deprecated Use getItem instead
     */
    public async get(key: string): Promise<string | undefined> {
        return await this.getItem(key) ?? undefined;
    }

    /**
     * Removes key from the cache
     */
    public async removeItem(key: string): Promise<void> {
        const metadata = await this.getMetadata();
        if (await this.removeFromMetadata(metadata, key)) {
            await this.setMetadata(metadata);
        }

        const compositeKey = this.makeCompositeKey(key);
        await this.backend.removeItem(compositeKey);
    }

    /**
     * @deprecated Use removeItem instead
     */
    public remove = this.removeItem

    /**
     * Fetches values for keys
     * @returns An array of [key, value] pairs in the form: [['k1', 'val1'], ['k2', 'val2']]
     */
    public async multiGet(keys: string[]): Promise<[string, string | null][]> {
        const metadata = await this.getMetadata();
        if (await this.refreshLRU(metadata, ...keys)) {
            await this.setMetadata(metadata);
        }

        const compositeKeys = keys.map(k => this.makeCompositeKey(k));
        const results = await this.backend.multiGet(compositeKeys);
        return results.map(([k, v], i) => [keys[i], v]);
    }

    /**
     * Delete all the keys in the keys array
     * @returns An array of [key, value] pairs in the form: [['k1', 'val1'], ['k2', 'val2']]
     */
    public async multiRemove(keys: string[]) {
        const metadata = await this.getMetadata();
        if (await this.removeFromMetadata(metadata, ...keys)) {
            await this.setMetadata(metadata);
        }

        const compositeKeys = keys.map(k => this.makeCompositeKey(k));
        await this.backend.multiRemove(compositeKeys);
    }

    /**
     * Delete all the keys in the cache
     */
    public async clearAll() {
        const keys = await this.getAllKeys();
        const results = await this.multiRemove(keys);
    }

    /**
     * Fetch all the keys in the cache
     */
    public async getAll() {
        const keys = await this.getAllKeys();
        const results = await this.multiGet(keys);
        return results;
    }

    /**
     * Fetches value for key without updating position in LRU list
     */
    public async peek(key: string) {
        const compositeKey = this.makeCompositeKey(key);
        const value = await this.backend.getItem(compositeKey);
        return value;
    }

    /**
     * Fetches current size of cache
     */
    public async getSize() {
        const [metadata, metadataSize] = await this.getMetadataAndSize();
        return metadata.size + metadataSize;
    }

    /**
     * Combine key and cache namespace
     */
    protected makeCompositeKey(key: string) {
        return `${this.namespace}:${key}`;
    }

    /**
     * Strip cache namespace from key
     */
    protected fromCompositeKey(compositeKey: string) {
        return compositeKey.slice(this.namespace.length + 1);
    }

    /**
     * Returns key for internal metadata
     */
    protected getMetadataKey() {
        return this.makeCompositeKey("_metadata");
    }

    /**
     * Enforce cache policy by evicting items
     * @returns number of items evicted 
     */
    protected async enforceLimits(metadata: Metadata, metadataSize: number) {
        if (!this.policy.maxEntries && !this.policy.maxSize) {
            return 0;
        }

        const victimKeys: string[] = [];

        if (this.policy.maxEntries) {
            const victimCount = metadata.lru.length - this.policy.maxEntries;
            if (victimCount > 0) {
                const victims = metadata.lru.splice(0, victimCount);
                for (const [vKey, vSize] of victims) {
                    victimKeys.push(vKey);
                    metadata.size -= vSize;
                }
            }
        }

        if (this.policy.maxSize) {
            while (metadata.size + metadataSize > this.policy.maxSize && metadata.lru.length > 0) {
                const [[vKey, vSize]] = metadata.lru.splice(0, 1);
                victimKeys.push(vKey);
                metadata.size -= vSize;
                metadataSize -= Cache.calculateSize(JSON.stringify([vKey, vSize])) + 1; // +1 for the comma
            }
        }

        if (victimKeys.length > 0) {
            await this.backend.multiRemove(victimKeys.map(k => this.makeCompositeKey(k)));
        }
        return victimKeys.length;
    }

    /**
     * Fetch cache metadata and current size
     */
    protected async getMetadataAndSize(): Promise<[Metadata, number]> {
        const metadataKey = this.getMetadataKey();
        let metadataStr = await this.backend.getItem(metadataKey);
        if (metadataStr === null) {
            metadataStr = '{"lru":[],"size":0}';
        }
        return [JSON.parse(metadataStr) as Metadata, Cache.calculateSize(metadataKey, metadataStr)];
    }

    /**
     * Fetch cache metadata
     */
    protected async getMetadata() {
        const metadataStr = await this.backend.getItem(this.getMetadataKey());
        if (metadataStr === null) {
            return {
                lru: [],
                size: 0,
            };
        }
        return JSON.parse(metadataStr) as Metadata;
    }

    /**
     * Store cache metadata
     */
    protected async setMetadata(metadata: Metadata) {
        await this.backend.setItem(this.getMetadataKey(), JSON.stringify(metadata));
    }

    /**
     * Add key(s) to cache metadata/LRU
     */
    protected async addToMetadata(metadata: Metadata, ...entries: [string, number][]) {
        for (const [key, size] of entries) {
            // fetch and remove existing elem from LRU
            const idx = metadata.lru.findIndex(([k, s]) => k === key);
            if (idx !== -1) {
                const [[k, s]] = metadata.lru.splice(idx, 1);
                metadata.size -= s;
            }

            metadata.size += size;
            metadata.lru.push([key, size]);
        }
    }

    /**
     * Move key(s) to end of LRU
     * @returns number of keys refreshed 
     */
    protected async refreshLRU(metadata: Metadata, ...keys: string[]) {
        let keysRefreshed = 0;

        for (const key of keys) {
            // find index in LRU, get elem and remove from LRU, then add elem to the end
            const idx = metadata.lru.findIndex(([k, s]) => k === key);
            if (idx !== -1) {
                const [elem] = metadata.lru.splice(idx, 1);
                metadata.lru.push(elem);
                keysRefreshed++;
            }
        }
        return keysRefreshed;
    }

    /**
     * Remove key(s) from cache metadata/LRU
     * @returns number of keys removed 
     */
    protected async removeFromMetadata(metadata: Metadata, ...keys: string[]) {
        let keysRemoved = 0;

        for (const key of keys) {
            // find index in LRU, get [key, size] and remove from LRU
            const idx = metadata.lru.findIndex(([k, s]) => k === key);
            if (idx !== -1) {
                const [[k, s]] = metadata.lru.splice(idx, 1);
                metadata.size -= s;
                keysRemoved++;
            }
        }
        return keysRemoved;
    }
}
