import React, { useState, useEffect } from 'react';
import Icon from './common/Icon';

interface SyncOverlayProps {
  isVisible: boolean;
  message?: string;
  onRetry?: () => void;
  onDismiss?: () => void;
}

const SYNC_MESSAGES = [
  "Preparing Workspace...",
  "Synchronizing Data...",
  "Loading Business Information...",
  "Almost Ready..."
];

const SyncOverlay: React.FC<SyncOverlayProps> = ({
  isVisible,
  message,
  onRetry,
  onDismiss
}) => {
  const [msgIndex, setMsgIndex] = useState(0);
  const [showTimeoutWarning, setShowTimeoutWarning] = useState(false);

  // Rotate messages every 2.5 seconds while visible
  useEffect(() => {
    if (!isVisible) {
      setMsgIndex(0);
      setShowTimeoutWarning(false);
      return;
    }

    const interval = setInterval(() => {
      setMsgIndex((prev) => (prev + 1) % SYNC_MESSAGES.length);
    }, 2500);

    // Timeout fallback after 10s to ensure app never gets stuck
    const timeout = setTimeout(() => {
      setShowTimeoutWarning(true);
    }, 10000);

    return () => {
      clearInterval(interval);
      clearTimeout(timeout);
    };
  }, [isVisible]);

  if (!isVisible) return null;

  const currentMessage = message || SYNC_MESSAGES[msgIndex];

  return (
    <div className="fixed inset-0 z-[9999] bg-slate-900/70 backdrop-blur-md flex flex-col items-center justify-center p-4 select-none animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-sm w-full flex flex-col items-center border border-gray-100 text-center relative overflow-hidden animate-in zoom-in-95 duration-200">
        
        {/* Top Accent Line */}
        <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-primary-500 via-emerald-500 to-primary-600 animate-pulse" />

        {/* Center Spinner Icon */}
        <div className="relative mb-6 mt-2">
          {/* Pulsing Outer Aura */}
          <div className="absolute -inset-2 rounded-full bg-primary-500/20 animate-ping opacity-75" />
          <div className="relative bg-primary-50 border border-primary-200 text-primary-600 w-16 h-16 rounded-2xl flex items-center justify-center shadow-inner">
            <Icon name="repeat" className="w-8 h-8 animate-spin text-primary-600" />
          </div>
        </div>

        {/* Title */}
        <h3 className="text-lg font-black text-gray-900 uppercase tracking-tight mb-1">
          CraveBiZ AI
        </h3>

        {/* Dynamic Phase Message */}
        <div className="flex items-center justify-center gap-2 mb-4">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
          <p className="text-xs font-bold text-gray-600 tracking-wide transition-all duration-300">
            {currentMessage}
          </p>
        </div>

        {/* Progress Bar Animation */}
        <div className="w-full bg-gray-100 h-1.5 rounded-full overflow-hidden mb-4">
          <div className="h-full bg-gradient-to-r from-primary-500 to-emerald-500 rounded-full w-2/3 animate-[pulse_1.5s_ease-in-out_infinite]" />
        </div>

        <p className="text-[11px] text-gray-400 font-medium">
          Please wait while we secure and verify your records on the system.
        </p>

        {/* Timeout / Graceful Recovery if Sync Takes Longer Than Expected */}
        {showTimeoutWarning && (
          <div className="mt-5 pt-4 border-t border-gray-100 w-full animate-in fade-in duration-300">
            <p className="text-[11px] text-amber-700 bg-amber-50 p-2.5 rounded-xl border border-amber-200 font-medium mb-3">
              Synchronization is taking longer than usual. You can retry or proceed directly.
            </p>
            <div className="flex gap-2 w-full">
              {onRetry && (
                <button
                  type="button"
                  onClick={onRetry}
                  className="flex-1 py-2 px-3 bg-primary-600 hover:bg-primary-700 text-white rounded-xl text-xs font-bold transition shadow-sm"
                >
                  Retry Sync
                </button>
              )}
              {onDismiss && (
                <button
                  type="button"
                  onClick={onDismiss}
                  className="flex-1 py-2 px-3 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl text-xs font-bold transition"
                >
                  Proceed
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default SyncOverlay;
