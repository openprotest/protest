using System.Threading;

namespace System.Collections.Generic;

/// <summary>
/// Thread-safe wrapper around the System.Collections.Generic.Dictionary class.
/// </summary>

public sealed class SynchronizedDictionary<TKey, TValue> : Dictionary<TKey, TValue> where TKey : notnull {

    private readonly Lock mutex = new Lock();
    public SynchronizedDictionary() { }
    public SynchronizedDictionary(IDictionary<TKey, TValue> dictionary) : base(dictionary) { }
    public SynchronizedDictionary(IEqualityComparer<TKey> comparer) : base(comparer) { }
    public SynchronizedDictionary(int capacity) : base(capacity) { }
    public SynchronizedDictionary(IDictionary<TKey, TValue> dictionary, IEqualityComparer<TKey> comparer) : base(dictionary, comparer) { }
    public SynchronizedDictionary(int capacity, IEqualityComparer<TKey> comparer) : base(capacity, comparer) { }

    public new TValue this[TKey key] {
        get {
            lock (mutex) {
                return base[key];
            }
        }
        set {
            lock (mutex) {
                base[key] = value;
            }
        }
    }

    public void Add(KeyValuePair<TKey, TValue> pair) {
        lock (mutex) {
            base.Add(pair.Key, pair.Value);
        }
    }

    public new void Add(TKey key, TValue value) {
        lock (mutex) {
            base.Add(key, value);
        }
    }

    public new void Clear() {
        lock (mutex) {
            base.Clear();
        }
    }

    public new bool ContainsKey(TKey key) {
        lock (mutex) {
            return base.ContainsKey(key);
        }
    }

    public new bool Remove(TKey key) {
        lock (mutex) {
            return base.Remove(key);
        }
    }

    public new bool TryAdd(TKey key, TValue value) {
        lock (mutex) {
            return base.TryAdd(key, value);
        }
    }

    public new bool TryGetValue(TKey key, out TValue value) {
        lock (mutex) {
            return base.TryGetValue(key, out value);
        }
    }

}
