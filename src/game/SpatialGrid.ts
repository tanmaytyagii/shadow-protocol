export interface GridEntity {
  x: number
  y: number
  radius: number
}

/**
 * Uniform grid broad-phase. Entities are bucketed by centre; queries expand by
 * `maxRadius` so large entities are still found without duplicate inserts.
 */
export class SpatialGrid<T extends GridEntity> {
  private readonly cellSize: number
  private readonly cols: number
  private readonly rows: number
  private readonly cells: T[][]
  private maxRadius = 0

  constructor(width: number, height: number, cellSize: number) {
    this.cellSize = cellSize
    this.cols = Math.ceil(width / cellSize)
    this.rows = Math.ceil(height / cellSize)
    this.cells = Array.from({ length: this.cols * this.rows }, () => [])
  }

  clear(): void {
    for (const c of this.cells) c.length = 0
    this.maxRadius = 0
  }

  insert(e: T): void {
    const cx = Math.min(this.cols - 1, Math.max(0, Math.floor(e.x / this.cellSize)))
    const cy = Math.min(this.rows - 1, Math.max(0, Math.floor(e.y / this.cellSize)))
    this.cells[cy * this.cols + cx].push(e)
    if (e.radius > this.maxRadius) this.maxRadius = e.radius
  }

  /** Collects entities whose bounding circles may overlap the query circle. */
  query(x: number, y: number, r: number, out: T[]): T[] {
    out.length = 0
    const reach = r + this.maxRadius
    const x0 = Math.max(0, Math.floor((x - reach) / this.cellSize))
    const x1 = Math.min(this.cols - 1, Math.floor((x + reach) / this.cellSize))
    const y0 = Math.max(0, Math.floor((y - reach) / this.cellSize))
    const y1 = Math.min(this.rows - 1, Math.floor((y + reach) / this.cellSize))
    for (let cy = y0; cy <= y1; cy++) {
      for (let cx = x0; cx <= x1; cx++) {
        const cell = this.cells[cy * this.cols + cx]
        for (let i = 0; i < cell.length; i++) {
          const e = cell[i]
          const dx = e.x - x
          const dy = e.y - y
          const rr = r + e.radius
          if (dx * dx + dy * dy <= rr * rr) out.push(e)
        }
      }
    }
    return out
  }
}
