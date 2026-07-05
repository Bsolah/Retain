import { jest } from '@jest/globals';
import { prisma, ShopStatus } from '@retain/database';
import { buildShop } from '../../../../../../factories/shop.js';

const { validateSessionToken, generateSessionToken } =
  await import('../../../middleware/session.js');

const mockShop = buildShop();

describe('Session middleware', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
    jest.spyOn(prisma.shop, 'findUnique').mockResolvedValue(mockShop);
  });

  function createMockRequest(jwtVerifyImpl?: () => Promise<unknown>) {
    return {
      jwtVerify:
        jwtVerifyImpl ??
        jest.fn().mockResolvedValue({
          shopId: mockShop.id,
          shopifyDomain: mockShop.shopifyDomain,
          shopifyShopId: mockShop.shopifyShopId,
          sub: mockShop.id,
          aud: 'retain-admin',
          iss: 'retain-api',
        }),
      server: {
        jwt: {
          sign: jest.fn().mockReturnValue('signed-session-token'),
        },
      },
    } as unknown as Parameters<typeof validateSessionToken>[0];
  }

  function createMockReply() {
    return {
      status: jest.fn().mockReturnThis(),
      send: jest.fn().mockReturnThis(),
    } as unknown as Parameters<typeof validateSessionToken>[1];
  }

  describe('generateSessionToken', () => {
    it('signs JWT with shop payload and 15-minute TTL', async () => {
      const request = createMockRequest();
      const token = await generateSessionToken(request, mockShop);

      expect(token).toBe('signed-session-token');
      expect(request.server.jwt.sign).toHaveBeenCalledWith(
        expect.objectContaining({
          shopId: mockShop.id,
          aud: 'retain-admin',
        }),
        { expiresIn: 900 },
      );
    });
  });

  describe('validateSessionToken', () => {
    it('accepts valid token and attaches shop', async () => {
      const request = createMockRequest();
      const reply = createMockReply();

      const ok = await validateSessionToken(request, reply);

      expect(ok).toBe(true);
      expect(request.shop).toEqual(mockShop);
    });

    it('rejects invalid audience', async () => {
      const request = createMockRequest(async () => ({
        shopId: mockShop.id,
        aud: 'wrong-audience',
      }));
      const reply = createMockReply();

      expect(await validateSessionToken(request, reply)).toBe(false);
      expect(reply.status).toHaveBeenCalledWith(401);
    });

    it('rejects inactive shop', async () => {
      jest
        .spyOn(prisma.shop, 'findUnique')
        .mockResolvedValue(buildShop({ status: ShopStatus.uninstalled }));

      const request = createMockRequest();
      const reply = createMockReply();

      expect(await validateSessionToken(request, reply)).toBe(false);
    });
  });
});
