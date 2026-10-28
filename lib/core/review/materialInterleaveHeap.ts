// A construction-local heap; no identities or scheduling state are persisted.
export class MaterialInterleaveHeap<T> {
  private readonly items: T[] = [];

  constructor(private readonly compare: (left: T, right: T) => number) {}

  get size() { return this.items.length; }

  push(value: T) {
    let index = this.items.length;
    this.items.push(value);
    while (index > 0) {
      const parent = Math.floor((index - 1) / 2);
      if (this.compare(this.items[parent]!, value) <= 0) break;
      this.items[index] = this.items[parent]!;
      index = parent;
    }
    this.items[index] = value;
  }

  pop(): T {
    const first = this.items[0]!;
    const last = this.items.pop()!;
    if (this.items.length === 0) return first;
    let index = 0;
    while (index * 2 + 1 < this.items.length) {
      let child = index * 2 + 1;
      if (child + 1 < this.items.length && this.compare(this.items[child + 1]!, this.items[child]!) < 0) child++;
      if (this.compare(last, this.items[child]!) <= 0) break;
      this.items[index] = this.items[child]!;
      index = child;
    }
    this.items[index] = last;
    return first;
  }
}
