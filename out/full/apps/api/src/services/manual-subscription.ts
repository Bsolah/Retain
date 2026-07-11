import {
  ContractStatus,
  EventSource,
  OrderStatus,
  Prisma,
  prisma,
  type Shop,
} from '@retain/database';
import { randomUUID } from 'node:crypto';
import { shopifyAdminGraphql } from './shopify-client.js';
import { logEvent } from './events.js';

const INTERVAL_MAP = {
  day: 'DAY',
  week: 'WEEK',
  month: 'MONTH',
  year: 'YEAR',
} as const;

export type ManualSubscriptionAddress = {
  firstName: string;
  lastName: string;
  address1: string;
  address2?: string;
  city: string;
  province: string;
  country: string;
  zip: string;
  phone?: string;
};

export type ManualSubscriptionLine = {
  variantId: string;
  quantity: number;
  price: string;
  title?: string;
};

export type ManualSubscriptionInput = {
  customer: {
    email: string;
    firstName: string;
    lastName: string;
    phone?: string;
  };
  billingAddress: ManualSubscriptionAddress;
  shippingSameAsBilling: boolean;
  shippingAddress?: ManualSubscriptionAddress;
  planId: string;
  frequencyIndex: number;
  lines: ManualSubscriptionLine[];
  chargeTiming: 'now' | 'future';
  nextBillingDate?: string;
  paymentMode?: 'saved_card' | 'payment_link';
  paymentMethodId?: string;
  createUnpaidOrder?: boolean;
  sendPaymentLinkEmail?: boolean;
  deliveryPrice?: number;
  currencyCode?: string;
};

type ShopifyAddress = ManualSubscriptionAddress;

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

export function parseManualSubscriptionInput(
  raw: unknown,
): ManualSubscriptionInput {
  if (!raw || typeof raw !== 'object') {
    throw new Error('Invalid subscription payload');
  }

  const body = raw as Record<string, unknown>;
  const customer = body.customer as Record<string, unknown> | undefined;
  const billingAddress = body.billingAddress as
    Record<string, unknown> | undefined;

  if (
    !customer ||
    !isNonEmptyString(customer.email) ||
    !isNonEmptyString(customer.firstName) ||
    !isNonEmptyString(customer.lastName)
  ) {
    throw new Error('Customer name and email are required');
  }

  if (
    !billingAddress ||
    !isNonEmptyString(billingAddress.firstName) ||
    !isNonEmptyString(billingAddress.lastName) ||
    !isNonEmptyString(billingAddress.address1) ||
    !isNonEmptyString(billingAddress.city) ||
    !isNonEmptyString(billingAddress.province) ||
    !isNonEmptyString(billingAddress.country) ||
    !isNonEmptyString(billingAddress.zip)
  ) {
    throw new Error('Billing address is incomplete');
  }

  const lines = Array.isArray(body.lines) ? body.lines : [];
  if (lines.length === 0) {
    throw new Error('At least one product line is required');
  }

  const parsedLines: ManualSubscriptionLine[] = lines.map((line, index) => {
    const record = line as Record<string, unknown>;
    if (
      !isNonEmptyString(record.variantId) ||
      !isNonEmptyString(record.price) ||
      Number(record.quantity) < 1
    ) {
      throw new Error(`Invalid product line at index ${index}`);
    }
    return {
      variantId: record.variantId,
      quantity: Number(record.quantity),
      price: record.price,
      title:
        typeof record.title === 'string' && record.title.length > 0
          ? record.title
          : undefined,
    };
  });

  const chargeTiming = body.chargeTiming === 'future' ? 'future' : 'now';
  const frequencyIndex = Number(body.frequencyIndex ?? 0);
  const paymentMode =
    body.paymentMode === 'payment_link' ? 'payment_link' : 'saved_card';
  const sendPaymentLinkEmail = body.sendPaymentLinkEmail !== false;
  const deliveryPriceRaw = body.deliveryPrice;
  const deliveryPrice =
    deliveryPriceRaw === undefined ||
    deliveryPriceRaw === null ||
    deliveryPriceRaw === ''
      ? 0
      : Number(deliveryPriceRaw);
  if (!Number.isFinite(deliveryPrice) || deliveryPrice < 0) {
    throw new Error('Delivery price must be a non-negative number');
  }

  if (!isNonEmptyString(body.planId)) {
    throw new Error('Plan is required');
  }
  if (!Number.isInteger(frequencyIndex) || frequencyIndex < 0) {
    throw new Error('Invalid frequency selection');
  }

  const shippingSameAsBilling = body.shippingSameAsBilling !== false;
  const shippingAddressRaw = body.shippingAddress as
    Record<string, unknown> | undefined;

  return {
    customer: {
      email: customer.email.trim(),
      firstName: customer.firstName.trim(),
      lastName: customer.lastName.trim(),
      phone:
        typeof customer.phone === 'string' && customer.phone.trim().length > 0
          ? customer.phone.trim()
          : undefined,
    },
    billingAddress: {
      firstName: billingAddress.firstName.trim(),
      lastName: billingAddress.lastName.trim(),
      address1: billingAddress.address1.trim(),
      address2:
        typeof billingAddress.address2 === 'string'
          ? billingAddress.address2.trim()
          : undefined,
      city: billingAddress.city.trim(),
      province: billingAddress.province.trim(),
      country: billingAddress.country.trim(),
      zip: billingAddress.zip.trim(),
      phone:
        typeof billingAddress.phone === 'string' &&
        billingAddress.phone.trim().length > 0
          ? billingAddress.phone.trim()
          : undefined,
    },
    shippingSameAsBilling,
    shippingAddress:
      !shippingSameAsBilling && shippingAddressRaw
        ? {
            firstName: String(shippingAddressRaw.firstName ?? ''),
            lastName: String(shippingAddressRaw.lastName ?? ''),
            address1: String(shippingAddressRaw.address1 ?? ''),
            address2:
              typeof shippingAddressRaw.address2 === 'string'
                ? shippingAddressRaw.address2
                : undefined,
            city: String(shippingAddressRaw.city ?? ''),
            province: String(shippingAddressRaw.province ?? ''),
            country: String(shippingAddressRaw.country ?? ''),
            zip: String(shippingAddressRaw.zip ?? ''),
            phone:
              typeof shippingAddressRaw.phone === 'string'
                ? shippingAddressRaw.phone
                : undefined,
          }
        : undefined,
    planId: body.planId.trim(),
    frequencyIndex,
    lines: parsedLines,
    chargeTiming,
    nextBillingDate:
      typeof body.nextBillingDate === 'string'
        ? body.nextBillingDate
        : undefined,
    paymentMode: chargeTiming === 'now' ? paymentMode : undefined,
    paymentMethodId:
      typeof body.paymentMethodId === 'string'
        ? body.paymentMethodId
        : undefined,
    createUnpaidOrder:
      body.createUnpaidOrder === true || paymentMode === 'payment_link',
    sendPaymentLinkEmail,
    deliveryPrice,
    currencyCode:
      typeof body.currencyCode === 'string' && body.currencyCode.length === 3
        ? body.currencyCode.toUpperCase()
        : 'USD',
  };
}

const CUSTOMER_BY_EMAIL_QUERY = `#graphql
  query CustomerByEmail($query: String!) {
    customers(first: 1, query: $query) {
      edges {
        node {
          id
          email
          firstName
          lastName
          phone
          paymentMethods(first: 10) {
            edges {
              node {
                id
                revokedAt
                instrument {
                  ... on CustomerCreditCard {
                    brand
                    lastDigits
                    expiryMonth
                    expiryYear
                    name
                  }
                  ... on CustomerShopPayAgreement {
                    lastDigits
                    expiryMonth
                    expiryYear
                  }
                }
              }
            }
          }
        }
      }
    }
  }
`;

const CUSTOMER_CREATE_MUTATION = `#graphql
  mutation ManualCustomerCreate($input: CustomerInput!) {
    customerCreate(input: $input) {
      customer { id email }
      userErrors { field message }
    }
  }
`;

const SELLING_PLAN_GROUP_QUERY = `#graphql
  query SellingPlanGroupPlans($id: ID!) {
    sellingPlanGroup(id: $id) {
      id
      sellingPlans(first: 25) {
        edges {
          node {
            id
            name
            billingPolicy {
              ... on SellingPlanRecurringBillingPolicy {
                interval
                intervalCount
              }
            }
            deliveryPolicy {
              ... on SellingPlanRecurringDeliveryPolicy {
                interval
                intervalCount
              }
            }
          }
        }
      }
    }
  }
`;

const ATOMIC_CREATE_MUTATION = `#graphql
  mutation SubscriptionContractAtomicCreate(
    $input: SubscriptionContractAtomicCreateInput!
  ) {
    subscriptionContractAtomicCreate(input: $input) {
      contract {
        id
        status
        nextBillingDate
        lines(first: 20) {
          edges {
            node {
              id
              quantity
              title
              variantId
              sellingPlanId
            }
          }
        }
      }
      userErrors {
        field
        message
      }
    }
  }
`;

const BILLING_ATTEMPT_MUTATION = `#graphql
  mutation ManualBillingAttempt(
    $subscriptionContractId: ID!
    $subscriptionBillingAttemptInput: SubscriptionBillingAttemptInput!
  ) {
    subscriptionBillingAttemptCreate(
      subscriptionContractId: $subscriptionContractId
      subscriptionBillingAttemptInput: $subscriptionBillingAttemptInput
    ) {
      subscriptionBillingAttempt {
        id
        ready
        nextActionUrl
        order {
          id
          name
        }
        errorMessage
      }
      userErrors {
        field
        message
      }
    }
  }
`;

const BILLING_ATTEMPT_STATUS_QUERY = `#graphql
  query ManualBillingAttemptStatus($id: ID!) {
    subscriptionBillingAttempt(id: $id) {
      id
      ready
      nextActionUrl
      errorMessage
      order {
        id
        name
      }
    }
  }
`;

const ORDER_PAYMENT_QUERY = `#graphql
  query ManualOrderPayment($id: ID!) {
    order(id: $id) {
      id
      name
      statusPageUrl
      displayFinancialStatus
      paymentCollectionDetails {
        additionalPaymentCollectionUrl
      }
    }
  }
`;

const SHOP_CONTACT_QUERY = `#graphql
  query ManualSubscriptionShopContact {
    shop {
      name
      email
      contactEmail
    }
  }
`;

const VARIANT_INVENTORY_QUERY = `#graphql
  query ManualSubscriptionVariantInventory($id: ID!) {
    productVariant(id: $id) {
      id
      inventoryItem {
        id
        inventoryLevels(first: 10) {
          edges {
            node {
              location {
                id
              }
            }
          }
        }
      }
    }
  }
`;

const CATALOG_LOCATION_QUERY = `#graphql
  query ManualSubscriptionCatalogLocation {
    products(first: 10, query: "status:active") {
      edges {
        node {
          variants(first: 5) {
            edges {
              node {
                inventoryItem {
                  inventoryLevels(first: 1) {
                    edges {
                      node {
                        location {
                          id
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  }
`;

const INVENTORY_ACTIVATE_MUTATION = `#graphql
  mutation ManualSubscriptionInventoryActivate(
    $inventoryItemId: ID!
    $inventoryItemUpdates: [InventoryBulkToggleActivationInput!]!
  ) {
    inventoryBulkToggleActivation(
      inventoryItemId: $inventoryItemId
      inventoryItemUpdates: $inventoryItemUpdates
    ) {
      userErrors {
        field
        message
      }
    }
  }
`;

const ORDER_INVOICE_SEND_MUTATION = `#graphql
  mutation ManualOrderInvoiceSend($orderId: ID!, $email: EmailInput) {
    orderInvoiceSend(id: $orderId, email: $email) {
      order {
        id
      }
      userErrors {
        message
      }
    }
  }
`;

const CONTRACT_SYNC_QUERY = `#graphql
  query ManualContractSync($id: ID!) {
    subscriptionContract(id: $id) {
      id
      status
      nextBillingDate
      currencyCode
      billingPolicy {
        interval
        intervalCount
        maxCycles
        minCycles
      }
      deliveryPolicy {
        interval
        intervalCount
      }
      customer {
        id
      }
      lines(first: 20) {
        edges {
          node {
            quantity
            title
            productId
            variantId
            sellingPlanId
            currentPrice {
              amount
            }
          }
        }
      }
    }
  }
`;

function toMailingAddress(address: ShopifyAddress) {
  return {
    firstName: address.firstName,
    lastName: address.lastName,
    address1: address.address1,
    address2: address.address2 ?? undefined,
    city: address.city,
    province: address.province,
    country: address.country,
    zip: address.zip,
    phone: address.phone ?? undefined,
  };
}

const BILLING_POLL_INTERVAL_MS = 2_000;
const BILLING_POLL_MAX_ATTEMPTS = 15;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

type BillingAttemptSnapshot = {
  id: string;
  ready: boolean;
  nextActionUrl: string | null;
  errorMessage: string | null;
  order: { id: string; name: string | null } | null;
};

async function fetchBillingAttemptSnapshot(
  shop: Shop,
  attemptId: string,
): Promise<BillingAttemptSnapshot | null> {
  const data = await shopifyAdminGraphql<{
    subscriptionBillingAttempt: BillingAttemptSnapshot | null;
  }>(shop, BILLING_ATTEMPT_STATUS_QUERY, { id: attemptId });

  return data.subscriptionBillingAttempt;
}

async function pollBillingAttemptForOrder(
  shop: Shop,
  attemptId: string,
): Promise<BillingAttemptSnapshot | null> {
  for (let attempt = 0; attempt < BILLING_POLL_MAX_ATTEMPTS; attempt += 1) {
    const snapshot = await fetchBillingAttemptSnapshot(shop, attemptId);
    if (!snapshot) return null;
    if (snapshot.errorMessage) {
      if (/inventory location/i.test(snapshot.errorMessage)) {
        throw new Error(
          `${snapshot.errorMessage} Assign the product to an active fulfillment location in Shopify Admin → Products → Inventory, then try again.`,
        );
      }
      throw new Error(snapshot.errorMessage);
    }
    if (snapshot.order?.id) {
      return snapshot;
    }
    if (snapshot.ready) {
      return snapshot;
    }
    await sleep(BILLING_POLL_INTERVAL_MS);
  }

  return fetchBillingAttemptSnapshot(shop, attemptId);
}

async function resolveOrderPaymentLink(
  shop: Shop,
  orderGid: string,
  nextActionUrl: string | null,
): Promise<string | null> {
  const orderPayment = await shopifyAdminGraphql<{
    order: {
      id: string;
      name: string;
      statusPageUrl: string | null;
      paymentCollectionDetails: {
        additionalPaymentCollectionUrl: string | null;
      } | null;
    } | null;
  }>(shop, ORDER_PAYMENT_QUERY, { id: orderGid });

  return (
    orderPayment.order?.paymentCollectionDetails
      ?.additionalPaymentCollectionUrl ??
    nextActionUrl ??
    orderPayment.order?.statusPageUrl ??
    null
  );
}

async function sendOrderPaymentInvoice(
  shop: Shop,
  orderGid: string,
  input: ManualSubscriptionInput,
  shopifyOrderName: string | null,
  paymentLink: string | null,
): Promise<boolean> {
  const shopContact = await shopifyAdminGraphql<{
    shop: { name: string; email: string; contactEmail: string };
  }>(shop, SHOP_CONTACT_QUERY);

  const fromEmail =
    shopContact.shop.contactEmail.trim() || shopContact.shop.email.trim();
  const from =
    fromEmail.length > 0
      ? `${shopContact.shop.name} <${fromEmail}>`
      : undefined;

  const customMessage = paymentLink
    ? `Hi ${input.customer.firstName},\n\nPlease complete payment for your subscription order using this secure link:\n${paymentLink}`
    : `Hi ${input.customer.firstName},\n\nPlease complete payment for your subscription order.`;

  const invoiceResult = await shopifyAdminGraphql<{
    orderInvoiceSend: {
      order: { id: string } | null;
      userErrors: Array<{ message: string }>;
    };
  }>(shop, ORDER_INVOICE_SEND_MUTATION, {
    orderId: orderGid,
    email: {
      to: input.customer.email,
      ...(from ? { from } : {}),
      subject: `Complete payment for ${shopifyOrderName ?? 'your subscription order'}`,
      customMessage,
    },
  });

  if (invoiceResult.orderInvoiceSend.userErrors.length > 0) {
    throw new Error(
      invoiceResult.orderInvoiceSend.userErrors
        .map((error) => error.message)
        .join('; '),
    );
  }

  return true;
}

async function resolveFulfillmentLocationId(
  shop: Shop,
  lines: ManualSubscriptionLine[],
): Promise<string> {
  const locationIds = new Set<string>();
  const variantIds = [...new Set(lines.map((line) => line.variantId))];

  for (const variantId of variantIds) {
    const variantData = await shopifyAdminGraphql<{
      productVariant: {
        inventoryItem: {
          inventoryLevels: {
            edges: Array<{ node: { location: { id: string } } }>;
          };
        } | null;
      } | null;
    }>(shop, VARIANT_INVENTORY_QUERY, { id: variantId });

    for (const edge of variantData.productVariant?.inventoryItem
      ?.inventoryLevels.edges ?? []) {
      locationIds.add(edge.node.location.id);
    }
  }

  if (locationIds.size === 0) {
    const catalogData = await shopifyAdminGraphql<{
      products: {
        edges: Array<{
          node: {
            variants: {
              edges: Array<{
                node: {
                  inventoryItem: {
                    inventoryLevels: {
                      edges: Array<{ node: { location: { id: string } } }>;
                    };
                  } | null;
                };
              }>;
            };
          };
        }>;
      };
    }>(shop, CATALOG_LOCATION_QUERY);

    for (const productEdge of catalogData.products.edges) {
      for (const variantEdge of productEdge.node.variants.edges) {
        for (const levelEdge of variantEdge.node.inventoryItem?.inventoryLevels
          .edges ?? []) {
          locationIds.add(levelEdge.node.location.id);
        }
      }
    }
  }

  const locationId = [...locationIds][0];
  if (!locationId) {
    throw new Error(
      'No inventory location is available for these products. In Shopify Admin, open the product → Inventory → assign it to a location with “Fulfill online orders” enabled.',
    );
  }

  return locationId;
}

async function ensureFulfillmentInventory(
  shop: Shop,
  lines: ManualSubscriptionLine[],
): Promise<void> {
  const locationId = await resolveFulfillmentLocationId(shop, lines);
  const variantIds = [...new Set(lines.map((line) => line.variantId))];

  for (const variantId of variantIds) {
    const variantData = await shopifyAdminGraphql<{
      productVariant: {
        inventoryItem: { id: string } | null;
      } | null;
    }>(shop, VARIANT_INVENTORY_QUERY, { id: variantId });

    const inventoryItemId = variantData.productVariant?.inventoryItem?.id;
    if (!inventoryItemId) {
      continue;
    }

    const activateResult = await shopifyAdminGraphql<{
      inventoryBulkToggleActivation: {
        userErrors: Array<{ message: string }>;
      };
    }>(shop, INVENTORY_ACTIVATE_MUTATION, {
      inventoryItemId,
      inventoryItemUpdates: [{ locationId, activate: true }],
    });

    const errors = activateResult.inventoryBulkToggleActivation.userErrors;
    if (errors.length > 0) {
      const message = errors.map((error) => error.message).join('; ');
      if (!/already|active/i.test(message)) {
        throw new Error(message);
      }
    }
  }
}

function mapContractStatus(status: string | null | undefined): ContractStatus {
  const normalized = (status ?? 'active').toLowerCase().replace(/-/g, '_');
  switch (normalized) {
    case 'paused':
      return ContractStatus.paused;
    case 'cancelled':
    case 'canceled':
      return ContractStatus.cancelled;
    case 'expired':
      return ContractStatus.expired;
    case 'failed':
    case 'payment_failed':
      return ContractStatus.payment_failed;
    default:
      return ContractStatus.active;
  }
}

export async function lookupCustomerForManualSubscription(
  shop: Shop,
  email: string,
) {
  const data = await shopifyAdminGraphql<{
    customers: {
      edges: Array<{
        node: {
          id: string;
          email: string | null;
          firstName: string | null;
          lastName: string | null;
          phone: string | null;
          paymentMethods: {
            edges: Array<{
              node: {
                id: string;
                revokedAt: string | null;
                instrument: Record<string, unknown> | null;
              };
            }>;
          };
        };
      }>;
    };
  }>(shop, CUSTOMER_BY_EMAIL_QUERY, { query: `email:${email}` });

  const node = data.customers.edges[0]?.node;
  if (!node) {
    return { found: false as const, customer: null, paymentMethods: [] };
  }

  const paymentMethods = node.paymentMethods.edges
    .filter((edge) => !edge.node.revokedAt)
    .map((edge) => {
      const instrument = edge.node.instrument ?? {};
      return {
        id: edge.node.id,
        brand: typeof instrument.brand === 'string' ? instrument.brand : 'card',
        lastDigits:
          typeof instrument.lastDigits === 'string'
            ? instrument.lastDigits
            : '****',
        expiryMonth:
          typeof instrument.expiryMonth === 'number'
            ? instrument.expiryMonth
            : null,
        expiryYear:
          typeof instrument.expiryYear === 'number'
            ? instrument.expiryYear
            : null,
        name: typeof instrument.name === 'string' ? instrument.name : null,
      };
    });

  return {
    found: true as const,
    customer: {
      shopifyCustomerId: node.id,
      email: node.email ?? email,
      firstName: node.firstName,
      lastName: node.lastName,
      phone: node.phone,
    },
    paymentMethods,
  };
}

async function ensureShopifyCustomer(
  shop: Shop,
  input: ManualSubscriptionInput,
  shippingAddress: ShopifyAddress,
): Promise<string> {
  const lookup = await lookupCustomerForManualSubscription(
    shop,
    input.customer.email,
  );
  if (lookup.found) {
    return lookup.customer!.shopifyCustomerId;
  }

  const result = await shopifyAdminGraphql<{
    customerCreate: {
      customer: { id: string } | null;
      userErrors: Array<{ message: string }>;
    };
  }>(shop, CUSTOMER_CREATE_MUTATION, {
    input: {
      email: input.customer.email,
      firstName: input.customer.firstName,
      lastName: input.customer.lastName,
      phone: input.customer.phone ?? input.billingAddress.phone,
      addresses: [toMailingAddress(shippingAddress)],
    },
  });

  if (result.customerCreate.userErrors.length > 0) {
    throw new Error(
      result.customerCreate.userErrors.map((error) => error.message).join('; '),
    );
  }

  const customerGid = result.customerCreate.customer?.id;
  if (!customerGid) {
    throw new Error('Shopify did not return a customer id');
  }

  return customerGid;
}

async function resolveSellingPlanId(
  shop: Shop,
  planId: string,
  frequencyIndex: number,
): Promise<{
  sellingPlanId: string;
  billingPolicy: Record<string, unknown>;
  deliveryPolicy: Record<string, unknown>;
}> {
  const plan = await prisma.subscriptionPlan.findFirst({
    where: { id: planId, shopId: shop.id },
  });

  if (!plan?.shopifySellingPlanGroupId) {
    throw new Error('Selected plan is not synced to Shopify selling plans');
  }

  const frequencies = Array.isArray(plan.frequencies)
    ? (plan.frequencies as Array<{
        interval: number;
        unit: string;
        discountPercent?: number;
      }>)
    : [];

  const frequency = frequencies[frequencyIndex];
  if (!frequency) {
    throw new Error('Invalid billing frequency selection');
  }

  const data = await shopifyAdminGraphql<{
    sellingPlanGroup: {
      sellingPlans: {
        edges: Array<{
          node: {
            id: string;
            name: string;
            billingPolicy: {
              interval: string;
              intervalCount: number;
            } | null;
            deliveryPolicy: {
              interval: string;
              intervalCount: number;
            } | null;
          };
        }>;
      };
    } | null;
  }>(shop, SELLING_PLAN_GROUP_QUERY, { id: plan.shopifySellingPlanGroupId });

  const plans = data.sellingPlanGroup?.sellingPlans.edges ?? [];
  const targetInterval =
    INTERVAL_MAP[frequency.unit as keyof typeof INTERVAL_MAP] ?? 'MONTH';

  const match =
    plans.find((edge) => {
      const billing = edge.node.billingPolicy;
      return (
        billing?.interval === targetInterval &&
        billing.intervalCount === frequency.interval
      );
    }) ?? plans[frequencyIndex];

  if (!match) {
    throw new Error(
      'Could not match a Shopify selling plan for this frequency',
    );
  }

  const billing = match.node.billingPolicy;
  const delivery = match.node.deliveryPolicy;

  return {
    sellingPlanId: match.node.id,
    billingPolicy: billing
      ? { interval: billing.interval, intervalCount: billing.intervalCount }
      : {
          interval: targetInterval,
          intervalCount: frequency.interval,
        },
    deliveryPolicy: delivery
      ? { interval: delivery.interval, intervalCount: delivery.intervalCount }
      : {
          interval: targetInterval,
          intervalCount: frequency.interval,
        },
  };
}

async function upsertLocalCustomer(
  shop: Shop,
  shopifyCustomerId: string,
  input: ManualSubscriptionInput,
): Promise<string> {
  const customer = await prisma.customer.upsert({
    where: {
      shopId_shopifyCustomerId: { shopId: shop.id, shopifyCustomerId },
    },
    create: {
      shopId: shop.id,
      shopifyCustomerId,
      email: input.customer.email,
      firstName: input.customer.firstName,
      lastName: input.customer.lastName,
      phone: input.customer.phone ?? input.billingAddress.phone ?? null,
      totalSubscriptions: 1,
      activeSubscriptions: 1,
    },
    update: {
      firstName: input.customer.firstName,
      lastName: input.customer.lastName,
      phone: input.customer.phone ?? input.billingAddress.phone ?? undefined,
      totalSubscriptions: { increment: 1 },
      activeSubscriptions: { increment: 1 },
    },
  });

  return customer.id;
}

async function syncContractFromShopify(
  shop: Shop,
  shopifyContractGid: string,
  localCustomerId: string,
  planId: string,
): Promise<{ contractId: string }> {
  const data = await shopifyAdminGraphql<{
    subscriptionContract: {
      id: string;
      status: string;
      nextBillingDate: string | null;
      currencyCode: string;
      billingPolicy: Record<string, unknown>;
      deliveryPolicy: Record<string, unknown>;
      lines: {
        edges: Array<{
          node: {
            quantity: number;
            title: string | null;
            productId: string | null;
            variantId: string | null;
            sellingPlanId: string | null;
            currentPrice: { amount: string } | null;
          };
        }>;
      };
    } | null;
  }>(shop, CONTRACT_SYNC_QUERY, { id: shopifyContractGid });

  const contractNode = data.subscriptionContract;
  if (!contractNode) {
    throw new Error('Created subscription contract was not found on Shopify');
  }

  const lineItems = contractNode.lines.edges.map((edge) => ({
    productId: edge.node.productId,
    variantId: edge.node.variantId,
    quantity: edge.node.quantity,
    unitPrice: Number(edge.node.currentPrice?.amount ?? 0),
    title: edge.node.title,
  }));

  const contract = await prisma.subscriptionContract.upsert({
    where: {
      shopId_shopifyContractId: {
        shopId: shop.id,
        shopifyContractId: contractNode.id,
      },
    },
    create: {
      shopId: shop.id,
      customerId: localCustomerId,
      planId,
      shopifyContractId: contractNode.id,
      status: mapContractStatus(contractNode.status),
      billingPolicy: contractNode.billingPolicy as object,
      deliveryPolicy: contractNode.deliveryPolicy as object,
      pricingPolicy: {},
      nextBillingDate: contractNode.nextBillingDate
        ? new Date(contractNode.nextBillingDate)
        : null,
      lineItems,
    },
    update: {
      status: mapContractStatus(contractNode.status),
      billingPolicy: contractNode.billingPolicy as object,
      deliveryPolicy: contractNode.deliveryPolicy as object,
      nextBillingDate: contractNode.nextBillingDate
        ? new Date(contractNode.nextBillingDate)
        : null,
      lineItems,
    },
  });

  return { contractId: contract.id };
}

export async function createManualSubscription(
  shop: Shop,
  rawInput: ManualSubscriptionInput,
) {
  const input = rawInput;
  const currencyCode = input.currencyCode ?? 'USD';
  const shippingAddress = input.shippingSameAsBilling
    ? input.billingAddress
    : (input.shippingAddress ?? input.billingAddress);

  if (input.chargeTiming === 'future' && !input.nextBillingDate) {
    throw new Error(
      'A future billing date is required for scheduled subscriptions',
    );
  }

  if (
    input.chargeTiming === 'now' &&
    input.paymentMode !== 'payment_link' &&
    !input.paymentMethodId &&
    !input.createUnpaidOrder
  ) {
    throw new Error(
      'Pay now requires a saved payment method or payment link delivery',
    );
  }

  const shopifyCustomerId = await ensureShopifyCustomer(
    shop,
    input,
    shippingAddress,
  );
  const localCustomerId = await upsertLocalCustomer(
    shop,
    shopifyCustomerId,
    input,
  );

  const { sellingPlanId, billingPolicy, deliveryPolicy } =
    await resolveSellingPlanId(shop, input.planId, input.frequencyIndex);

  const nextBillingDate =
    input.chargeTiming === 'now'
      ? new Date()
      : new Date(input.nextBillingDate!);

  const contractInput: Record<string, unknown> = {
    status: 'ACTIVE',
    billingPolicy,
    deliveryPolicy,
    deliveryPrice: input.deliveryPrice ?? 0,
    deliveryMethod: {
      shipping: {
        address: toMailingAddress(shippingAddress),
      },
    },
  };

  if (input.paymentMethodId && input.paymentMode !== 'payment_link') {
    contractInput.paymentMethodId = input.paymentMethodId;
  }

  const createResult = await shopifyAdminGraphql<{
    subscriptionContractAtomicCreate: {
      contract: { id: string } | null;
      userErrors: Array<{ field: string[] | null; message: string }>;
    };
  }>(shop, ATOMIC_CREATE_MUTATION, {
    input: {
      customerId: shopifyCustomerId,
      currencyCode: currencyCode.toUpperCase(),
      nextBillingDate: nextBillingDate.toISOString(),
      contract: contractInput,
      lines: input.lines.map((line) => ({
        line: {
          productVariantId: line.variantId,
          quantity: line.quantity,
          currentPrice: Number(line.price),
          sellingPlanId,
        },
      })),
    },
  });

  if (createResult.subscriptionContractAtomicCreate.userErrors.length > 0) {
    throw new Error(
      createResult.subscriptionContractAtomicCreate.userErrors
        .map((error) => error.message)
        .join('; '),
    );
  }

  const shopifyContractGid =
    createResult.subscriptionContractAtomicCreate.contract?.id;
  if (!shopifyContractGid) {
    throw new Error('Shopify did not return a subscription contract id');
  }

  const { contractId } = await syncContractFromShopify(
    shop,
    shopifyContractGid,
    localCustomerId,
    input.planId,
  );

  let billingAttemptId: string | null = null;
  let shopifyOrderId: string | null = null;
  let shopifyOrderName: string | null = null;
  let paymentLink: string | null = null;
  let paymentEmailSent = false;

  if (input.chargeTiming === 'now') {
    await ensureFulfillmentInventory(shop, input.lines);

    const billingAttemptInput: Record<string, unknown> = {
      idempotencyKey: `manual:${contractId}:${randomUUID()}`,
      originTime: new Date().toISOString(),
      inventoryPolicy: 'ALLOW_OVERSELLING',
    };

    if (input.paymentMode === 'payment_link' || input.createUnpaidOrder) {
      billingAttemptInput.paymentProcessingPolicy =
        'SKIP_PAYMENT_AND_CREATE_UNPAID_ORDER';
    }

    const attemptResult = await shopifyAdminGraphql<{
      subscriptionBillingAttemptCreate: {
        subscriptionBillingAttempt: {
          id: string;
          ready: boolean;
          nextActionUrl: string | null;
          order: { id: string; name: string } | null;
          errorMessage: string | null;
        } | null;
        userErrors: Array<{ message: string }>;
      };
    }>(shop, BILLING_ATTEMPT_MUTATION, {
      subscriptionContractId: shopifyContractGid,
      subscriptionBillingAttemptInput: billingAttemptInput,
    });

    if (attemptResult.subscriptionBillingAttemptCreate.userErrors.length > 0) {
      throw new Error(
        attemptResult.subscriptionBillingAttemptCreate.userErrors
          .map((error) => error.message)
          .join('; '),
      );
    }

    const initialAttempt =
      attemptResult.subscriptionBillingAttemptCreate.subscriptionBillingAttempt;
    billingAttemptId = initialAttempt?.id ?? null;

    if (initialAttempt?.errorMessage) {
      throw new Error(initialAttempt.errorMessage);
    }

    const resolvedAttempt =
      initialAttempt?.id && !initialAttempt.order?.id
        ? await pollBillingAttemptForOrder(shop, initialAttempt.id)
        : initialAttempt;

    if (resolvedAttempt?.errorMessage) {
      throw new Error(resolvedAttempt.errorMessage);
    }

    shopifyOrderId = resolvedAttempt?.order?.id ?? null;
    shopifyOrderName = resolvedAttempt?.order?.name ?? null;

    if (shopifyOrderId) {
      const orderGid = shopifyOrderId;
      const lineSubtotal = input.lines.reduce(
        (sum: number, line: ManualSubscriptionLine) =>
          sum + Number(line.price) * line.quantity,
        0,
      );
      const orderTotal = lineSubtotal + (input.deliveryPrice ?? 0);

      paymentLink = await resolveOrderPaymentLink(
        shop,
        orderGid,
        resolvedAttempt?.nextActionUrl ?? initialAttempt?.nextActionUrl ?? null,
      );

      if (!paymentLink && input.paymentMode === 'payment_link') {
        throw new Error(
          'Order was created but Shopify did not return a payment link. Try sending the invoice from Shopify Admin.',
        );
      }

      if (
        input.paymentMode === 'payment_link' &&
        input.sendPaymentLinkEmail &&
        input.customer.email
      ) {
        try {
          paymentEmailSent = await sendOrderPaymentInvoice(
            shop,
            orderGid,
            input,
            shopifyOrderName,
            paymentLink,
          );
        } catch (error) {
          console.warn('[manual-subscription] payment invoice email failed', {
            shopId: shop.id,
            orderGid,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }

      const isPaymentLink =
        input.paymentMode === 'payment_link' || input.createUnpaidOrder;

      await prisma.$transaction(async (tx) => {
        await tx.subscriptionOrder.upsert({
          where: {
            shopId_shopifyOrderId: {
              shopId: shop.id,
              shopifyOrderId: orderGid,
            },
          },
          create: {
            shopId: shop.id,
            customerId: localCustomerId,
            contractId,
            shopifyOrderId: orderGid,
            orderNumber: shopifyOrderName ?? orderGid,
            totalPrice: new Prisma.Decimal(orderTotal),
            currency: currencyCode.toUpperCase(),
            status: isPaymentLink ? OrderStatus.pending : OrderStatus.paid,
            billingCycle: 1,
          },
          update: {
            status: isPaymentLink ? OrderStatus.pending : OrderStatus.paid,
          },
        });

        if (isPaymentLink) {
          await tx.subscriptionContract.update({
            where: { id: contractId },
            data: {
              lastOrderId: orderGid,
              lastBillingAttemptId: billingAttemptId,
              status: ContractStatus.active,
            },
          });
        } else {
          await tx.subscriptionContract.update({
            where: { id: contractId },
            data: {
              lastBillingDate: new Date(),
              lastOrderId: orderGid,
              lastBillingAttemptId: billingAttemptId,
              totalCharges: { increment: 1 },
              totalRevenue: { increment: orderTotal },
              status: ContractStatus.active,
            },
          });
        }
      });
    }
  }

  await logEvent({
    shopId: shop.id,
    contractId,
    eventType: 'subscription_contract.created',
    eventSubtype: 'merchant_manual',
    payload: {
      shopifyContractId: shopifyContractGid,
      chargeTiming: input.chargeTiming,
      billingAttemptId,
      shopifyOrderId,
    },
    source: EventSource.system,
  });

  return {
    contractId,
    shopifyContractId: shopifyContractGid,
    customerId: localCustomerId,
    billingAttemptId,
    shopifyOrderId,
    shopifyOrderName,
    paymentLink,
    paymentEmailSent,
    nextBillingDate: nextBillingDate.toISOString(),
    billedNow: input.chargeTiming === 'now',
  };
}
