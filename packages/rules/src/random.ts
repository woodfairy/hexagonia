import { createHash } from "node:crypto";

const SERIALIZED_STATE = /^([0-9a-f]{64}):(\d+)$/i;
const RAW_SEED = /^[0-9a-f]{64}$/i;
const MAX_UINT53_PLUS_ONE = 0x20_0000_0000_0000;

export class SeededRandom {
  state: string;
  private counter: number;
  private seedHex: string;

  constructor(seed: string | number) {
    if (typeof seed === "string") {
      const restored = seed.match(SERIALIZED_STATE);
      if (restored) {
        this.seedHex = restored[1]!.toLowerCase();
        this.counter = Number.parseInt(restored[2]!, 10);
        this.state = serializeState(this.seedHex, this.counter);
        return;
      }

      this.seedHex = RAW_SEED.test(seed) ? seed.toLowerCase() : hashSeedToHex(seed);
      this.counter = 0;
      this.state = serializeState(this.seedHex, this.counter);
      return;
    }

    this.seedHex = hashSeedToHex(seed.toString(10));
    this.counter = 0;
    this.state = serializeState(this.seedHex, this.counter);
  }

  next(): number {
    const digest = createHash("sha256")
      .update(Buffer.from(this.seedHex, "hex"))
      .update(encodeCounter(this.counter))
      .digest();

    this.counter += 1;
    this.state = serializeState(this.seedHex, this.counter);

    const value = digest.readUInt32BE(0) * 2 ** 21 + (digest.readUInt32BE(4) >>> 11);
    return value / MAX_UINT53_PLUS_ONE;
  }

  nextInt(minInclusive: number, maxInclusive: number): number {
    const value = this.next();
    return Math.floor(value * (maxInclusive - minInclusive + 1)) + minInclusive;
  }

  shuffle<T>(values: readonly T[]): T[] {
    const next = [...values];
    for (let index = next.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(this.next() * (index + 1));
      [next[index], next[swapIndex]] = [next[swapIndex]!, next[index]!];
    }
    return next;
  }
}

export function hashString(input: string): number {
  return createHash("sha256").update(input).digest().readUInt32BE(0);
}

function hashSeedToHex(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

function encodeCounter(counter: number): Buffer {
  const buffer = Buffer.allocUnsafe(8);
  buffer.writeBigUInt64BE(BigInt(counter));
  return buffer;
}

function serializeState(seedHex: string, counter: number): string {
  return `${seedHex}:${counter}`;
}
