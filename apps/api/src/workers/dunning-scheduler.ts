import cron from 'node-cron';
import { processDueDunningSteps } from '../services/dunning.js';
import { processDueWinbackEmails } from '../services/winback.js';

let dunningTask: cron.ScheduledTask | null = null;

export function startDunningScheduler(): void {
  if (dunningTask) return;

  // Hourly: advance dunning steps and winback emails
  dunningTask = cron.schedule('0 * * * *', () => {
    void processDueDunningSteps().catch((error) => {
      console.error('Dunning scheduler failed', error);
    });
    void processDueWinbackEmails().catch((error) => {
      console.error('Winback scheduler failed', error);
    });
  });

  console.log('Dunning + winback scheduler started (hourly)');
}

export function stopDunningScheduler(): void {
  dunningTask?.stop();
  dunningTask = null;
}
