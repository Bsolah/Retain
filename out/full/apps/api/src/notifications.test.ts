import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  DEFAULT_EMAIL_TEMPLATES,
  PREVIEW_TEMPLATE_VARIABLES,
} from './services/email-template-defaults.js';
import {
  pickSubject,
  previewTemplateContent,
} from './services/email-templates.js';
import { processSendGridEvent } from './services/notifications.js';

describe('email template defaults', () => {
  it('defines all required default templates', () => {
    const names = DEFAULT_EMAIL_TEMPLATES.map((item) => item.name);
    assert.deepEqual(names, [
      'subscription_created',
      'subscription_renewal_reminder',
      'payment_failed',
      'intervention_skip_offer',
      'intervention_discount_offer',
      'cancel_confirmation',
      'dunning_retry',
    ]);
  });
});

describe('template rendering', () => {
  it('renders preview content with variables', () => {
    const template = {
      id: null,
      name: 'subscription_created',
      subject: 'Welcome {{customer.firstName}}!',
      bodyHtml: '<p>Plan: {{subscription.planName}}</p>',
      bodyText: 'Plan: {{subscription.planName}}',
      variables: [],
      isDefault: true,
      isOverridden: false,
      subjectVariants: [],
    };

    const preview = previewTemplateContent(
      template,
      PREVIEW_TEMPLATE_VARIABLES,
    );
    assert.equal(preview.subject, 'Welcome Alex!');
    assert.match(preview.html, /Coffee Club/);
  });

  it('picks A/B subject variants', () => {
    const subject = pickSubject({
      subject: 'Primary subject',
      subjectVariants: ['Variant A', 'Variant B'],
    });
    assert.ok(
      subject === 'Primary subject' ||
        subject === 'Variant A' ||
        subject === 'Variant B',
    );
  });
});

describe('sendgrid event processing', () => {
  it('ignores events without notification_log_id', async () => {
    const result = await processSendGridEvent('delivered', [
      { event: 'delivered', email: 'test@example.com' },
    ]);
    assert.equal(result.processed, 0);
  });
});
