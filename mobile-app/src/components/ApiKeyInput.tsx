/**
 * ApiKeyInput.tsx - Secure input and management for custom API keys
 * Supports Groq, Cerebras, OpenRouter, and other providers
 */

import React, { useState } from 'react';
import { Eye, EyeOff, Trash2, Check, AlertCircle } from 'lucide-react';
import { useAISettingsStore } from '../lib/settingsStore';
import { aiSettingsApi } from '../lib/aiSettingsApi';

interface ApiKeyInputProps {
  provider?: 'groq' | 'cerebras' | 'openrouter' | 'custom';
  onSave?: () => void;
}

export const ApiKeyInput: React.FC<ApiKeyInputProps> = ({ provider = 'custom', onSave }) => {
  const {
    customAPIKey,
    customKeySettings,
    setCustomAPIKey,
    removeCustomAPIKey,
    testingKey,
    setTestingKey,
    keyTestResult,
    setKeyTestResult,
  } = useAISettingsStore();

  const [showKey, setShowKey] = useState(false);
  const [apiKey, setApiKey] = useState('');
  const [label, setLabel] = useState('');
  const [saving, setSaving] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState(provider);

  const handleSaveKey = async () => {
    if (!apiKey.trim()) {
      alert('Please enter an API key');
      return;
    }

    setSaving(true);
    const result = await aiSettingsApi.saveAPIKey(selectedProvider, apiKey, label);

    if (result.success) {
      setCustomAPIKey(apiKey);
      setApiKey('');
      setLabel('');
      setKeyTestResult(null);
      onSave?.();
    } else {
      alert(`Failed to save: ${result.error}`);
    }

    setSaving(false);
  };

  const handleTestKey = async () => {
    if (!apiKey.trim()) {
      alert('Please enter an API key first');
      return;
    }

    setTestingKey(true);
    const result = await aiSettingsApi.testAPIKey(selectedProvider, apiKey);
    setKeyTestResult(result.data);
    setTestingKey(false);
  };

  const handleDeleteKey = async () => {
    if (confirm('Are you sure you want to delete your API key?')) {
      const result = await aiSettingsApi.deleteAPIKey();
      if (result.success) {
        removeCustomAPIKey();
        setApiKey('');
        setLabel('');
        setKeyTestResult(null);
      } else {
        alert(`Failed to delete: ${result.error}`);
      }
    }
  };

  const providers = [
    { id: 'groq', name: 'Groq', color: 'text-orange-600', format: 'Starts with gsk-' },
    { id: 'cerebras', name: 'Cerebras', color: 'text-pink-600 dark:text-pink-400', format: 'Starts with sk-' },
    { id: 'openrouter', name: 'OpenRouter', color: 'text-purple-600', format: 'Custom format' },
    { id: 'custom', name: 'Other Provider', color: 'text-slate-600 dark:text-slate-400', format: 'Any format' },
  ];

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Custom API Key</h3>

      {/* Saved Key Display */}
      {customKeySettings && !apiKey ? (
        <div className="p-4 bg-emerald-50 dark:bg-emerald-950/20 border-2 border-emerald-100 dark:border-emerald-900/40 rounded-xl">
          <div className="flex items-start justify-between">
            <div>
              <p className="font-bold text-emerald-900 dark:text-emerald-300">
                ✓ API Key Saved
              </p>
              <p className="text-sm text-emerald-800 dark:text-emerald-400 mt-1 font-medium">
                {customKeySettings.label || customKeySettings.provider}
              </p>
              <p className="text-xs text-emerald-700 dark:text-emerald-500 mt-1 font-mono">
                {customKeySettings.maskedKey}
              </p>
              {customKeySettings.lastUsed && (
                <p className="text-xs text-emerald-600 dark:text-emerald-500">
                  Last used: {new Date(customKeySettings.lastUsed).toLocaleDateString()}
                </p>
              )}
            </div>
            <button
              onClick={() => setApiKey('update')}
              className="text-sm font-semibold text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 dark:hover:text-emerald-300"
            >
              Update
            </button>
          </div>
          <button
            onClick={handleDeleteKey}
            className="mt-3 flex items-center space-x-2 text-rose-600 dark:text-rose-400 hover:text-rose-700 dark:hover:text-rose-300 text-sm font-semibold"
          >
            <Trash2 size={16} />
            <span>Delete Key</span>
          </button>
        </div>
      ) : (
        <>
          {/* Provider Selection */}
          <div>
            <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
              Provider
            </label>
            <div className="grid grid-cols-2 gap-2">
              {providers.map((p) => (
                <button
                  key={p.id}
                  onClick={() => setSelectedProvider(p.id as any)}
                  className={`p-3 border-2 rounded-xl transition-all text-left ${
                    selectedProvider === p.id
                      ? 'border-pink-500 bg-pink-50/30 dark:bg-pink-950/20 shadow-sm'
                      : 'border-pink-100 dark:border-pink-900/20 hover:border-pink-200 dark:hover:border-pink-900/40'
                  }`}
                >
                  <p className={`font-bold ${p.color}`}>{p.name}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-normal">{p.format}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Key Input */}
          <div>
            <label htmlFor="api-key" className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
              API Key
            </label>
            <div className="relative">
              <input
                id="api-key"
                type={showKey ? 'text' : 'password'}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="Paste your API key here"
                className="w-full px-4 py-2.5 pr-10 border-2 border-pink-100 dark:border-pink-900/40 rounded-xl bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:border-pink-500 focus:ring-4 focus:ring-pink-500/10 transition-all font-mono"
              />
              <button
                onClick={() => setShowKey(!showKey)}
                className="absolute right-3 top-3 text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
              >
                {showKey ? <EyeOff size={20} /> : <Eye size={20} />}
              </button>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1.5 leading-normal">
              🔒 Your API key is encrypted and never shared
            </p>
          </div>

          {/* Label (Optional) */}
          <div>
            <label htmlFor="key-label" className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
              Label (Optional)
            </label>
            <input
              id="key-label"
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g., My Work Key, Project A"
              className="w-full px-4 py-2.5 border-2 border-pink-100 dark:border-pink-900/40 rounded-xl bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:border-pink-500 focus:ring-4 focus:ring-pink-500/10 transition-all"
            />
          </div>

          {/* Test Result */}
          {keyTestResult && (
            <div
              className={`p-4 border-2 rounded-xl flex items-start space-x-3 ${
                keyTestResult.success
                  ? 'bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-900/40'
                  : 'bg-rose-50 dark:bg-rose-950/20 border-rose-200 dark:border-rose-900/40'
              }`}
            >
              {keyTestResult.success ? (
                <>
                  <Check className="w-5 h-5 text-emerald-600 dark:text-emerald-400 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-bold text-emerald-900 dark:text-emerald-300">Key Valid</p>
                    <p className="text-xs sm:text-sm text-emerald-800 dark:text-emerald-400 mt-0.5 leading-relaxed">{keyTestResult.message}</p>
                  </div>
                </>
              ) : (
                <>
                  <AlertCircle className="w-5 h-5 text-rose-600 dark:text-rose-400 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-bold text-rose-900 dark:text-rose-300">Test Failed</p>
                    <p className="text-xs sm:text-sm text-rose-800 dark:text-rose-400 mt-0.5 leading-relaxed">{keyTestResult.message}</p>
                  </div>
                </>
              )}
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <button
              onClick={handleTestKey}
              disabled={!apiKey.trim() || testingKey}
              className="flex-1 px-4 py-2.5 border-2 border-pink-200 dark:border-pink-850 rounded-xl font-semibold text-pink-600 dark:text-pink-400 hover:bg-pink-50/50 dark:hover:bg-pink-950/20 disabled:opacity-50 disabled:cursor-not-allowed transition-all hover:scale-102 active:scale-98"
            >
              {testingKey ? 'Testing...' : 'Test Key'}
            </button>
            <button
              onClick={handleSaveKey}
              disabled={!apiKey.trim() || saving}
              className="flex-1 px-4 py-2.5 bg-gradient-to-r from-pink-500 to-purple-600 text-white rounded-xl font-semibold disabled:opacity-50 disabled:cursor-not-allowed hover:scale-102 active:scale-98 shadow-md shadow-pink-500/20 transition-all flex items-center justify-center gap-1.5"
            >
              {saving ? 'Saving...' : 'Save Key'}
            </button>
          </div>
        </>
      )}
    </div>
  );
};
