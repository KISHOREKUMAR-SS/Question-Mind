import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'
import { useThemeStore } from './lib/themeStore'
import { initializeAIService } from './lib/aiInit'

// Initialize theme from storage
const { isDark, setTheme } = useThemeStore.getState();
setTheme(isDark);

// Initialize AI Service with LLM API keys
initializeAIService();

// Prevent scroll wheel from changing values on focused number inputs
document.addEventListener('wheel', () => {
  if (document.activeElement instanceof HTMLInputElement && document.activeElement.type === 'number') {
    document.activeElement.blur();
  }
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
