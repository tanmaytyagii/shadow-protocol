import { Component, type ErrorInfo, type ReactNode } from 'react'

interface State {
  error: Error | null
}

/** Last-resort boundary for UI render errors; the engine reports its own errors via the store. */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[shadow-protocol] UI error', error, info.componentStack)
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="fixed inset-0 grid place-items-center bg-void p-6 text-center">
        <div className="max-w-md">
          <p className="font-mono text-xs tracking-[0.35em] text-magenta">// INTERFACE FAILURE</p>
          <h1 className="mt-2 text-2xl font-bold tracking-[0.12em] text-white uppercase">The interface crashed</h1>
          <p className="mt-3 text-sm text-muted">{this.state.error.message}</p>
          <button
            type="button"
            className="chamfer-sm mt-6 bg-cyan/15 px-5 py-3 text-sm font-semibold tracking-[0.14em] text-cyan-soft uppercase"
            onClick={() => window.location.reload()}
          >
            Reload
          </button>
        </div>
      </div>
    )
  }
}
