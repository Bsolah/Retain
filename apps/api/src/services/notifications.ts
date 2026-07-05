import {
  InterventionStatus,
  NotificationChannel,
  NotificationStatus,
  prisma,
} from '@retain/database';
import { env } from '../env.js';
import { renderTemplateContent, resolveTemplate } from './email-templates.js';
import { renderEmail, renderTemplate } from './template-renderer.js';

export type SendEmailInput = {
  to: string;
  subject?: string;
  body?: string;
  templateId?: string;
  variables?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  shopId?: string | null;
  interventionId?: string | null;
};

export type SendSmsInput = {
  to: string;
  body: string;
  metadata?: Record<string, unknown>;
  shopId?: string | null;
  interventionId?: string | null;
};

export type SendResult = {
  logId: string;
  sent: boolean;
  dryRun: boolean;
  messageId?: string;
  status: NotificationStatus;
};

const SMS_MAX_LENGTH = 1600;

function extractSendGridMessageId(headers: Headers): string | undefined {
  const messageId = headers.get('x-message-id');
  return messageId ?? undefined;
}

export async function sendEmail(input: SendEmailInput): Promise<SendResult> {
  let subject = input.subject ?? '';
  let html = input.body ?? '';
  let text = input.body ?? '';
  let templateId: string | null = null;

  if (input.templateId) {
    const template = await resolveTemplate(
      input.shopId ?? null,
      input.templateId,
    );
    templateId = template.id;
    const rendered = renderTemplateContent(template, input.variables ?? {});
    subject = rendered.subject;
    html = rendered.html;
    text = rendered.text;
  } else if (input.body) {
    text = input.body;
    html = `<p>${input.body.replace(/\n/g, '<br/>')}</p>`;
  }

  const log = await prisma.notificationLog.create({
    data: {
      shopId: input.shopId ?? null,
      templateId,
      interventionId: input.interventionId ?? null,
      channel: NotificationChannel.email,
      recipient: input.to,
      subject,
      body: text,
      status: NotificationStatus.pending,
      metadata: (input.metadata ?? {}) as object,
    },
  });

  if (!env.SENDGRID_API_KEY) {
    console.info('[notifications] email dry-run', {
      to: input.to,
      subject,
      templateId: input.templateId,
      logId: log.id,
    });
    await prisma.notificationLog.update({
      where: { id: log.id },
      data: {
        status: NotificationStatus.sent,
        sentAt: new Date(),
        metadata: {
          ...(input.metadata ?? {}),
          dryRun: true,
        } as object,
      },
    });
    return {
      logId: log.id,
      sent: false,
      dryRun: true,
      status: NotificationStatus.sent,
    };
  }

  try {
    const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${env.SENDGRID_API_KEY}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        personalizations: [
          {
            to: [{ email: input.to }],
            custom_args: {
              notification_log_id: log.id,
              ...(input.interventionId
                ? { intervention_id: input.interventionId }
                : {}),
              ...(input.shopId ? { shop_id: input.shopId } : {}),
            },
          },
        ],
        from: {
          email: env.SENDGRID_FROM_EMAIL,
          name: env.SENDGRID_FROM_NAME,
        },
        subject,
        content: [
          { type: 'text/plain', value: text },
          { type: 'text/html', value: html },
        ],
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`SendGrid error ${response.status}: ${body}`);
    }

    const messageId = extractSendGridMessageId(response.headers);
    await prisma.notificationLog.update({
      where: { id: log.id },
      data: {
        status: NotificationStatus.sent,
        sentAt: new Date(),
        externalId: messageId ?? null,
      },
    });

    if (input.interventionId) {
      await prisma.intervention.updateMany({
        where: {
          id: input.interventionId,
          status: InterventionStatus.pending,
        },
        data: {
          status: InterventionStatus.sent,
          sentAt: new Date(),
          messageSubject: subject,
          messageBody: text,
        },
      });
    }

    return {
      logId: log.id,
      sent: true,
      dryRun: false,
      messageId,
      status: NotificationStatus.sent,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Send failed';
    await prisma.notificationLog.update({
      where: { id: log.id },
      data: {
        status: NotificationStatus.failed,
        errorMessage: message,
      },
    });
    throw error;
  }
}

export async function sendSMS(input: SendSmsInput): Promise<SendResult> {
  const body = input.body.slice(0, SMS_MAX_LENGTH);

  const log = await prisma.notificationLog.create({
    data: {
      shopId: input.shopId ?? null,
      interventionId: input.interventionId ?? null,
      channel: NotificationChannel.sms,
      recipient: input.to,
      body,
      status: NotificationStatus.pending,
      metadata: (input.metadata ?? {}) as object,
    },
  });

  if (
    !env.TWILIO_ACCOUNT_SID ||
    !env.TWILIO_AUTH_TOKEN ||
    !env.TWILIO_FROM_NUMBER
  ) {
    console.info('[notifications] sms dry-run', {
      to: input.to,
      logId: log.id,
    });
    await prisma.notificationLog.update({
      where: { id: log.id },
      data: {
        status: NotificationStatus.sent,
        sentAt: new Date(),
        metadata: {
          ...(input.metadata ?? {}),
          dryRun: true,
        } as object,
      },
    });
    return {
      logId: log.id,
      sent: false,
      dryRun: true,
      status: NotificationStatus.sent,
    };
  }

  try {
    const auth = Buffer.from(
      `${env.TWILIO_ACCOUNT_SID}:${env.TWILIO_AUTH_TOKEN}`,
    ).toString('base64');

    const form = new URLSearchParams({
      To: input.to,
      From: env.TWILIO_FROM_NUMBER,
      Body: body,
    });

    const response = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${env.TWILIO_ACCOUNT_SID}/Messages.json`,
      {
        method: 'POST',
        headers: {
          authorization: `Basic ${auth}`,
          'content-type': 'application/x-www-form-urlencoded',
        },
        body: form,
      },
    );

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Twilio error ${response.status}: ${text}`);
    }

    const payload = (await response.json()) as { sid?: string };
    await prisma.notificationLog.update({
      where: { id: log.id },
      data: {
        status: NotificationStatus.sent,
        sentAt: new Date(),
        externalId: payload.sid ?? null,
      },
    });

    return {
      logId: log.id,
      sent: true,
      dryRun: false,
      messageId: payload.sid,
      status: NotificationStatus.sent,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'SMS send failed';
    await prisma.notificationLog.update({
      where: { id: log.id },
      data: {
        status: NotificationStatus.failed,
        errorMessage: message,
      },
    });
    throw error;
  }
}

/** Backward-compatible file-based template send used by dunning/winback. */
export async function sendLegacyTemplateEmail(input: {
  to: string;
  template: string;
  context: Record<string, unknown>;
  shopId?: string;
  interventionId?: string;
}): Promise<SendResult> {
  const { subject, html, text } = renderEmail(input.template, input.context);
  return sendEmail({
    to: input.to,
    subject,
    body: text,
    shopId: input.shopId,
    interventionId: input.interventionId,
    metadata: {
      legacyTemplate: input.template,
      html,
    },
  });
}

export function renderSmsFromTemplate(
  template: string,
  context: Record<string, unknown>,
): string {
  return renderTemplate(template, context).trim().slice(0, SMS_MAX_LENGTH);
}

export type SendGridEvent = {
  event: string;
  email?: string;
  timestamp?: number;
  sg_message_id?: string;
  notification_log_id?: string;
  intervention_id?: string;
  shop_id?: string;
  reason?: string;
};

export async function processSendGridEvent(
  eventType: string,
  events: SendGridEvent[],
): Promise<{ processed: number }> {
  let processed = 0;

  for (const event of events) {
    if (event.event !== eventType) continue;

    const logId = event.notification_log_id;
    if (!logId) continue;

    const timestamp = event.timestamp
      ? new Date(event.timestamp * 1000)
      : new Date();

    const statusMap: Record<string, NotificationStatus> = {
      delivered: NotificationStatus.delivered,
      open: NotificationStatus.opened,
      opened: NotificationStatus.opened,
      click: NotificationStatus.clicked,
      clicked: NotificationStatus.clicked,
      bounce: NotificationStatus.bounced,
      bounced: NotificationStatus.bounced,
      spamreport: NotificationStatus.complained,
      complained: NotificationStatus.complained,
    };

    const status = statusMap[event.event];
    if (!status) continue;

    const updateData: Record<string, unknown> = { status };
    if (status === NotificationStatus.delivered)
      updateData.deliveredAt = timestamp;
    if (status === NotificationStatus.opened) updateData.openedAt = timestamp;
    if (status === NotificationStatus.clicked) updateData.clickedAt = timestamp;
    if (status === NotificationStatus.bounced) {
      updateData.bouncedAt = timestamp;
      updateData.errorMessage = event.reason ?? 'bounced';
    }
    if (status === NotificationStatus.complained)
      updateData.complainedAt = timestamp;

    await prisma.notificationLog.update({
      where: { id: logId },
      data: updateData as Parameters<
        typeof prisma.notificationLog.update
      >[0]['data'],
    });

    const interventionId = event.intervention_id;
    if (interventionId) {
      if (status === NotificationStatus.opened) {
        await prisma.intervention.updateMany({
          where: { id: interventionId, openedAt: null },
          data: {
            status: InterventionStatus.opened,
            openedAt: timestamp,
          },
        });
      }
      if (status === NotificationStatus.clicked) {
        await prisma.intervention.updateMany({
          where: { id: interventionId },
          data: {
            status: InterventionStatus.clicked,
            clickedAt: timestamp,
          },
        });
      }
    }

    processed += 1;
  }

  return { processed };
}
