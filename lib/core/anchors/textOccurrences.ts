/** UTF-16 positions and overlapping matches, with only the first position and 0/1/many count. */
export class TextOccurrences {
  readonly #prefix: Uint32Array;
  #matched = 0;
  #position = 0;
  #first = -1;
  #count: 0 | 1 | 2 = 0;

  constructor(private readonly pattern: string) {
    this.#prefix = new Uint32Array(pattern.length);
    for (let index = 1, matched = 0; index < pattern.length; index += 1) {
      while (matched > 0 && pattern[index] !== pattern[matched]) matched = this.#prefix[matched - 1]!;
      if (pattern[index] === pattern[matched]) matched += 1;
      this.#prefix[index] = matched;
    }
  }

  get count() { return this.#count; }
  get first() { return this.#count === 0 ? null : this.#first; }

  push(text: string) {
    if (this.#count === 2 || this.pattern.length === 0) return;
    for (let index = 0; index < text.length; index += 1) {
      while (this.#matched > 0 && text[index] !== this.pattern[this.#matched]) {
        this.#matched = this.#prefix[this.#matched - 1]!;
      }
      if (text[index] === this.pattern[this.#matched]) this.#matched += 1;
      if (this.#matched === this.pattern.length) {
        if (this.#count === 0) { this.#first = this.#position + index + 1 - this.pattern.length; this.#count = 1; }
        else { this.#count = 2; return; }
        this.#matched = this.#prefix[this.#matched - 1]!;
      }
    }
    this.#position += text.length;
  }
}
