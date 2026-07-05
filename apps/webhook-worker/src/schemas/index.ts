import { z } from 'zod';

export const contractWebhookSchema = z
  .object({
    id: z.union([z.number(), z.string()]).optional(),
    admin_graphql_api_id: z.string().optional(),
    status: z.string().optional(),
    customer_id: z.union([z.number(), z.string()]).optional(),
    customer: z
      .object({
        id: z.union([z.number(), z.string()]).optional(),
        admin_graphql_api_id: z.string().optional(),
        email: z.string().optional(),
        first_name: z.string().optional(),
        last_name: z.string().optional(),
        phone: z.string().optional(),
      })
      .passthrough()
      .optional(),
    next_billing_date: z.string().optional(),
    billing_policy: z.record(z.unknown()).optional(),
    delivery_policy: z.record(z.unknown()).optional(),
    pricing_policy: z.record(z.unknown()).optional(),
    lines: z.array(z.unknown()).optional(),
  })
  .passthrough();

export const billingAttemptSchema = z
  .object({
    id: z.union([z.number(), z.string()]).optional(),
    admin_graphql_api_id: z.string().optional(),
    subscription_contract_id: z.union([z.number(), z.string()]).optional(),
    error_code: z.string().optional(),
    error_message: z.string().optional(),
    order_id: z.union([z.number(), z.string()]).optional(),
    amount: z.union([z.string(), z.number()]).optional(),
    currency: z.string().optional(),
  })
  .passthrough();

export const orderWebhookSchema = z
  .object({
    id: z.union([z.number(), z.string()]).optional(),
    admin_graphql_api_id: z.string().optional(),
    name: z.string().optional(),
    financial_status: z.string().optional(),
    cancel_reason: z.string().optional(),
    total_price: z.union([z.string(), z.number()]).optional(),
    currency: z.string().optional(),
    customer: z.record(z.unknown()).optional(),
  })
  .passthrough();

export const customerWebhookSchema = z
  .object({
    id: z.union([z.number(), z.string()]).optional(),
    admin_graphql_api_id: z.string().optional(),
    email: z.string().optional(),
    first_name: z.string().optional(),
    last_name: z.string().optional(),
    phone: z.string().optional(),
  })
  .passthrough();

export const productWebhookSchema = z
  .object({
    id: z.union([z.number(), z.string()]).optional(),
    admin_graphql_api_id: z.string().optional(),
    title: z.string().optional(),
    variants: z.array(z.record(z.unknown())).optional(),
  })
  .passthrough();

export const shopWebhookSchema = z
  .object({
    id: z.union([z.number(), z.string()]).optional(),
    domain: z.string().optional(),
    myshopify_domain: z.string().optional(),
  })
  .passthrough();

export const inventoryWebhookSchema = z
  .object({
    inventory_item_id: z.union([z.number(), z.string()]).optional(),
    location_id: z.union([z.number(), z.string()]).optional(),
    available: z.union([z.number(), z.string()]).optional(),
    updated_at: z.string().optional(),
  })
  .passthrough();

export const fulfillmentWebhookSchema = z
  .object({
    id: z.union([z.number(), z.string()]).optional(),
    admin_graphql_api_id: z.string().optional(),
    order_id: z.union([z.number(), z.string()]).optional(),
    status: z.string().optional(),
    tracking_number: z.string().optional(),
    tracking_company: z.string().optional(),
  })
  .passthrough();
