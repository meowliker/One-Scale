import { useStoreStore } from '@/stores/storeStore';
import { useConnectionStore } from '@/stores/connectionStore';
import toast from 'react-hot-toast';

const BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || '';

// Default client-side timeout: 20 seconds. Prevents hanging forever on slow/rate-limited APIs.
const DEFAULT_TIMEOUT_MS = 20_000;

// Custom error class for rate-limit responses (429)
export class RateLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RateLimitError';
  }
}

// Custom error class for client-side timeouts
export class TimeoutError extends Error {
  constructor(endpoint: string, timeoutMs: number) {
    super(`Request to ${endpoint} timed out after ${Math.round(timeoutMs / 1000)}s`);
    this.name = 'TimeoutError';
  }
}

interface RequestOptions extends RequestInit {
  params?: Record<string, string>;
  /** Client-side timeout in ms. Default: 20000 (20s). Set to 0 to disable. */
  timeoutMs?: number;
  /** Max retries on 429/5xx errors. Default: 3. Set to 0 to disable. */
  maxRetries?: number;
}

export async function apiClient<T>(
  endpoint: string,
  options: RequestOptions = {}
): Promise<T> {
  const { params, timeoutMs = DEFAULT_TIMEOUT_MS, maxRetries = 3, ...fetchOptions } = options;

  // Auto-include storeId from store
  const storeId = useStoreStore.getState().activeStoreId;

  let url = `${BASE_URL}${endpoint}`;
  const searchParams = new URLSearchParams(params || {});
  if (storeId && !searchParams.has('storeId')) {
    searchParams.set('storeId', storeId);
  }

  // Auto-include accountIds from mapped active Meta accounts
  if (!searchParams.has('accountIds')) {
    const activeAccountIds = useConnectionStore.getState().getActiveMetaAccountIds();
    if (activeAccountIds.length > 0) {
      searchParams.set('accountIds', activeAccountIds.join(','));
    }
  }

  const queryString = searchParams.toString();
  if (queryString) {
    url += `?${queryString}`;
  }

  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    // Wait before retrying (exponential backoff: 1s, 2s, 4s)
    if (attempt > 0) {
      const delay = Math.min(1000 * Math.pow(2, attempt - 1), 8000);
      console.log(`[API] Retry ${attempt}/${maxRetries} for ${endpoint} after ${delay}ms`);
      await new Promise((r) => setTimeout(r, delay));
    }

    // Client-side AbortController timeout to prevent hanging requests
    const controller = new AbortController();
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    let didTimeoutAbort = false;
    let didExternalAbort = false;
    if (timeoutMs > 0) {
      timeoutId = setTimeout(() => {
        didTimeoutAbort = true;
        controller.abort(new DOMException(`Timed out after ${timeoutMs}ms`, 'TimeoutError'));
      }, timeoutMs);
    }

    // Merge signals: if the caller also provided a signal, abort on either
    const existingSignal = fetchOptions.signal;
    if (existingSignal) {
      existingSignal.addEventListener(
        'abort',
        () => {
          didExternalAbort = true;
          const reason =
            typeof existingSignal.reason !== 'undefined'
              ? existingSignal.reason
              : new DOMException('Request aborted by caller', 'AbortError');
          controller.abort(reason);
        },
        { once: true }
      );
    }

    try {
      const response = await fetch(url, {
        headers: {
          'Content-Type': 'application/json',
          ...fetchOptions.headers,
        },
        cache: fetchOptions.cache ?? 'no-store',
        ...fetchOptions,
        signal: controller.signal,
      });

      if (timeoutId) clearTimeout(timeoutId);

      // Handle 401 — clear connection status and show reconnect toast (no retry)
      if (response.status === 401) {
        useConnectionStore.getState().reset();
        toast.error('Session expired. Please reconnect your account.');
        throw new Error('Unauthorized — please reconnect your account');
      }

      // Handle 429 / 5xx — retryable errors
      if (response.status === 429 || response.status >= 500) {
        lastError = new Error(`API error: ${response.status} ${response.statusText}`);
        if (attempt < maxRetries) continue; // retry
        // If 429 on final attempt, throw specific error
        if (response.status === 429) {
          throw new RateLimitError('Rate limited — please wait a moment and try again');
        }
        throw lastError;
      }

      if (!response.ok) {
        throw new Error(`API error: ${response.status} ${response.statusText}`);
      }

      return response.json();
    } catch (err) {
      if (timeoutId) clearTimeout(timeoutId);

      // Convert AbortError from timeout into a friendlier TimeoutError
      if (err instanceof DOMException && err.name === 'AbortError') {
        // If caller aborted (navigation/unmount/new request), don't retry.
        if (didExternalAbort && !didTimeoutAbort) {
          throw err;
        }
        // Timeout abort: convert to typed timeout and retry.
        lastError = new TimeoutError(endpoint, timeoutMs);
        if (attempt < maxRetries) continue;
        throw lastError;
      }

      // Don't retry non-retryable errors (401, 4xx, network errors other than timeout)
      if (err instanceof RateLimitError || (err instanceof Error && err.message.includes('Unauthorized'))) {
        throw err;
      }

      lastError = err;
      if (attempt < maxRetries) continue; // retry unexpected errors
      throw err;
    }
  }

  throw lastError;
}
