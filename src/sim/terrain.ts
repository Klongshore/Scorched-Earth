/** A block of cells, inclusive at both ends. */
export interface CellRect {
  readonly x0: number;
  readonly x1: number;
  readonly y0: number;
  readonly y1: number;
}

export class Terrain {
  readonly width: number;
  readonly height: number;
  /** 1 = dirt, 0 = air. Index = y * width + x. */
  readonly cells: Uint8Array;
  /** Incremented on every change, so the renderer knows when to redraw. */
  version = 0;
  /**
   * Columns [unsettledFrom, unsettledTo] may hold dirt with air below it. Every edit widens the
   * range; settlePass scans only these columns and narrows the range to the ones still moving.
   * Empty when unsettledFrom > unsettledTo.
   */
  private unsettledFrom = Infinity;
  private unsettledTo = -Infinity;

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
    this.markUnsettled(x, x);
  }

  /** Let Settling scan columns [x0, x1] again, e.g. after something they rest on has moved. */
  markUnsettled(x0: number, x1: number): void {
    this.unsettledFrom = Math.min(this.unsettledFrom, x0);
    this.unsettledTo = Math.max(this.unsettledTo, x1);
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
    if (changed) {
      this.version++;
      this.markUnsettled(x0, x1);
    }
  }

  /**
   * Fill every air cell within radius of (cx, cy) with dirt (cell centre inside the circle), except
   * the cells keepClear names, so a buried Tank is encased, not overlapped. Marks the filled
   * columns unsettled so dirt left hanging in the air Settles.
   */
  fillCircle(
    cx: number,
    cy: number,
    radius: number,
    keepClear: (x: number, y: number) => boolean,
  ): void {
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
        if (dx * dx + dy * dy <= r2 && this.cells[index] === 0 && !keepClear(x, y)) {
          this.cells[index] = 1;
          changed = true;
        }
      }
    }
    if (changed) {
      this.version++;
      this.markUnsettled(x0, x1);
    }
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
    if (changed) {
      this.version++;
      this.markUnsettled(from, to);
    }
  }

  /**
   * One Settling pass: every solid cell with air directly below moves down one row.
   * Each column is scanned from row height-2 up to row 0, so a whole floating chunk drops 1 px per pass.
   * Only columns edited since they last came to rest are scanned; a column that moves nothing is
   * at rest, since dirt only moves straight down. Dirt never falls into a blocker (a living Tank's
   * cells); call markUnsettled when a blocker moves or goes. Returns true if any cell moved.
   */
  settlePass(blockers: readonly CellRect[] = []): boolean {
    const w = this.width;
    let from = Infinity;
    let to = -Infinity;
    for (let x = Math.max(0, this.unsettledFrom); x <= Math.min(w - 1, this.unsettledTo); x++) {
      const columnMoved = blocks(blockers, x, -Infinity, Infinity)
        ? this.settleColumnAround(x, blockers)
        : this.settleColumn(x);
      if (columnMoved) {
        from = Math.min(from, x);
        to = Math.max(to, x);
      }
    }
    this.unsettledFrom = from;
    this.unsettledTo = to;
    const moved = from <= to;
    if (moved) this.version++;
    return moved;
  }

  /** Drop every solid cell in column x with air below it by one row; true if any moved. */
  private settleColumn(x: number): boolean {
    const w = this.width;
    let moved = false;
    for (let y = this.height - 2; y >= 0; y--) {
      const index = y * w + x;
      if (this.cells[index] === 1 && this.cells[index + w] === 0) {
        this.cells[index] = 0;
        this.cells[index + w] = 1;
        moved = true;
      }
    }
    return moved;
  }

  /** As settleColumn, for a column a blocker covers: nothing falls into a blocker. */
  private settleColumnAround(x: number, blockers: readonly CellRect[]): boolean {
    const w = this.width;
    let moved = false;
    for (let y = this.height - 2; y >= 0; y--) {
      const index = y * w + x;
      if (
        this.cells[index] === 1 &&
        this.cells[index + w] === 0 &&
        !blocks(blockers, x, y + 1, y + 1)
      ) {
        this.cells[index] = 0;
        this.cells[index + w] = 1;
        moved = true;
      }
    }
    return moved;
  }
}

/** True if any blocker covers column x somewhere in rows [y0, y1]. */
function blocks(blockers: readonly CellRect[], x: number, y0: number, y1: number): boolean {
  for (let i = 0; i < blockers.length; i++) {
    const b = blockers[i] as CellRect;
    if (x >= b.x0 && x <= b.x1 && y1 >= b.y0 && y0 <= b.y1) return true;
  }
  return false;
}
