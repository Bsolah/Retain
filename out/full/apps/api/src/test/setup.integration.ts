import { jest } from '@jest/globals';
import { prisma } from '@retain/database';
import { cleanupTestData } from '../../../../seeds/test-data.js';

jest.setTimeout(60_000);

beforeAll(async () => {
  await prisma.$connect();
});

afterEach(async () => {
  await cleanupTestData();
  jest.restoreAllMocks();
});

afterAll(async () => {
  await cleanupTestData();
  await prisma.$disconnect();
});
