import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { afterEach, vi } from 'vitest';

afterEach(() => {
  cleanup();
});

vi.mock('@shopify/app-bridge-react', () => ({
  NavMenu: ({ children }: { children: ReactNode }) =>
    createElement('nav', { 'data-testid': 'nav-menu' }, children),
  Provider: ({ children }: { children: ReactNode }) =>
    createElement('div', { 'data-testid': 'app-bridge-provider' }, children),
  useAppBridge: () => ({}),
}));

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
