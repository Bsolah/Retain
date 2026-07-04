import type { Shop } from '@retain/database';
import {
  REQUIRED_WEBHOOK_TOPICS,
  type WebhookTopicGraphql,
} from '../constants/webhooks.js';
import { env } from '../env.js';
import { shopifyAdminGraphql } from './shopify-client.js';

const WEBHOOK_SUBSCRIBE_MUTATION = `#graphql
  mutation WebhookSubscriptionCreate(
    $topic: WebhookSubscriptionTopic!
    $callbackUrl: URL!
  ) {
    webhookSubscriptionCreate(
      topic: $topic
      webhookSubscription: { format: JSON, callbackUrl: $callbackUrl }
    ) {
      webhookSubscription {
        id
        topic
      }
      userErrors {
        field
        message
      }
    }
  }
`;

type SubscribeResult = {
  topic: WebhookTopicGraphql;
  rest: string;
  id?: string;
  error?: string;
};

function callbackUrlForTopic(restTopic: string): string {
  const base = env.SHOPIFY_APP_URL.replace(/\/$/, '');
  return `${base}/webhooks/shopify/${restTopic}`;
}

export async function subscribeRequiredWebhooks(
  shop: Shop,
): Promise<SubscribeResult[]> {
  const results: SubscribeResult[] = [];

  for (const topic of REQUIRED_WEBHOOK_TOPICS) {
    try {
      const data = await shopifyAdminGraphql<{
        webhookSubscriptionCreate: {
          webhookSubscription: { id: string; topic: string } | null;
          userErrors: Array<{ field: string[] | null; message: string }>;
        };
      }>(shop, WEBHOOK_SUBSCRIBE_MUTATION, {
        topic: topic.graphql,
        callbackUrl: callbackUrlForTopic(topic.rest),
      });

      const payload = data.webhookSubscriptionCreate;
      if (payload.userErrors.length > 0) {
        results.push({
          topic: topic.graphql,
          rest: topic.rest,
          error: payload.userErrors.map((error) => error.message).join('; '),
        });
        continue;
      }

      results.push({
        topic: topic.graphql,
        rest: topic.rest,
        id: payload.webhookSubscription?.id,
      });
    } catch (error) {
      results.push({
        topic: topic.graphql,
        rest: topic.rest,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  return results;
}
