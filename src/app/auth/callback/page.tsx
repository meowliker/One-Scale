'use client';

import { useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

function CallbackContent() {
  const searchParams = useSearchParams();
  const platform = searchParams.get('platform');
  const status = searchParams.get('status');
  const message = searchParams.get('message');

  const isCredentialError = message?.includes('credentials not configured');

  useEffect(() => {
    // Send result to parent window (the integrations page) and close this popup
    if (window.opener) {
      window.opener.postMessage(
        {
          type: 'oauth_callback',
          platform,
          status,
          message,
        },
        window.location.origin
      );

      // Only auto-close on success; keep errors visible so user can read them
      if (status === 'connected') {
        setTimeout(() => {
          window.close();
        }, 500);
      }
    } else if (status === 'connected') {
      // Not opened as popup — redirect to integrations page with params
      const params = new URLSearchParams();
      if (platform && status) {
        params.set(platform, status);
        if (message) params.set('message', message);
      }
      window.location.href = `/dashboard/settings/integrations?${params.toString()}`;
    }
  }, [platform, status, message]);

  const isSuccess = status === 'connected';

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50">
      <div className="text-center space-y-4 p-8">
        {isSuccess ? (
          <>
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
              <svg className="h-8 w-8 text-green-600" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
              </svg>
            </div>
            <h2 className="text-lg font-semibold text-gray-900">
              {platform === 'meta' ? 'Meta Ads' : 'Shopify'} Connected!
            </h2>
            <p className="text-sm text-gray-500">This window will close automatically...</p>
          </>
        ) : (
          <>
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-amber-100">
              <svg className="h-8 w-8 text-amber-600" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                {isCredentialError ? (
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
                ) : (
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                )}
              </svg>
            </div>
            <h2 className="text-lg font-semibold text-gray-900">
              {isCredentialError ? 'Setup Required' : 'Connection Failed'}
            </h2>
            <p className="text-sm text-gray-500 max-w-sm">
              {isCredentialError
                ? `${platform === 'meta' ? 'Meta' : 'Shopify'} app credentials haven't been configured yet. Add your API credentials in Settings to connect.`
                : message || 'An error occurred during authentication.'}
            </p>
            <div className="flex items-center justify-center gap-3 mt-2">
              {isCredentialError && (
                <button
                  onClick={() => {
                    if (window.opener) {
                      window.opener.location.href = '/dashboard/settings/credentials';
                      window.close();
                    } else {
                      window.location.href = '/dashboard/settings/credentials';
                    }
                  }}
                  className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
                >
                  Go to Settings
                </button>
              )}
              <button
                onClick={() => window.close()}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Close
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default function AuthCallbackPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-gray-50">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-200 border-t-blue-600" />
        </div>
      }
    >
      <CallbackContent />
    </Suspense>
  );
}
