/**
 * ProviderSelector.tsx - Radio button selector for AI provider preference
 * Options: Backend Keys, Custom Key, Local Model
 */

import React, { useEffect, useState } from 'react';
import { Radio } from 'lucide-react';
import { useAISettingsStore } from '../lib/settingsStore';
import { aiSettingsApi } from '../lib/aiSettingsApi';

export const ProviderSelector: React.FC = () => {
  const {
    preferredProvider,
    setPreferredProvider,
    useLocalModels,
    setUseLocalModels,
    deviceCapabilities,
    setDeviceCapabilities,
    loadingCapabilities,
    setLoadingCapabilities,
  } = useAISettingsStore();

  useEffect(() => {
    // Load device capabilities on mount
    const load = async () => {
      setLoadingCapabilities(true);
      const caps = await aiSettingsApi.getDeviceCapabilities();
      if (caps) {
        setDeviceCapabilities(caps);
      }
      setLoadingCapabilities(false);
    };

    if (!deviceCapabilities) {
      load();
    }
  }, []);

  const handleProviderChange = (provider: 'backend' | 'custom' | 'local') => {
    setPreferredProvider(provider);
  };

  const canUseLocal = deviceCapabilities?.supportsLocalModels && useLocalModels;

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
        Question Generation Provider
      </h3>

      {/* Backend Keys Option */}
      <label className={`flex items-start space-x-3 p-4 border rounded-xl cursor-pointer transition-all ${
        preferredProvider === 'backend'
          ? 'border-pink-500 bg-pink-50/30 dark:bg-pink-950/20 shadow-sm'
          : 'border-pink-100 dark:border-pink-900/30 hover:bg-pink-50/10 dark:hover:bg-slate-800/40 hover:border-pink-200 dark:hover:border-pink-900/50'
      }`}>
        <input
          type="radio"
          name="provider"
          value="backend"
          checked={preferredProvider === 'backend'}
          onChange={() => handleProviderChange('backend')}
          className="mt-1 w-4 h-4 text-pink-600 focus:ring-pink-500 border-pink-300 bg-white dark:bg-slate-800"
        />
        <div className="flex-1">
          <p className="font-semibold text-slate-900 dark:text-white">Use Backend Keys</p>
          <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 mt-1 leading-relaxed">
            Use Groq, Cerebras, NVIDIA, and OpenRouter keys configured by the system
          </p>
          <p className="text-xs text-pink-600 dark:text-pink-400 font-medium mt-2">
            ✓ Reliable ✓ No setup • Requires internet
          </p>
        </div>
      </label>

      {/* Custom Key Option */}
      <label className={`flex items-start space-x-3 p-4 border rounded-xl cursor-pointer transition-all ${
        preferredProvider === 'custom'
          ? 'border-pink-500 bg-pink-50/30 dark:bg-pink-950/20 shadow-sm'
          : 'border-pink-100 dark:border-pink-900/30 hover:bg-pink-50/10 dark:hover:bg-slate-800/40 hover:border-pink-200 dark:hover:border-pink-900/50'
      }`}>
        <input
          type="radio"
          name="provider"
          value="custom"
          checked={preferredProvider === 'custom'}
          onChange={() => handleProviderChange('custom')}
          className="mt-1 w-4 h-4 text-pink-600 focus:ring-pink-500 border-pink-300 bg-white dark:bg-slate-800"
        />
        <div className="flex-1">
          <p className="font-semibold text-slate-900 dark:text-white">Use Custom API Key</p>
          <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 mt-1 leading-relaxed">
            Use your own Groq, Cerebras, or OpenRouter key with custom rate limits
          </p>
          <p className="text-xs text-pink-600 dark:text-pink-400 font-medium mt-2">
            ✓ Custom limits ✓ Your API credits • Requires internet
          </p>
        </div>
      </label>

      {/* Local Model Option */}
      <div
        className={`p-4 border rounded-xl transition-all ${
          !deviceCapabilities?.supportsLocalModels
            ? 'border-pink-100/50 dark:border-pink-950/20 bg-slate-50 dark:bg-slate-900/30 cursor-not-allowed opacity-60'
            : preferredProvider === 'local'
            ? 'border-pink-500 bg-pink-50/30 dark:bg-pink-950/20 shadow-sm cursor-pointer'
            : 'border-pink-100 dark:border-pink-900/30 hover:bg-pink-50/10 dark:hover:bg-slate-800/40 hover:border-pink-200 dark:hover:border-pink-900/50 cursor-pointer'
        }`}
      >
        <label className="flex items-start space-x-3 cursor-pointer">
          <input
            type="radio"
            name="provider"
            value="local"
            checked={preferredProvider === 'local'}
            onChange={() => handleProviderChange('local')}
            disabled={!deviceCapabilities?.supportsLocalModels}
            className="mt-1 w-4 h-4 text-pink-600 focus:ring-pink-500 border-pink-300 bg-white dark:bg-slate-800"
          />
          <div className="flex-1">
            <p className="font-semibold text-slate-900 dark:text-white">Gemma (Local Offline)</p>
            <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 mt-1 leading-relaxed">
              {deviceCapabilities?.supportsLocalModels
                ? 'Run Gemma 2B offline on your device (Requires download)'
                : 'Gemma (Local Offline) is not supported on this device'}
            </p>
            <p className="text-xs text-pink-600 dark:text-pink-400 font-medium mt-2">
              {deviceCapabilities?.supportsLocalModels
                ? `✓ Offline ✓ No API needed • Slower responses (${deviceCapabilities.availableMemoryMB}MB RAM available)`
                : '✗ Insufficient resources'}
            </p>

            {/* Local Model Details */}
            {deviceCapabilities?.supportsLocalModels && (
              <div className="mt-3 space-y-2 text-xs bg-white dark:bg-slate-900 p-3 rounded-lg border border-pink-100/50 dark:border-pink-900/20 shadow-inner">
                <p className="font-bold text-slate-800 dark:text-slate-200">Available Models:</p>
                {deviceCapabilities.availableModels.map((model) => (
                  <div key={model.name} className="flex justify-between font-medium">
                    <span className="text-slate-600 dark:text-slate-400">{model.label}</span>
                    <span className="text-slate-500 dark:text-slate-500">
                      {model.memoryMB}MB • {model.storageMB}MB
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </label>
      </div>

      {/* Fallback Strategy */}
      <div className="mt-6 p-4 bg-pink-50/40 dark:bg-pink-950/10 border-2 border-pink-200/50 dark:border-pink-900/30 rounded-xl shadow-sm">
        <p className="text-xs sm:text-sm font-semibold text-pink-800 dark:text-pink-200 leading-relaxed">
          💡 Pro Tip: If your selected provider fails, the system automatically tries the next available provider
        </p>
      </div>
    </div>
  );
};
