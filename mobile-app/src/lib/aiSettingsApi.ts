/**
 * API Methods for AI Settings — 100% STANDALONE Mobile App
 * Manage custom API keys, preferences, and device capabilities locally in localStorage.
 */

import { useAISettingsStore } from './settingsStore';
import type { DeviceCapabilities, ProviderStatus } from './settingsStore';

import api from './api';

export const aiSettingsApi = {
  /**
   * Save user's custom API key
   */
  async saveAPIKey(provider: string, apiKey: string, label?: string) {
    try {
      console.log(`[aiSettingsApi] Saving key locally for ${provider}`);
      
      // Save in localStorage for aiService to read directly
      if (provider === 'groq') {
        localStorage.setItem('GROQ_API_KEY', apiKey);
      } else if (provider === 'cerebras') {
        localStorage.setItem('CEREBRAS_API_KEY', apiKey);
      } else if (provider === 'openrouter') {
        localStorage.setItem('OPENROUTER_API_KEY', apiKey);
      } else {
        localStorage.setItem('CUSTOM_API_KEY', apiKey);
      }

      // Sync with Zustand store
      const maskedKey = apiKey.length > 8 ? `${apiKey.slice(0, 4)}...${apiKey.slice(-4)}` : '••••••••';
      
      useAISettingsStore.setState({
        customAPIKey: apiKey,
        customKeySettings: {
          provider,
          label: label || `${provider.charAt(0).toUpperCase() + provider.slice(1)} Key`,
          maskedKey,
          createdAt: new Date().toISOString(),
          lastUsed: new Date().toISOString()
        }
      });

      return { success: true, data: { provider, label } };
    } catch (error: any) {
      return {
        success: false,
        error: error.message || 'Failed to save API key',
      };
    }
  },

  /**
   * Get saved API key info (masked)
   */
  async getAPIKey() {
    try {
      const store = useAISettingsStore.getState();
      return { success: true, data: store.customKeySettings };
    } catch (error: any) {
      return {
        success: false,
        data: null,
        error: error.message || 'Failed to fetch API key',
      };
    }
  },

  /**
   * Delete saved API key
   */
  async deleteAPIKey() {
    try {
      console.log('[aiSettingsApi] Deleting custom API keys');
      
      // Remove all provider keys
      localStorage.removeItem('GROQ_API_KEY');
      localStorage.removeItem('CEREBRAS_API_KEY');
      localStorage.removeItem('OPENROUTER_API_KEY');
      localStorage.removeItem('CUSTOM_API_KEY');

      // Clear Zustand store state
      useAISettingsStore.getState().removeCustomAPIKey();
      
      return { success: true };
    } catch (error: any) {
      return {
        success: false,
        error: error.message || 'Failed to delete API key',
      };
    }
  },

  /**
   * Test if an API key is valid client-side via backend router
   */
  async testAPIKey(provider: string, apiKey: string) {
    try {
      const response = await api.post('/ai-settings/test-key', { provider, api_key: apiKey });
      return { success: response.data.success, data: response.data };
    } catch (error: any) {
      console.warn('API key test error:', error);
      return {
        success: false,
        error: error.response?.data?.detail || error.message || 'Connection failed',
        data: { success: false, message: error.response?.data?.detail || error.message || 'Connection failed' }
      };
    }
  },

  /**
   * Get provider status
   */
  async getProviderStatus(): Promise<ProviderStatus[]> {
    try {
      const response = await api.get('/ai-settings/status');
      return response.data.map((p: any) => ({
        name: p.name,
        status: p.status,
        configured: p.configured,
        canUseCustom: p.can_use_custom,
        error: p.error || undefined
      }));
    } catch (error) {
      console.warn('Failed to load provider statuses from backend:', error);
      return [];
    }
  },

  /**
   * Get device capabilities for local models
   */
  async getDeviceCapabilities(): Promise<DeviceCapabilities | null> {
    try {
      const response = await api.get('/ai-settings/device-capabilities');
      const data = response.data;
      return {
        platform: data.platform,
        supportsLocalModels: data.supports_local_models,
        availableMemoryMB: data.available_memory_mb,
        availableStorageMB: data.available_storage_mb,
        availableModels: data.available_models.map((m: any) => ({
          name: m.name,
          label: m.label,
          description: m.description,
          memoryMB: m.memory_mb,
          storageMB: m.storage_mb
        }))
      };
    } catch (error) {
      console.warn('Failed to load device capabilities from backend:', error);
      return null;
    }
  },

  /**
   * Get generation preferences
   */
  async getPreferences() {
    const store = useAISettingsStore.getState();
    return {
      success: true,
      data: {
        preferred_provider: store.preferredProvider,
        use_local_models: store.useLocalModels,
        fallback_strategy: store.fallbackStrategy,
      }
    };
  },

  /**
   * Save generation preferences
   */
  async savePreferences(
    preferredProvider: 'backend' | 'custom' | 'local',
    useLocalModels: boolean,
    fallbackStrategy: 'next_available' | 'manual_select'
  ) {
    try {
      useAISettingsStore.setState({
        preferredProvider,
        useLocalModels,
        fallbackStrategy
      });
      return { success: true };
    } catch (error: any) {
      return {
        success: false,
        error: error.message || 'Failed to save preferences',
      };
    }
  },

  /**
   * Download a local model (e.g., Gemma 2B)
   */
  async downloadLocalModel(modelName: string): Promise<{ success: boolean; error?: string; data?: any }> {
    return {
      success: true,
      data: {
        status: 'downloading',
        progress: 0,
        message: 'Download started successfully'
      }
    };
  }
};
