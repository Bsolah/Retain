export const TEMPLATE_VARIABLES = [
  '{{customer.firstName}}',
  '{{customer.email}}',
  '{{subscription.planName}}',
  '{{subscription.nextBillingDate}}',
  '{{subscription.frequency}}',
  '{{offer.discount}}',
  '{{offer.points}}',
  '{{shop.name}}',
] as const;

export type DefaultTemplateName =
  | 'subscription_created'
  | 'subscription_renewal_reminder'
  | 'payment_failed'
  | 'intervention_skip_offer'
  | 'intervention_discount_offer'
  | 'cancel_confirmation'
  | 'dunning_retry';

export type DefaultTemplate = {
  name: DefaultTemplateName;
  subject: string;
  bodyHtml: string;
  bodyText: string;
  variables: string[];
};

export const DEFAULT_EMAIL_TEMPLATES: DefaultTemplate[] = [
  {
    name: 'subscription_created',
    subject: 'Welcome to your subscription!',
    bodyHtml:
      '<p>Hi {{customer.firstName}},</p><p>Welcome to {{subscription.planName}} at {{shop.name}}! Your subscription is active.</p>',
    bodyText:
      'Hi {{customer.firstName}},\n\nWelcome to {{subscription.planName}} at {{shop.name}}! Your subscription is active.',
    variables: [...TEMPLATE_VARIABLES],
  },
  {
    name: 'subscription_renewal_reminder',
    subject: 'Your next order ships in 3 days',
    bodyHtml:
      '<p>Hi {{customer.firstName}},</p><p>Your next {{subscription.planName}} order is scheduled for {{subscription.nextBillingDate}}.</p>',
    bodyText:
      'Hi {{customer.firstName}},\n\nYour next {{subscription.planName}} order is scheduled for {{subscription.nextBillingDate}}.',
    variables: [...TEMPLATE_VARIABLES],
  },
  {
    name: 'payment_failed',
    subject: "We couldn't process your payment",
    bodyHtml:
      '<p>Hi {{customer.firstName}},</p><p>We could not process your payment for {{subscription.planName}}. Please update your payment method.</p>',
    bodyText:
      'Hi {{customer.firstName}},\n\nWe could not process your payment for {{subscription.planName}}. Please update your payment method.',
    variables: [...TEMPLATE_VARIABLES],
  },
  {
    name: 'intervention_skip_offer',
    subject: 'Need a break? Skip your next delivery',
    bodyHtml:
      '<p>Hi {{customer.firstName}},</p><p>Need a break? You can skip your next {{subscription.frequency}} delivery from {{shop.name}}.</p>',
    bodyText:
      'Hi {{customer.firstName}},\n\nNeed a break? You can skip your next {{subscription.frequency}} delivery from {{shop.name}}.',
    variables: [...TEMPLATE_VARIABLES],
  },
  {
    name: 'intervention_discount_offer',
    subject: 'A special offer just for you',
    bodyHtml:
      '<p>Hi {{customer.firstName}},</p><p>Enjoy {{offer.discount}} off your next order — plus {{offer.points}} loyalty points from {{shop.name}}.</p>',
    bodyText:
      'Hi {{customer.firstName}},\n\nEnjoy {{offer.discount}} off your next order — plus {{offer.points}} loyalty points from {{shop.name}}.',
    variables: [...TEMPLATE_VARIABLES],
  },
  {
    name: 'cancel_confirmation',
    subject: 'Your subscription has been cancelled',
    bodyHtml:
      '<p>Hi {{customer.firstName}},</p><p>Your {{subscription.planName}} subscription at {{shop.name}} has been cancelled.</p>',
    bodyText:
      'Hi {{customer.firstName}},\n\nYour {{subscription.planName}} subscription at {{shop.name}} has been cancelled.',
    variables: [...TEMPLATE_VARIABLES],
  },
  {
    name: 'dunning_retry',
    subject: 'Update your payment method',
    bodyHtml:
      '<p>Hi {{customer.firstName}},</p><p>Please update your payment method to keep your {{subscription.planName}} subscription active at {{shop.name}}.</p>',
    bodyText:
      'Hi {{customer.firstName}},\n\nPlease update your payment method to keep your {{subscription.planName}} subscription active at {{shop.name}}.',
    variables: [...TEMPLATE_VARIABLES],
  },
];

export const PREVIEW_TEMPLATE_VARIABLES: Record<string, unknown> = {
  customer: {
    firstName: 'Alex',
    email: 'alex@example.com',
  },
  subscription: {
    planName: 'Coffee Club',
    nextBillingDate: 'April 12, 2026',
    frequency: 'every 2 weeks',
  },
  offer: {
    discount: '15%',
    points: '250',
  },
  shop: {
    name: 'Demo Roasters',
  },
  shopName: 'Demo Roasters',
  updateLink: 'https://portal.example.com/payment/update',
  day: 0,
};
