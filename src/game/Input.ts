const GAME_KEYS = new Set([
  'KeyW',
  'KeyA',
  'KeyS',
  'KeyD',
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'Space',
  'ShiftLeft',
  'ShiftRight',
  'KeyQ',
  'KeyE',
  'Digit1',
  'Digit2',
  'Digit3',
  'Digit4',
  'Escape',
  'KeyP',
  'Tab',
])

export interface Controls {
  moveX: number
  moveY: number
  fire: boolean
  dash: boolean
  boost: boolean
  weaponSlot: number
  weaponCycle: number
  pause: boolean
}

/**
 * Collects keyboard, mouse and virtual-touch input. Held state is always
 * tracked so keys held across a pause still register; edge-triggered presses
 * are only recorded while the game is capturing input.
 */
export class Input {
  capture = false
  mouseX = 0
  mouseY = 0
  mouseDown = false
  hasMouse = false
  usingTouch = false

  touchMoveX = 0
  touchMoveY = 0
  touchAimX = 0
  touchAimY = 0
  touchAiming = false
  touchBoost = false
  private touchDashQueued = false
  private touchSwapQueued = false
  private touchPauseQueued = false

  private keys = new Set<string>()
  private pressed = new Set<string>()
  private wheel = 0
  private el: HTMLElement | null = null
  private readonly listeners: [EventTarget, string, EventListener, AddEventListenerOptions?][] = []

  /** Optional hook so the game can react to focus loss immediately. */
  onBlur: (() => void) | null = null

  /** Attaches to the game canvas; keyboard and pointer-up are tracked on window. */
  attach(el: HTMLElement): void {
    this.detach()
    this.el = el
    this.on(window, 'keydown', this.handleKeyDown as EventListener)
    this.on(window, 'keyup', this.handleKeyUp as EventListener)
    this.on(window, 'pointermove', this.handlePointerMove as EventListener)
    this.on(el, 'pointerdown', this.handlePointerDown as EventListener)
    this.on(window, 'pointerup', this.handlePointerUp as EventListener)
    this.on(window, 'pointercancel', this.handlePointerUp as EventListener)
    this.on(el, 'wheel', this.handleWheel as EventListener, { passive: false })
    this.on(el, 'contextmenu', this.preventDefault)
    this.on(window, 'blur', this.handleBlur)
  }

  detach(): void {
    for (const [target, type, fn, opts] of this.listeners) target.removeEventListener(type, fn, opts)
    this.listeners.length = 0
    this.el = null
    this.reset()
  }

  /** Clears all held and queued input (used on blur, pause and phase changes). */
  reset(): void {
    this.keys.clear()
    this.pressed.clear()
    this.mouseDown = false
    this.wheel = 0
    this.touchMoveX = 0
    this.touchMoveY = 0
    this.touchAiming = false
    this.touchBoost = false
    this.touchDashQueued = false
    this.touchSwapQueued = false
    this.touchPauseQueued = false
  }

  isDown(code: string): boolean {
    return this.keys.has(code)
  }

  /** Reads the current control state and clears one-shot presses. */
  read(): Controls {
    let mx = 0
    let my = 0
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) mx -= 1
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) mx += 1
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) my -= 1
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) my += 1
    if (mx === 0 && my === 0 && (this.touchMoveX !== 0 || this.touchMoveY !== 0)) {
      mx = this.touchMoveX
      my = this.touchMoveY
    }
    const len = Math.hypot(mx, my)
    if (len > 1) {
      mx /= len
      my /= len
    }

    let slot = 0
    for (let i = 1; i <= 4; i++) if (this.pressed.has(`Digit${i}`)) slot = i
    let cycle = 0
    // Q steps back and E forward, like the wheel; the touch Swap button steps forward.
    if (this.pressed.has('KeyQ')) cycle -= 1
    if (this.pressed.has('KeyE') || this.touchSwapQueued) cycle += 1
    if (this.wheel !== 0) cycle += this.wheel > 0 ? 1 : -1

    const controls: Controls = {
      moveX: mx,
      moveY: my,
      fire: this.mouseDown || this.touchAiming,
      dash: this.pressed.has('Space') || this.touchDashQueued,
      boost: this.keys.has('ShiftLeft') || this.keys.has('ShiftRight') || this.touchBoost,
      weaponSlot: slot,
      weaponCycle: Math.sign(cycle),
      pause: this.pressed.has('Escape') || this.pressed.has('KeyP') || this.touchPauseQueued,
    }
    this.pressed.clear()
    this.wheel = 0
    this.touchDashQueued = false
    this.touchSwapQueued = false
    this.touchPauseQueued = false
    return controls
  }

  // --- Virtual touch controls -------------------------------------------------

  setTouchMove(x: number, y: number): void {
    this.usingTouch = true
    this.touchMoveX = x
    this.touchMoveY = y
  }

  setTouchAim(x: number, y: number, active: boolean): void {
    this.usingTouch = true
    this.touchAiming = active
    if (active) {
      this.touchAimX = x
      this.touchAimY = y
    }
  }

  setTouchBoost(active: boolean): void {
    this.touchBoost = active
  }

  queueTouchDash(): void {
    if (this.capture) this.touchDashQueued = true
  }

  queueTouchSwap(): void {
    if (this.capture) this.touchSwapQueued = true
  }

  queueTouchPause(): void {
    if (this.capture) this.touchPauseQueued = true
  }

  // --- DOM handlers ----------------------------------------------------------

  private on(target: EventTarget, type: string, fn: EventListener, opts?: AddEventListenerOptions): void {
    target.addEventListener(type, fn, opts)
    this.listeners.push([target, type, fn, opts])
  }

  private preventDefault = (e: Event): void => {
    e.preventDefault()
  }

  private handleKeyDown = (e: KeyboardEvent): void => {
    if (!GAME_KEYS.has(e.code)) return
    if (this.capture) {
      e.preventDefault()
      if (!e.repeat) this.pressed.add(e.code)
    }
    this.keys.add(e.code)
  }

  private handleKeyUp = (e: KeyboardEvent): void => {
    this.keys.delete(e.code)
  }

  private handlePointerMove = (e: PointerEvent): void => {
    if (e.pointerType === 'touch' || !this.el) return
    const rect = this.el.getBoundingClientRect()
    this.mouseX = e.clientX - rect.left
    this.mouseY = e.clientY - rect.top
    this.hasMouse = true
    this.usingTouch = false
  }

  private handlePointerDown = (e: PointerEvent): void => {
    if (e.pointerType === 'touch') return
    if (e.button === 0) {
      this.mouseDown = true
      this.handlePointerMove(e)
    }
  }

  private handlePointerUp = (e: PointerEvent): void => {
    if (e.pointerType === 'touch') return
    if (e.button === 0 || e.type === 'pointercancel') this.mouseDown = false
  }

  private handleWheel = (e: WheelEvent): void => {
    if (!this.capture) return
    e.preventDefault()
    if (Math.abs(e.deltaY) > 2) this.wheel += Math.sign(e.deltaY)
  }

  private handleBlur = (): void => {
    this.reset()
    this.onBlur?.()
  }
}
