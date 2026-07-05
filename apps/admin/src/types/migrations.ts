export type MigrationPlatform =
  'recharge' | 'shopify_subscriptions' | 'bold' | 'appstle' | 'smartrr' | 'csv';

export type MigrationStatus =
  | 'discovered'
  | 'syncing'
  | 'validated'
  | 'cutover'
  | 'completed'
  | 'rolled_back'
  | 'failed';

export type MigrationPreview = {
  totalContracts: number;
  totalCustomers: number;
  totalRevenue: number;
  estimatedDurationMinutes: number;
};

export type MigrationProgress = {
  migrationId?: string;
  status?: MigrationStatus;
  total?: number;
  completed?: number;
  failed?: number;
  percent?: number;
  currentStep?: string;
  updatedAt?: string;
};

export type ValidationIssue = {
  code: string;
  message: string;
  recordId?: string;
  sourceId?: string;
  severity: 'error' | 'warning';
};

export type ValidationReport = {
  sourceContractCount: number;
  syncedContractCount: number;
  sourceCustomerCount: number;
  syncedCustomerCount: number;
  discrepancies: ValidationIssue[];
  passed: boolean;
  validatedAt: string;
};

export type CommunicationTemplate = {
  subject: string;
  bodyHtml: string;
  bodyText: string;
};

export type MigrationRow = {
  id: string;
  platform: MigrationPlatform;
  status: MigrationStatus;
  preview: MigrationPreview;
  progress: MigrationProgress;
  validationReport: ValidationReport | null;
  communicationTemplate: CommunicationTemplate | null;
  cutoverAt: string | null;
  rollbackDeadline: string | null;
  errorSummary: { failed?: number; requiresReview?: boolean } | null;
  recordCount: number;
  errorCount: number;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
};

export type MigrationError = {
  id: string;
  code: string;
  message: string;
  recordId: string | null;
  requiresManualAction: boolean;
  createdAt: string;
};
