import { env } from '../env.js';

export type ChurnPrediction = {
  contract_id: string;
  churn_probability?: number;
  risk_level?: string;
  model_version?: string;
  error?: string;
};

export async function runChurnAnalysis(
  contractId: string,
): Promise<ChurnPrediction | null> {
  try {
    const response = await fetch(
      `${env.AI_SERVICE_URL}/predictions/${contractId}`,
      { signal: AbortSignal.timeout(15_000) },
    );
    if (!response.ok) {
      console.warn(
        `Churn analysis failed for ${contractId}: HTTP ${response.status}`,
      );
      return null;
    }
    return (await response.json()) as ChurnPrediction;
  } catch (error) {
    console.warn(`Churn analysis failed for ${contractId}`, error);
    return null;
  }
}
