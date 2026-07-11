import type { MigrationCredentials, PlatformAdapter } from '../types.js';

function parseCsvLine(line: string): string[] {
  const values: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i]!;
    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (char === ',' && !inQuotes) {
      values.push(current.trim());
      current = '';
      continue;
    }
    current += char;
  }
  values.push(current.trim());
  return values;
}

function mapRow(row: Record<string, string>): {
  customer: {
    sourceId: string;
    email: string;
    firstName: string | null;
    lastName: string | null;
    phone: string | null;
  };
  contract: import('../types.js').SourceContract;
} {
  const customerId =
    row.customer_id ||
    row.customer_email ||
    row.email ||
    `csv-${Math.random()}`;
  const contractId =
    row.subscription_id || row.contract_id || `${customerId}-sub`;

  return {
    customer: {
      sourceId: customerId,
      email: row.email || row.customer_email || 'unknown@customer.local',
      firstName: row.first_name || row.customer_first_name || null,
      lastName: row.last_name || row.customer_last_name || null,
      phone: row.phone || null,
    },
    contract: {
      sourceId: contractId,
      sourceCustomerId: customerId,
      status: row.status || 'active',
      productTitle: row.product_title || row.plan_name,
      variantId: row.variant_id,
      quantity: Number(row.quantity || 1),
      price: Number(row.price || row.amount || 0),
      currency: row.currency || 'USD',
      nextBillingDate: row.next_billing_date || row.next_charge_date || null,
      billingInterval: row.interval || 'month',
      billingIntervalCount: Number(row.interval_count || 1),
      totalRevenue: Number(row.total_revenue || row.price || 0),
      raw: row,
    },
  };
}

export const csvAdapter: PlatformAdapter = {
  platform: 'csv',

  async discover(credentials: MigrationCredentials) {
    if (!credentials.csvData?.trim()) {
      throw new Error('CSV data is required for csv platform');
    }

    const lines = credentials.csvData.trim().split(/\r?\n/);
    if (lines.length < 2) {
      throw new Error(
        'CSV must include a header row and at least one data row',
      );
    }

    const headers = parseCsvLine(lines[0]!).map((h) => h.toLowerCase());
    const customers = new Map<string, ReturnType<typeof mapRow>['customer']>();
    const contracts: Awaited<
      ReturnType<PlatformAdapter['discover']>
    >['contracts'] = [];
    let totalRevenue = 0;

    for (const line of lines.slice(1)) {
      if (!line.trim()) continue;
      const values = parseCsvLine(line);
      const row: Record<string, string> = {};
      headers.forEach((header, index) => {
        row[header] = values[index] ?? '';
      });

      const mapped = mapRow(row);
      customers.set(mapped.customer.sourceId, mapped.customer);
      contracts.push(mapped.contract);
      totalRevenue += mapped.contract.price ?? 0;
    }

    return {
      customers: [...customers.values()],
      contracts,
      totalRevenue,
    };
  },
};
