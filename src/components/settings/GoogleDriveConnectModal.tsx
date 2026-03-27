'use client';

import { useState, useEffect, useRef } from 'react';
import { X, Loader2, HardDrive, AlertCircle } from 'lucide-react';

interface Props {
  storeId: string;
  onSuccess: () => void;
  onClose: () => void;
}

export function GoogleDriveConnectModal({ storeId, onSuccess, onClose }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const popupRef = useRef<Window | null>(null);

  // Auto-open the popup when the modal mounts
  useEffect(() => {
    handleConnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Listen for OAuth popup callback
  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      if (event.origin !== window.location.origin) return;
      if (event.data?.type !== 'oauth_callback') return;
      if (event.data.platform !== 'google_drive') return;

      setLoading(false);
      if (event.data.status === 'connected') {
        onSuccess();
      } else {
        setError(event.data.message || 'Connection failed. Please check your credentials in Settings → API Credentials and try again.');
      }
    }

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [onSuccess]);

  // Clean up popup on unmount
  useEffect(() => {
    return () => {
      if (popupRef.current && !popupRef.current.closed) {
        popupRef.current.close();
      }
    };
  }, []);

  const handleConnect = () => {
    setError('');
    setLoading(true);

    const params = new URLSearchParams({ storeId });
    const url = `/api/auth/google-drive?${params.toString()}`;
    const width = 600;
    const height = 700;
    const left = window.screenX + (window.outerWidth - width) / 2;
    const top = window.screenY + (window.outerHeight - height) / 2;
    const popup = window.open(
      url,
      'google_drive_oauth',
      `width=${width},height=${height},left=${left},top=${top},scrollbars=yes`
    );

    if (!popup || popup.closed) {
      setLoading(false);
      setError('Popup was blocked. Please allow popups and try again.');
      return;
    }

    popupRef.current = popup;

    // Poll to detect if popup was closed without completing OAuth
    const pollTimer = setInterval(() => {
      if (popup.closed) {
        clearInterval(pollTimer);
        setLoading(false);
      }
    }, 1000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-sm rounded-2xl border border-border bg-surface-elevated shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#4285F4]/10">
              <HardDrive className="h-5 w-5 text-[#4285F4]" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-text-primary">Connect Google Drive</h2>
              <p className="text-xs text-text-secondary">Sign in with your Google account</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-text-secondary hover:bg-surface-hover hover:text-text-primary transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-4">
          {loading && !error && (
            <div className="flex flex-col items-center gap-3 py-4">
              <Loader2 className="h-8 w-8 animate-spin text-[#4285F4]" />
              <p className="text-sm text-text-secondary text-center">
                A Google sign-in popup has opened.<br />
                Complete the login to connect your Drive.
              </p>
            </div>
          )}

          {error && (
            <div className="flex items-start gap-2 rounded-lg bg-red-500/10 border border-red-500/20 p-3">
              <AlertCircle className="h-4 w-4 text-red-400 mt-0.5 shrink-0" />
              <p className="text-xs text-red-400">{error}</p>
            </div>
          )}

          {(error || !loading) && (
            <div className="flex gap-3">
              <button
                onClick={onClose}
                className="flex-1 rounded-lg border border-border px-4 py-2.5 text-sm font-medium text-text-secondary hover:bg-surface-hover transition-colors"
              >
                Cancel
              </button>
              {error && (
                <button
                  onClick={handleConnect}
                  disabled={loading}
                  className="flex-1 flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-50 transition-colors"
                >
                  Try Again
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
