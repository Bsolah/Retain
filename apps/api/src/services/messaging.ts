import {
  renderSmsFromTemplate as renderSms,
  sendEmail as sendNotificationEmail,
  sendLegacyTemplateEmail,
  sendSMS as sendNotificationSms,
} from './notifications.js';

export type SendEmailInput = {
  to: string;
  template: string;
  context: Record<string, unknown>;
  shopId?: string;
  interventionId?: string;
};

export type SendSmsInput = {
  to: string;
  body: string;
  shopId?: string;
  interventionId?: string;
};

export async function sendEmail(input: SendEmailInput): Promise<{
  sent: boolean;
  dryRun: boolean;
  logId?: string;
}> {
  const result = await sendLegacyTemplateEmail({
    to: input.to,
    template: input.template,
    context: input.context,
    shopId: input.shopId,
    interventionId: input.interventionId,
  });
  return {
    sent: result.sent,
    dryRun: result.dryRun,
    logId: result.logId,
  };
}

export async function sendSms(input: SendSmsInput): Promise<{
  sent: boolean;
  dryRun: boolean;
  logId?: string;
}> {
  const result = await sendNotificationSms({
    to: input.to,
    body: input.body,
    shopId: input.shopId,
    interventionId: input.interventionId,
  });
  return {
    sent: result.sent,
    dryRun: result.dryRun,
    logId: result.logId,
  };
}

export function renderSmsFromTemplate(
  template: string,
  context: Record<string, unknown>,
): string {
  return renderSms(template, context);
}

export { sendNotificationEmail as sendTemplatedEmail };
