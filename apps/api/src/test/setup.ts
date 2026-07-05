import { jest } from '@jest/globals';

jest.setTimeout(15_000);

afterEach(() => {
  jest.restoreAllMocks();
});
