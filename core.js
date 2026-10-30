/* QR Beam core: Base45 packing + LT fountain codes. Works in browser and Node. */
(function (G) {
  "use strict";

  // ---------- Base45 (RFC 9285) — maps exactly onto QR alphanumeric mode ----------
  const B45 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:";
  const B45MAP = new Int16Array(128).fill(-1);
  for (let i = 0; i < 45; i++) B45MAP[B45.charCodeAt(i)] = i;

  function b45enc(u8) {
    const out = [];
    let i = 0;
    for (; i + 1 < u8.length; i += 2) {
      let n = u8[i] * 256 + u8[i + 1];
      const c = n % 45; n = (n / 45) | 0;
      const d = n % 45; const e = (n / 45) | 0;
      out.push(B45[c], B45[d], B45[e]);
    }
    if (i < u8.length) { const n = u8[i]; out.push(B45[n % 45], B45[(n / 45) | 0]); }
    return out.join("");
  }

  function b45dec(s) {
    const len = s.length;
    if (len % 3 === 1) return null;
    const out = new Uint8Array(Math.floor(len / 3) * 2 + (len % 3 === 2 ? 1 : 0));
    let o = 0, i = 0;
    const v = (k) => { const c = s.charCodeAt(k); return c < 128 ? B45MAP[c] : -1; };
    for (; i + 2 < len; i += 3) {
      const a = v(i), b = v(i + 1), c = v(i + 2);
      if (a < 0 || b < 0 || c < 0) return null;
      const n = a + b * 45 + c * 2025;
      if (n > 65535) return null;
      out[o++] = n >> 8; out[o++] = n & 255;
    }
    if (len - i === 2) {
      const a = v(i), b = v(i + 1);
      if (a < 0 || b < 0) return null;
      const n = a + b * 45;
      if (n > 255) return null;
      out[o++] = n;
    }
    return out;
  }

  // ---------- CRC32 ----------
  const CRC_T = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; CRC_T[n] = c >>> 0; }
  function crc32(u8) { let c = 0xffffffff; for (let i = 0; i < u8.length; i++) c = CRC_T[(c ^ u8[i]) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }

  // ---------- Seeded PRNG ----------
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // ---------- Robust soliton degree distribution ----------
  const cdfCache = new Map();
  function solitonCDF(K, c = 0.1, delta = 0.5) {
    if (cdfCache.has(K)) return cdfCache.get(K);
    const w = new Float64Array(K + 1);
    if (K === 1) { w[1] = 1; }
    else {
      const R = Math.max(1, c * Math.log(K / delta) * Math.sqrt(K));
      w[1] = 1 / K;
      for (let d = 2; d <= K; d++) w[d] = 1 / (d * (d - 1));
      const pivot = Math.max(1, Math.min(K, Math.floor(K / R)));
      for (let d = 1; d < pivot; d++) w[d] += R / (d * K);
      w[pivot] += Math.max(0, (R * Math.log(R / delta)) / K);
    }
    let sum = 0; for (let d = 1; d <= K; d++) sum += w[d];
    const cdf = new Float64Array(K + 1); let acc = 0;
    for (let d = 1; d <= K; d++) { acc += w[d] / sum; cdf[d] = acc; }
    cdf[K] = 1;
    cdfCache.set(K, cdf);
    return cdf;
  }

  // Which source blocks a packet with this seed combines. Seeds < K are plain copies (systematic).
  function indicesFor(seed, K) {
    if (seed < K) return [seed];
    const rng = mulberry32(seed ^ 0x5bd1e995);
    const cdf = solitonCDF(K);
    const r = rng();
    let lo = 1, hi = K;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (cdf[mid] < r) lo = mid + 1; else hi = mid; }
    const d = lo;
    if (d >= K) { const all = []; for (let i = 0; i < K; i++) all.push(i); return all; }
    const set = new Set();
    while (set.size < d) set.add(Math.floor(rng() * K));
    return [...set];
  }

  function xorInto(dst, src) { for (let i = 0; i < dst.length; i++) dst[i] ^= src[i]; }

  const MAGIC = 0x51, VERSION = 1, HDR = 16;
  const enc = new TextEncoder(), dec = new TextDecoder();

  // ---------- Encoder ----------
  class Encoder {
    constructor(fileBytes, name, mime, blockSize) {
      const nameB = enc.encode(name || "file").slice(0, 400);
      const mimeB = enc.encode(mime || "application/octet-stream").slice(0, 200);
      const headLen = 2 + nameB.length + 2 + mimeB.length + 4;
      const total = headLen + fileBytes.length;
      this.blockSize = blockSize;
      this.K = Math.max(1, Math.ceil(total / blockSize));
      const stream = new Uint8Array(this.K * blockSize);
      const dv = new DataView(stream.buffer);
      let p = 0;
      dv.setUint16(p, nameB.length); p += 2; stream.set(nameB, p); p += nameB.length;
      dv.setUint16(p, mimeB.length); p += 2; stream.set(mimeB, p); p += mimeB.length;
      dv.setUint32(p, crc32(fileBytes)); p += 4;
      stream.set(fileBytes, p);
      this.total = total;
      this.stream = stream;
      this.fileId = (Math.random() * 4294967296) >>> 0;
    }
    block(i) { return this.stream.subarray(i * this.blockSize, (i + 1) * this.blockSize); }
    packet(seed) {
      const pkt = new Uint8Array(HDR + this.blockSize);
      const dv = new DataView(pkt.buffer);
      pkt[0] = MAGIC; pkt[1] = VERSION;
      dv.setUint32(2, this.fileId); dv.setUint32(6, this.total);
      dv.setUint16(10, this.blockSize); dv.setUint32(12, seed >>> 0);
      const body = pkt.subarray(HDR);
      for (const i of indicesFor(seed, this.K)) xorInto(body, this.block(i));
      return pkt;
    }
    frame(seed) { return b45enc(this.packet(seed)); }
  }

  // ---------- Peeling decoder ----------
  class Decoder {
    constructor() { this.reset(); }
    reset() {
      this.fileId = null; this.K = 0; this.known = null; this.solved = 0;
      this.seen = new Set(); this.byBlock = null; this.packets = 0; this.result = null;
    }
    // Returns: "invalid" | "dup" | "new" | "progress" | "done" | "newfile"
    addFrame(text) {
      const pkt = b45dec(text);
      if (!pkt || pkt.length <= HDR || pkt[0] !== MAGIC || pkt[1] !== VERSION) return "invalid";
      const dv = new DataView(pkt.buffer, pkt.byteOffset);
      const fileId = dv.getUint32(2), total = dv.getUint32(6), bs = dv.getUint16(10), seed = dv.getUint32(12);
      if (pkt.length !== HDR + bs || bs === 0) return "invalid";
      let status = "new";
      if (fileId !== this.fileId) {
        this.reset();
        this.fileId = fileId; this.total = total; this.blockSize = bs;
        this.K = Math.max(1, Math.ceil(total / bs));
        this.known = new Array(this.K).fill(null);
        this.byBlock = Array.from({ length: this.K }, () => []);
        status = "newfile";
      }
      if (this.result) return "done";
      if (this.seen.has(seed)) return "dup";
      this.seen.add(seed); this.packets++;
      const data = pkt.slice(HDR);
      const rem = [];
      for (const i of indicesFor(seed, this.K)) { if (this.known[i]) xorInto(data, this.known[i]); else rem.push(i); }
      const before = this.solved;
      if (rem.length === 1) this._resolve(rem[0], data);
      else if (rem.length > 1) {
        const eq = { rem: new Set(rem), data };
        for (const i of rem) this.byBlock[i].push(eq);
      }
      if (this.solved === this.K) { this._finish(); return this.result ? "done" : "invalid"; }
      return this.solved > before ? (status === "newfile" ? "newfile" : "progress") : status;
    }
    _resolve(i0, d0) {
      const queue = [[i0, d0]];
      while (queue.length) {
        const [i, d] = queue.pop();
        if (this.known[i]) continue;
        this.known[i] = d; this.solved++;
        const eqs = this.byBlock[i]; this.byBlock[i] = [];
        for (const eq of eqs) {
          if (!eq.rem.has(i)) continue;
          xorInto(eq.data, d); eq.rem.delete(i);
          if (eq.rem.size === 1) { const [j] = eq.rem; eq.rem.clear(); queue.push([j, eq.data]); }
        }
      }
    }
    _finish() {
      const bs = this.blockSize;
      const stream = new Uint8Array(this.K * bs);
      for (let i = 0; i < this.K; i++) stream.set(this.known[i], i * bs);
      const s = stream.subarray(0, this.total);
      const dv = new DataView(s.buffer, s.byteOffset);
      try {
        let p = 0;
        const nl = dv.getUint16(p); p += 2; const name = dec.decode(s.subarray(p, p + nl)); p += nl;
        const ml = dv.getUint16(p); p += 2; const mime = dec.decode(s.subarray(p, p + ml)); p += ml;
        const crc = dv.getUint32(p); p += 4;
        const bytes = s.slice(p);
        this.result = { name, mime, bytes, ok: crc32(bytes) === crc };
      } catch (e) { this.result = null; }
    }
    get progress() { return this.K ? this.solved / this.K : 0; }
  }

  G.QRBeam = { b45enc, b45dec, crc32, Encoder, Decoder, indicesFor, HDR };
})(typeof globalThis !== "undefined" ? globalThis : window);
