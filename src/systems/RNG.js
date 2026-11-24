/**
 * Small deterministic PRNG utilities.
 * xmur3 turns a string into a 32-bit seed; mulberry32 produces a fast,
 * well-distributed sequence from it. Daily challenges rely on this.
 */

export function xmur3(str) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return function seed() {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return h >>> 0;
  };
}

export function mulberry32(a) {
  return function random() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class RNG {
  constructor(seed) {
    this.seedValue = typeof seed === 'string' ? xmur3(seed)() : (seed >>> 0);
    this._random = mulberry32(this.seedValue);
  }

  next() {
    return this._random();
  }

  float(min = 0, max = 1) {
    return min + this._random() * (max - min);
  }

  int(min, max) {
    return Math.floor(this.float(min, max + 1));
  }

  chance(p) {
    return this._random() < p;
  }

  pick(list) {
    return list[Math.floor(this._random() * list.length)];
  }

  shuffle(list) {
    const arr = list.slice();
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(this._random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  weighted(entries) {
    const total = entries.reduce((sum, e) => sum + e.weight, 0);
    let roll = this._random() * total;
    for (const entry of entries) {
      roll -= entry.weight;
      if (roll <= 0) return entry.value;
    }
    return entries[entries.length - 1].value;
  }
}

export function randomSeed() {
  const cryptoObj = globalThis.crypto;
  if (cryptoObj?.getRandomValues) {
    const arr = new Uint32Array(1);
    cryptoObj.getRandomValues(arr);
    return arr[0];
  }
  return (Math.random() * 0xffffffff) >>> 0;
}
