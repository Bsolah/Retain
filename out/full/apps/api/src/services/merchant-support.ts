import { EventSource, prisma, type Shop } from '@retain/database';
import { env } from '../env.js';
import { shopifyAdminGraphql } from './shopify-client.js';

export const SUPPORT_CATEGORIES = [
  'bug',
  'question',
  'feature',
  'billing',
  'other',
] as const;

export type SupportCategory = (typeof SUPPORT_CATEGORIES)[number];

const CATEGORY_LABELS: Record<SupportCategory, string> = {
  bug: 'Bug or issue',
  question: 'Question',
  feature: 'Feature request',
  billing: 'Billing',
  other: 'Other',
};

export function isSupportCategory(value: string): value is SupportCategory {
  return (SUPPORT_CATEGORIES as readonly string[]).includes(value);
}

export function getSupportConfig() {
  return {
    inboxEmail: env.SUPPORT_INBOX_EMAIL || null,
    bookingUrl: env.SUPPORT_BOOKING_URL || null,
  };
}

export async function getMerchantSupportContext(shop: Shop) {
  let shopName = shop.shopifyDomain;
  let replyEmail = '';

  try {
    const data = await shopifyAdminGraphql<{
      shop: {
        name: string;
        email: string;
        contactEmail: string;
      };
    }>(
      shop,
      `#graphql
        query MerchantSupportShopContext {
          shop {
            name
            email
            contactEmail
          }
        }
      `,
    );

    shopName = data.shop.name || shopName;
    replyEmail = data.shop.contactEmail || data.shop.email || '';
  } catch {
    // Shop may have revoked token; form still works with manual email entry.
  }

  return {
    shopDomain: shop.shopifyDomain,
    shopName,
    replyEmail,
    ...getSupportConfig(),
  };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

async function deliverSupportEmail(options: {
  subject: string;
  text: string;
  html: string;
  replyTo: string;
}): Promise<{ sent: boolean; dryRun: boolean }> {
  const inbox = env.SUPPORT_INBOX_EMAIL.trim();
  if (!inbox) {
    console.info('[merchant-support] dry-run (SUPPORT_INBOX_EMAIL not set)', {
      subject: options.subject,
      replyTo: options.replyTo,
      text: options.text,
    });
    return { sent: false, dryRun: true };
  }

  if (!env.SENDGRID_API_KEY) {
    console.info('[merchant-support] dry-run (SENDGRID_API_KEY not set)', {
      to: inbox,
      subject: options.subject,
      replyTo: options.replyTo,
      text: options.text,
    });
    return { sent: false, dryRun: true };
  }

  const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${env.SENDGRID_API_KEY}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: inbox }] }],
      from: {
        email: env.SENDGRID_FROM_EMAIL,
        name: env.SENDGRID_FROM_NAME,
      },
      reply_to: { email: options.replyTo },
      subject: options.subject,
      content: [
        { type: 'text/plain', value: options.text },
        { type: 'text/html', value: options.html },
      ],
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `Failed to send support email (${response.status}): ${body}`,
    );
  }

  return { sent: true, dryRun: false };
}

export async function submitMerchantSupportRequest(
  shop: Shop,
  input: {
    category: SupportCategory;
    message: string;
    replyEmail: string;
    subject?: string;
    pageUrl?: string;
  },
): Promise<{ ok: true; sent: boolean; dryRun: boolean }> {
  const message = input.message.trim();
  const replyEmail = input.replyEmail.trim().toLowerCase();

  if (!message || message.length < 10) {
    throw new Error('Please enter a message with at least 10 characters');
  }

  if (!replyEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(replyEmail)) {
    throw new Error('Please enter a valid reply email address');
  }

  const categoryLabel = CATEGORY_LABELS[input.category];
  const subject =
    input.subject?.trim() ||
    `[Retain] ${categoryLabel} — ${shop.shopifyDomain}`;

  const text = [
    `Category: ${categoryLabel}`,
    `Shop: ${shop.shopifyDomain}`,
    `Reply to: ${replyEmail}`,
    input.pageUrl ? `Page: ${input.pageUrl}` : null,
    '',
    message,
  ]
    .filter(Boolean)
    .join('\n');

  const html = `
    <p><strong>Category:</strong> ${escapeHtml(categoryLabel)}</p>
    <p><strong>Shop:</strong> ${escapeHtml(shop.shopifyDomain)}</p>
    <p><strong>Reply to:</strong> ${escapeHtml(replyEmail)}</p>
    ${input.pageUrl ? `<p><strong>Page:</strong> ${escapeHtml(input.pageUrl)}</p>` : ''}
    <hr />
    <p>${escapeHtml(message).replace(/\n/g, '<br/>')}</p>
  `;

  const delivery = await deliverSupportEmail({
    subject,
    text,
    html,
    replyTo: replyEmail,
  });

  await prisma.event.create({
    data: {
      shopId: shop.id,
      eventType: 'merchant.support_request',
      eventSubtype: input.category,
      source: EventSource.merchant,
      payload: {
        category: input.category,
        replyEmail,
        subject,
        pageUrl: input.pageUrl ?? null,
        messagePreview: message.slice(0, 500),
        sent: delivery.sent,
        dryRun: delivery.dryRun,
      },
    },
  });

  return { ok: true, ...delivery };
}
