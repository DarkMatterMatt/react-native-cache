import Cache from "../src/cache";
import MemoryStore from "../src/memoryStore";
import byteLength from "./helpers";

function calculateSizeOfMemoryStore(namespace = "") {
    // @ts-ignore: it really should exist on MemoryStore, it's only used for testing
    const obj = MemoryStore._getUnderlyingObject() as Record<string, string>;
    let size = 0;
    for (const [k, v] of Object.entries(obj)) {
        if (k.startsWith(namespace)) {
            size += byteLength(k) + byteLength(v);
        }
    }
    return size;
}

const testEntries = [
    ["12 normal123", "12 321Launch"],
    ["51 渣打銀行提供一系列迎合你生活需要", "51 一系列迎合你生活需要渣打銀行提a"],
    ["27 symbols !@#$%^&*()_\t\"'<>", "27 testing !@#$%^&*()_\t\"'<>"],
    ["", "a"],
    ["140 bytes - 😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀aa", "116 bytes - 😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀aa"],
];
const largeTestEntry = ["116 bytes - 😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀aa", "91 bytes - 😀😀😀😀😀aa😀😀😀😀😀😀😀😀"];

describe("cache", () => {
    describe("no policy", () => {
        const cache = new Cache({
            namespace: "noPolicy",
            policy: {},
            backend: MemoryStore,
        });

        it("starts empty", async () => {
            const entries = await cache.getAll();
            expect(entries.length).toBe(0);
        });

        it("can set and get entry", async () => {
            await cache.clearAll();

            for (const [k, v] of testEntries) {
                await cache.set(k, v);
                const value = await cache.get(k);
                expect(value).toBe(v);
            }
        });

        it("can update existing entry", async () => {
            await cache.clearAll();

            const [[key1, value1], [key2, value2]] = testEntries;

            await cache.set(key1, value1);
            await cache.set(key1, value2);

            const result = await cache.get(key1);
            expect(result).toBe(value2);
        });

        it("can set and get multiple items", async () => {
            await cache.clearAll();

            for (const [k, v] of testEntries) {
                await cache.set(k, v);
            }
            for (const [k, v] of testEntries) {
                const value = await cache.get(k);
                expect(value).toBe(v);
            }
        });

        it("can peek at a item", async () => {
            await cache.clearAll();

            for (const [k, v] of testEntries) {
                await cache.set(k, v);
                const value = await cache.peek(k);
                expect(value).toBe(v);
            }
        });

        it("can get a nonexistant item", async () => {
            await cache.clearAll();

            const value = await cache.get("doesnotexist");
            expect(value).toBeUndefined();
        });

        it("can delete entry", async () => {
            await cache.clearAll();

            for (const [k, v] of testEntries) {
                await cache.set(k, v);
                await cache.remove(k);
                const value = await cache.get(k);
                expect(value).toBeUndefined();
            }
        });

        it("can get all elements", async () => {
            await cache.clearAll();

            for (const [k, v] of testEntries) {
                await cache.set(k, v);
            }
            const entries = await cache.getAll();
            expect(entries.length).toBe(testEntries.length);

            for (const [k, v] of testEntries) {
                const entry = entries.find(e => e[0] === k);
                expect(entry).not.toBeUndefined();
                if (entry !== undefined) {
                    expect(entry[1]).toBe(v);
                }
            }
        });

        it("can remove multiple items", async () => {
            await cache.clearAll();

            for (const [k, v] of testEntries) {
                await cache.set(k, v);
            }

            const toKeep = testEntries.map(([k, v]) => k);
            const toRemove = toKeep.splice(0, Math.ceil(testEntries.length / 3));

            await cache.multiRemove(toRemove);
            const entries = await cache.getAll();
            expect(entries.length).toBe(toKeep.length);
        });

        it("can clear all elements", async () => {
            await cache.clearAll();

            for (const [k, v] of testEntries) {
                await cache.set(k, v);
            }

            const entries = await cache.getAll();
            expect(entries.length).toBe(testEntries.length);

            await cache.clearAll();
            const empty = await cache.getAll();
            expect(empty.length).toBe(0);
        });
    });

    describe("max entry policy", () => {
        const cache = new Cache({
            namespace: "entry",
            policy: {
                maxEntries: 1,
            },
            backend: MemoryStore,
        });

        it("evicts entries in lastAccessed order", async () => {
            await cache.clearAll();

            const [[key1, value1], [key2, value2]] = testEntries;

            await cache.set(key1, value1);
            await cache.set(key2, value2);

            const result1 = await cache.get(key1);
            expect(result1).toBeUndefined();

            const result2 = await cache.get(key2);
            expect(result2).toBe(value2);
        });
    });

    describe("max size policy", () => {
        const namespace = "size";
        const maxSize = 128;
        const cache = new Cache({
            namespace,
            policy: {
                maxSize,
            },
            backend: MemoryStore,
        });

        it("correctly stores size", async () => {
            await cache.clearAll();

            for (const [k, v] of testEntries) {
                await cache.set(k, v);
                const cacheSize = await cache.getSize();
                const calculatedSize = calculateSizeOfMemoryStore(namespace);

                expect(cacheSize).toBe(calculatedSize);
                await cache.remove(k);
            }
        });

        it("refuses to store huge items", async () => {
            await cache.clearAll();

            const [k, v] = largeTestEntry;
            if (byteLength(k) + byteLength(v) < maxSize) {
                throw new Error("Testing requires that largeTestEntry is larger than the maximum cache size");
            }

            await cache.set(k, v);
            const result = await cache.get(k);
            expect(result).toBeUndefined();
        });

        it("is never larger than max size", async () => {
            await cache.clearAll();

            for (const [k, v] of testEntries) {
                await cache.set(k, v);
                const cacheSize = await cache.getSize();
                const calculatedSize = calculateSizeOfMemoryStore(namespace);

                expect(cacheSize).toBeLessThanOrEqual(maxSize);
                expect(calculatedSize).toBeLessThanOrEqual(maxSize);
            }
        });
    });
});
