/**
 * AI Service Initialization
 * Loads environment variables from Vite into localStorage for provider setup
 */

export function initializeAIService(): void {
  // Load LLM API keys from Vite environment variables
  const cerebrasKey = import.meta.env.VITE_CEREBRAS_API_KEY || '';
  const cerebrasKey2 = import.meta.env.VITE_CEREBRAS_API_KEY_2 || '';
  const groqKey = import.meta.env.VITE_GROQ_API_KEY || '';
  const nvidiaKey = import.meta.env.VITE_NVIDIA_API_KEY || '';
  const openrouterKey = import.meta.env.VITE_OPENROUTER_API_KEY || '';

  // Store in localStorage for AI Service to access
  if (cerebrasKey) localStorage.setItem('CEREBRAS_API_KEY', cerebrasKey);
  if (cerebrasKey2) localStorage.setItem('CEREBRAS_API_KEY_2', cerebrasKey2);
  if (groqKey) localStorage.setItem('GROQ_API_KEY', groqKey);
  if (nvidiaKey) localStorage.setItem('NVIDIA_API_KEY', nvidiaKey);
  if (openrouterKey) localStorage.setItem('OPENROUTER_API_KEY', openrouterKey);

  // Mobile backend (Chaquopy) has embedded system keys for Groq, Cerebras, and NVIDIA
  const providers = ['System-Groq', 'System-Cerebras', 'System-NVIDIA'];
  
  if (cerebrasKey) providers.push('Cerebras (Custom)');
  if (cerebrasKey2) providers.push('Cerebras-2 (Custom)');
  if (groqKey) providers.push('Groq (Custom)');
  if (nvidiaKey) providers.push('NVIDIA (Custom)');
  if (openrouterKey) providers.push('OpenRouter (Custom)');

  if (providers.length > 0) {
    console.log('[Init] LLM Providers configured:', providers.join(' → '));
  } else {
    console.warn('[Init] ⚠️ No LLM API keys configured. Generate questions will fail.');
    console.log('[Init] Please set environment variables in .env.local or configure API keys in settings');
  }
}

/**
 * Check if at least one LLM provider is available
 */
export function hasLLMProvider(): boolean {
  return true; // We always have embedded system keys!
}

/**
 * Get configured provider names
 */
export function getConfiguredProviders(): string[] {
  const providers = ['System-Groq', 'System-Cerebras', 'System-NVIDIA'];
  if (localStorage.getItem('CEREBRAS_API_KEY')) providers.push('Cerebras');
  if (localStorage.getItem('CEREBRAS_API_KEY_2')) providers.push('Cerebras-2');
  if (localStorage.getItem('GROQ_API_KEY')) providers.push('Groq');
  if (localStorage.getItem('NVIDIA_API_KEY')) providers.push('NVIDIA');
  if (localStorage.getItem('OPENROUTER_API_KEY')) providers.push('OpenRouter');
  return providers;
}

/**
 * Update an LLM API key at runtime
 */
export function updateLLMKey(provider: 'cerebras' | 'groq' | 'nvidia' | 'openrouter', key: string): void {
  const keyMap: Record<string, string> = {
    cerebras: 'CEREBRAS_API_KEY',
    groq: 'GROQ_API_KEY',
    nvidia: 'NVIDIA_API_KEY',
    openrouter: 'OPENROUTER_API_KEY',
  };

  if (key.trim()) {
    localStorage.setItem(keyMap[provider], key.trim());
    console.log(`[Init] Updated ${provider} API key`);
  } else {
    localStorage.removeItem(keyMap[provider]);
    console.log(`[Init] Removed ${provider} API key`);
  }
}
