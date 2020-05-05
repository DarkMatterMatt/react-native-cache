# react-native-cache

LRU cache built on top of the [React Native communities' AsyncStorage v2](https://github.com/react-native-community/async-storage/tree/master) (or included MemoryStore) and automatic pruning of least recently used items.

This is a fork of Tim Park's [react-native-cache](https://github.com/timfpark/react-native-cache). Compared to the original, this fork features:

* Ability to limit cache to size in bytes

## Installation

Install using npm:

```shell
npm install --save darkmattermatt/react-native-cache#v3.0.0
```

Or, using yarn:

```shell
yarn add https://github.com/darkmattermatt/react-native-cache#v3.0.0
```

Import the library:

```javascript
import { Cache } from "react-native-cache";
```

## Usage

Initialize a cache using the following:

```javascript
const cache = new Cache({
    namespace: "myapp",
    policy: {
        maxEntries: 50000,       // all policies are optional
        maxSize: 5 * 1024 * 1024 // 5MB max cache size
    },
    backend: AsyncStorage
});
```

Multiple caches can be mantained in an application by instantiating caches with different namespaces.

### Setting a key's value in the cache

```javascript
await cache.set("hello", "world");
// key 'hello' is now set to 'world' in namespace 'myapp'
```

### Get an item in the cache

```javascript
const value = await cache.get("key1");
console.log(value);
// 'hello'
});
```

Getting an item from the cache also moves it to the end of the LRU list: it will be evicted from the cache last.

### Delete an item from the cache

```javascript
await cache.remove("key1");
// 'key1' is no more.
```

### Peeking at an item in the cache

You can also peek at an item in the cache without updating its position in the LRU list:

```javascript
const value = await cache.peek("key1");
// value is retrieved but LRU value is unchanged.
```

### Getting all of the elements in the cache

You can look at all of the elements in the cache without updating its position in the LRU list:

```javascript
const entries = await cache.getAll();
console.dir(entries);
// [
//    ["key1", "42"],
//    ["key2", "val2"],
// ]
```

### Clearing all of the elements in the cache

You can also clear all of the items in the cache with:

```javascript
await cache.clearAll();
```

For more usage examples, see the tests.
