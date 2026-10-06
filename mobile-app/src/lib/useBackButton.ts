import { useEffect } from 'react';
import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';

/**
 * Hook to handle native Android hardware back button presses.
 * Capacitor stacks these listeners, meaning the last registered active listener 
 * will handle the back button click first.
 * 
 * @param handler Function to execute when back button is pressed.
 * @param active Whether the listener is active. Defaults to true.
 */
export function useBackButton(handler: () => void, active: boolean = true) {
  useEffect(() => {
    if (!Capacitor.isNativePlatform() || !active) return;

    const listenerPromise = App.addListener('backButton', () => {
      handler();
    });

    return () => {
      listenerPromise.then((h) => h.remove());
    };
  }, [handler, active]);
}
