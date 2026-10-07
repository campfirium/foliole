/** Leading frontmatter follows projectNodeInlineContent without retaining lines or prefixes. */
export class BodyFrontmatterRange {
  readonly #decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });
  #phase: 'leading' | 'dash1' | 'dash2' | 'trailing' | 'invalid' = 'leading';
  #line = 0;
  #position = 0;
  #finished = false;
  #end: number | null = null;

  push(bytes: Uint8Array) {
    if (!this.#finished) this.#scan(this.#decoder.decode(bytes, { stream: true }));
  }

  finish() {
    if (!this.#finished) {
      this.#scan(this.#decoder.decode());
      if (!this.#finished && this.#line > 0 && this.#phase === 'trailing') this.#end = this.#position;
      this.#finished = true;
    }
    return this.#end;
  }

  #scan(text: string) {
    for (const char of text) {
      const scalar = char.codePointAt(0)!;
      this.#position += scalar <= 0x7f ? 1 : scalar <= 0x7ff ? 2 : scalar <= 0xffff ? 3 : 4;
      if (char === '\n') {
        this.#lineEnd();
        if (this.#finished) return;
      } else {
        this.#accept(char);
        if (this.#line === 0 && this.#phase === 'invalid') { this.#finished = true; return; }
      }
    }
  }

  #lineEnd() {
    if (this.#line === 0 && this.#phase !== 'trailing') this.#finished = true;
    else if (this.#line > 0 && this.#phase === 'trailing') {
      this.#end = this.#position;
      this.#finished = true;
    }
    this.#line += 1;
    this.#phase = 'leading';
  }

  #accept(char: string) {
    if (this.#phase === 'invalid') return;
    if (char === '-') {
      if (this.#phase === 'leading') this.#phase = 'dash1';
      else if (this.#phase === 'dash1') this.#phase = 'dash2';
      else if (this.#phase === 'dash2') this.#phase = 'trailing';
      else this.#phase = 'invalid';
    } else if (!/\s/u.test(char) || this.#phase === 'dash1' || this.#phase === 'dash2') {
      this.#phase = 'invalid';
    }
  }
}
