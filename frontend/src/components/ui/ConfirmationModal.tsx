import { X, AlertTriangle } from 'lucide-react';
import { createPortal } from 'react-dom';

interface ConfirmationModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: () => void;
    title: string;
    message: string;
    confirmText?: string;
    cancelText?: string;
    isDangerous?: boolean;
    alertOnly?: boolean;
}

export default function ConfirmationModal({
    isOpen,
    onClose,
    onConfirm,
    title,
    message,
    confirmText,
    cancelText = 'Cancel',
    isDangerous = false,
    alertOnly = false,
}: ConfirmationModalProps) {
    if (!isOpen) return null;

    const resolvedConfirmText = confirmText || (alertOnly ? 'OK' : 'Confirm');

    return createPortal(
        <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white dark:bg-slate-900 rounded-2xl w-full max-w-md shadow-2xl shadow-pink-200/20 dark:shadow-purple-900/20 border-2 border-pink-200 dark:border-pink-700 transform transition-all scale-100 opacity-100 overflow-hidden relative">
                <div className="p-6 text-center">
                    <div className={`mx-auto w-14 h-14 rounded-full flex items-center justify-center mb-5 ${isDangerous
                        ? 'bg-rose-100 text-rose-600 dark:bg-rose-900/30 dark:text-rose-400'
                        : 'bg-gradient-to-br from-pink-100 to-purple-100 text-pink-600 dark:from-pink-900/40 dark:to-purple-900/40 dark:text-pink-400'
                        }`}>
                        <AlertTriangle className="w-7 h-7" />
                    </div>

                    <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-2">
                        {title}
                    </h3>

                    <p className="text-slate-600 dark:text-slate-300 text-sm mb-8 leading-relaxed">
                        {message}
                    </p>

                    <div className="flex gap-3 justify-center">
                        {!alertOnly && (
                            <button
                                onClick={onClose}
                                className="px-5 py-2.5 rounded-xl text-slate-800 bg-slate-200 hover:bg-slate-300 dark:bg-slate-700 dark:text-slate-100 dark:hover:bg-slate-600 font-semibold transition-colors flex-1"
                            >
                                {cancelText}
                            </button>
                        )}
                        <button
                            onClick={() => {
                                onConfirm();
                                onClose();
                            }}
                            className={`px-5 py-2.5 rounded-xl text-white font-semibold shadow-lg transition-all hover:scale-105 active:scale-95 flex-1 ${isDangerous
                                ? 'bg-gradient-to-r from-red-600 to-orange-600 shadow-rose-500/30 hover:from-red-700 hover:to-orange-700'
                                : 'bg-gradient-to-r from-pink-600 via-pink-500 to-purple-600 shadow-pink-500/30 hover:from-pink-700 hover:via-pink-600 hover:to-purple-700'
                                }`}
                        >
                            {resolvedConfirmText}
                        </button>
                    </div>
                </div>

                <button
                    onClick={onClose}
                    className="absolute top-4 right-4 p-1 rounded-full text-slate-400 hover:bg-pink-50 hover:text-pink-600 dark:hover:bg-slate-800 dark:hover:text-pink-400 transition-colors"
                >
                    <X className="w-5 h-5" />
                </button>
            </div>
        </div>,
        document.body
    );
}
