import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { QuestionBank, Question } from '../types';
import { questionBankApi } from './api';

export interface OfflineQuestionBank extends Omit<QuestionBank, 'questions'> {
  is_offline: boolean;
  questions: {
    parts: Record<string, Question[]>;
    include_answers: boolean;
  };
  // Store input options so we can sync them accurately
  sync_payload: {
    subject_id: string;
    syllabus_id: string;
    pattern_id?: string;
    title: string;
    questions: Record<string, Question[]>;
    include_answers: boolean;
  };
}

interface OfflineStoreState {
  offlineQuestionBanks: OfflineQuestionBank[];
  isSyncing: boolean;
  syncError: string | null;
  addOfflineBank: (bank: OfflineQuestionBank) => void;
  removeOfflineBank: (id: string) => void;
  clearOfflineBanks: () => void;
  syncOfflineBanks: (onProgress?: (msg: string) => void) => Promise<{ success: boolean; syncedCount: number }>;
}

export const useOfflineStore = create<OfflineStoreState>()(
  persist(
    (set, get) => ({
      offlineQuestionBanks: [],
      isSyncing: false,
      syncError: null,

      addOfflineBank: (bank) => {
        set((state) => ({
          offlineQuestionBanks: [bank, ...state.offlineQuestionBanks],
        }));
      },

      removeOfflineBank: (id) => {
        set((state) => ({
          offlineQuestionBanks: state.offlineQuestionBanks.filter((b) => b.id !== id),
        }));
      },

      clearOfflineBanks: () => {
        set({ offlineQuestionBanks: [] });
      },

      syncOfflineBanks: async (onProgress) => {
        const { offlineQuestionBanks, isSyncing } = get();
        if (isSyncing || offlineQuestionBanks.length === 0) {
          return { success: true, syncedCount: 0 };
        }

        set({ isSyncing: true, syncError: null });
        let syncedCount = 0;
        let hasFailed = false;

        onProgress?.(`Starting sync of ${offlineQuestionBanks.length} offline question banks...`);

        // We make a copy of the array to work on
        const banksToSync = [...offlineQuestionBanks];

        for (const bank of banksToSync) {
          try {
            onProgress?.(`Syncing "${bank.title}" to Neon...`);
            const res = await questionBankApi.syncOffline(bank.sync_payload);
            
            // On success, remove from offline store
            set((state) => ({
              offlineQuestionBanks: state.offlineQuestionBanks.filter((b) => b.id !== bank.id),
            }));
            syncedCount++;
          } catch (err: any) {
            console.error(`Failed to sync offline question bank ${bank.id}:`, err);
            set({ syncError: err.response?.data?.detail || err.message || 'Synchronization failed' });
            hasFailed = true;
            // Stop syncing the rest on failure
            break;
          }
        }

        set({ isSyncing: false });
        return { success: !hasFailed, syncedCount };
      },
    }),
    {
      name: 'offline-question-banks-storage', // localStorage key
    }
  )
);
