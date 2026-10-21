export class Terrain {
  readonly width: number;
  readonly height: number;
  /** 1 = dirt, 0 = air. Index = y * width + x. */
  readonly cells: Uint8Array;
  /** Incremented on every change, so the renderer knows when to redraw. */
  version = 0;

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.cells = new Uint8Array(width * height);
  }

  /** Floors x and y. Outside the field is air, except below the bottom, where the floor is solid. */
  isSolid(x: number, y: number): boolean {
    const cx = Math.floor(x);
    const cy = Math.floor(y);
    if (cy >= this.height) return true;
    if (cx < 0 || cx >= this.width || cy < 0) return false;
    return this.cells[cy * this.width + cx] === 1;
  }

  /** Integer coordinates; out-of-range is ignored. */
  set(x: number, y: number, solid: boolean): void {
    if (x < 0 || x >= this.width || y < 0 || y >= this.height) return;
    const index = y * this.width + x;
    const value = solid ? 1 : 0;
    if (this.cells[index] === value) return;
    this.cells[index] = value;
    this.version++;
  }

  /** Topmost solid row in column x, or height if the column is empty. */
  surfaceY(x: number): number {
    for (let y = 0; y < this.height; y++) {
      if (this.cells[y * this.width + x] === 1) return y;
    }
    return this.height;
  }

  /** Fill each column x from surface[x] down to the bottom. */
  static fromSurface(surface: readonly number[], width: number, height: number): Terrain {
    const terrain = new Terrain(width, height);
    for (let x = 0; x < width; x++) {
      const top = Math.max(0, surface[x] ?? height);
      for (let y = top; y < height; y++) terrain.cells[y * width + x] = 1;
    }
    terrain.version++;
    return terrain;
  }

  /** Remove all dirt within radius of (cx, cy): cell centre (x+0.5, y+0.5) inside the circle. */
  carveCircle(cx: number, cy: number, radius: number): void {
    const r2 = radius * radius;
    const x0 = Math.max(0, Math.floor(cx - radius));
    const x1 = Math.min(this.width - 1, Math.ceil(cx + radius));
    const y0 = Math.max(0, Math.floor(cy - radius));
    const y1 = Math.min(this.height - 1, Math.ceil(cy + radius));
    let changed = false;
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const dx = x + 0.5 - cx;
        const dy = y + 0.5 - cy;
        const index = y * this.width + x;
        if (dx * dx + dy * dy <= r2 && this.cells[index] === 1) {
          this.cells[index] = 0;
          changed = true;
        }
      }
    }
    if (changed) this.version++;
  }

  /** Make columns [x0, x1] solid from row y down; clear them above y. Used for Tank pads. */
  flatten(x0: number, x1: number, y: number): void {
    const from = Math.max(0, x0);
    const to = Math.min(this.width - 1, x1);
    const row = Math.min(this.height, Math.max(0, y));
    let changed = false;
    for (let x = from; x <= to; x++) {
      for (let cy = 0; cy < this.height; cy++) {
        const value = cy >= row ? 1 : 0;
        const index = cy * this.width + x;
        if (this.cells[index] !== value) {
          this.cells[index] = value;
          changed = true;
        }
      }
    }
    if (changed) this.version++;
  }
}
