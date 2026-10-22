import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/oxanium'
import '@fontsource-variable/jetbrains-mono'
import './index.css'
import App from './App'
import { ErrorBoundary } from './ErrorBoundary'

const root = document.getElementById('root')
if (!root) throw new Error('Missing #root element')

createRoot(root).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
