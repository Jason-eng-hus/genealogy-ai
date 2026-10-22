import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

// jsdom 30 exposes its own AbortController while Node 24 keeps the native
// Request, and react-router 6 navigations pass the jsdom signal into the
// native Request constructor. Dropping the signal keeps memory-router
// navigations working in tests; none of the tested routes load data.
const NativeRequest = globalThis.Request;

if (typeof NativeRequest === 'function') {
  class TestRequest extends NativeRequest {
    constructor(input: RequestInfo | URL, init?: RequestInit) {
      super(
        input,
        init === undefined ? undefined : { ...init, signal: undefined },
      );
    }
  }

  Object.defineProperty(globalThis, 'Request', {
    configurable: true,
    writable: true,
    value: TestRequest,
  });
}

afterEach(() => {
  cleanup();
});

if (typeof window.matchMedia !== 'function') {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}

if (typeof globalThis.ResizeObserver === 'undefined') {
  class ResizeObserverMock {
    observe(): void {}

    unobserve(): void {}

    disconnect(): void {}
  }

  Object.defineProperty(globalThis, 'ResizeObserver', {
    writable: true,
    value: ResizeObserverMock,
  });
}

Object.defineProperty(window, 'scrollTo', {
  writable: true,
  value: vi.fn(),
});
