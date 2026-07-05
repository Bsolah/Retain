import {
  Banner,
  BlockStack,
  Card,
  FormLayout,
  InlineStack,
  Layout,
  Page,
  Select,
  Spinner,
  TextField,
} from '@shopify/polaris';
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { BoxConfigBuilder } from '../components/plans/BoxConfigBuilder';
import { CollectionSelector } from '../components/plans/CollectionSelector';
import { FrequencyBuilder } from '../components/plans/FrequencyBuilder';
import { PlanPreviewCard } from '../components/plans/PlanPreviewCard';
import { ProductSelector } from '../components/plans/ProductSelector';
import { useCreatePlan, usePlan, useUpdatePlan } from '../hooks/usePlans';
import { usePlanWizardStore } from '../stores/plan-wizard';
import type { PlanType, PricingStrategy } from '../types/plans';

const PLAN_TYPE_OPTIONS = [
  { label: 'Standard', value: 'standard' },
  { label: 'Prepaid', value: 'prepaid' },
  { label: 'Box', value: 'box' },
];

const PRICING_OPTIONS = [
  { label: 'Percentage discount', value: 'percentage_discount' },
  { label: 'Fixed price', value: 'fixed_price' },
  { label: 'Tiered', value: 'tiered' },
];

type PlanWizardPageProps = {
  mode: 'create' | 'edit';
};

export function PlanWizardPage({ mode }: PlanWizardPageProps) {
  const navigate = useNavigate();
  const { planId } = useParams();
  const createPlan = useCreatePlan();
  const updatePlan = useUpdatePlan();
  const [formError, setFormError] = useState<string | null>(null);
  const [loadedPlanId, setLoadedPlanId] = useState<string | null>(null);

  const {
    data: existingPlan,
    isLoading: planLoading,
    isError: planError,
    error: planLoadError,
  } = usePlan(mode === 'edit' ? planId : undefined);

  const step = usePlanWizardStore((state) => state.step);
  const name = usePlanWizardStore((state) => state.name);
  const description = usePlanWizardStore((state) => state.description);
  const planType = usePlanWizardStore((state) => state.planType);
  const pricingStrategy = usePlanWizardStore((state) => state.pricingStrategy);
  const discountValue = usePlanWizardStore((state) => state.discountValue);
  const trialPeriodDays = usePlanWizardStore((state) => state.trialPeriodDays);
  const minimumCommitment = usePlanWizardStore(
    (state) => state.minimumCommitment,
  );
  const frequencies = usePlanWizardStore((state) => state.frequencies);
  const productIds = usePlanWizardStore((state) => state.productIds);
  const collectionIds = usePlanWizardStore((state) => state.collectionIds);
  const boxConfig = usePlanWizardStore((state) => state.boxConfig);
  const setBasicInfo = usePlanWizardStore((state) => state.setBasicInfo);
  const nextStep = usePlanWizardStore((state) => state.nextStep);
  const prevStep = usePlanWizardStore((state) => state.prevStep);
  const reset = usePlanWizardStore((state) => state.reset);
  const toInput = usePlanWizardStore((state) => state.toInput);
  const loadFromPlan = usePlanWizardStore((state) => state.loadFromPlan);

  useEffect(() => {
    if (mode === 'create') {
      reset();
      setLoadedPlanId(null);
      return;
    }

    if (existingPlan && existingPlan.id !== loadedPlanId) {
      loadFromPlan(existingPlan);
      setLoadedPlanId(existingPlan.id);
    }
  }, [mode, existingPlan, loadedPlanId, loadFromPlan, reset]);

  const isSaving = createPlan.isPending || updatePlan.isPending;
  const saveError = createPlan.error ?? updatePlan.error;

  const validateStep = (): string | null => {
    if (step === 0) {
      if (!name.trim()) return 'Plan name is required';
      return null;
    }
    if (step === 1) {
      if (frequencies.length === 0) return 'Add at least one frequency';
      if (planType === 'prepaid') {
        for (const frequency of frequencies) {
          const billing =
            frequency.prepaidBillingInterval ?? frequency.interval * 3;
          if (billing < frequency.interval) {
            return 'Prepaid billing interval must be at least the delivery interval';
          }
          if (billing % frequency.interval !== 0) {
            return 'Prepaid billing interval must be a multiple of the delivery interval';
          }
        }
      }
      if (planType === 'box') {
        if (!boxConfig) return 'Box configuration is required';
        if (boxConfig.minItems < 1 || boxConfig.maxItems < boxConfig.minItems) {
          return 'Set valid minimum and maximum box items';
        }
      }
      return null;
    }
    if (step === 2 && planType === 'box' && boxConfig) {
      if (productIds.length < boxConfig.minItems) {
        return `Select at least ${boxConfig.minItems} product(s) for the box pool`;
      }
    }
    if (productIds.length === 0 && collectionIds.length === 0) {
      return 'Select at least one product or collection';
    }
    return null;
  };

  const onPrimary = () => {
    const error = validateStep();
    if (error) {
      setFormError(error);
      return;
    }
    setFormError(null);

    if (step < 2) {
      nextStep();
      return;
    }

    const input = toInput();
    if (mode === 'edit' && planId) {
      updatePlan.mutate(
        { id: planId, input },
        {
          onSuccess: () => {
            reset();
            navigate('/plans');
          },
        },
      );
      return;
    }

    createPlan.mutate(input, {
      onSuccess: () => {
        reset();
        navigate('/plans', { state: { showStorefrontSetup: true } });
      },
    });
  };

  if (mode === 'edit' && planLoading) {
    return (
      <Page title="Edit plan" backAction={{ content: 'Plans', url: '/plans' }}>
        <Spinner accessibilityLabel="Loading plan" />
      </Page>
    );
  }

  if (mode === 'edit' && (planError || !existingPlan)) {
    return (
      <Page title="Edit plan" backAction={{ content: 'Plans', url: '/plans' }}>
        <Banner tone="critical" title="Could not load plan">
          <p>
            {planLoadError instanceof Error
              ? planLoadError.message
              : 'Plan not found'}
          </p>
        </Banner>
      </Page>
    );
  }

  if (mode === 'edit' && existingPlan?.status === 'archived') {
    return (
      <Page title="Edit plan" backAction={{ content: 'Plans', url: '/plans' }}>
        <Banner tone="warning" title="Archived plan">
          <p>
            Archived plans cannot be edited. Delete or create a new plan
            instead.
          </p>
        </Banner>
      </Page>
    );
  }

  return (
    <Page
      title={mode === 'edit' ? 'Edit plan' : 'Create plan'}
      backAction={{ content: 'Plans', onAction: () => navigate('/plans') }}
      primaryAction={{
        content:
          step === 2
            ? mode === 'edit'
              ? 'Save changes'
              : 'Create plan'
            : 'Continue',
        loading: isSaving,
        onAction: onPrimary,
      }}
      secondaryActions={
        step > 0
          ? [{ content: 'Back', onAction: prevStep }]
          : [{ content: 'Cancel', onAction: () => navigate('/plans') }]
      }
    >
      <Layout>
        <Layout.Section>
          <BlockStack gap="400">
            <Banner tone="info" title={`Step ${step + 1} of 3`}>
              <p>
                {step === 0 && 'Basic information'}
                {step === 1 && 'Frequencies and discounts'}
                {step === 1 && planType === 'box' ? ' · box setup' : ''}
                {step === 2 && 'Products and collections'}
              </p>
            </Banner>

            {formError ? (
              <Banner tone="critical" onDismiss={() => setFormError(null)}>
                <p>{formError}</p>
              </Banner>
            ) : null}

            {saveError ? (
              <Banner tone="critical" title="Could not save plan">
                <p>
                  {saveError instanceof Error
                    ? saveError.message
                    : 'Unknown error'}
                </p>
              </Banner>
            ) : null}

            <Card>
              {step === 0 ? (
                <FormLayout>
                  <TextField
                    label="Name"
                    value={name}
                    placeholder={
                      mode === 'create'
                        ? 'e.g. Monthly Coffee Subscription'
                        : undefined
                    }
                    helpText={
                      mode === 'create'
                        ? 'Customer-facing name for this subscription plan'
                        : undefined
                    }
                    onChange={(value) =>
                      setBasicInfo({
                        name: value,
                        description,
                        planType,
                        pricingStrategy,
                        discountValue,
                        trialPeriodDays,
                        minimumCommitment,
                      })
                    }
                    autoComplete="off"
                  />
                  <TextField
                    label="Description"
                    value={description}
                    multiline={3}
                    placeholder={
                      mode === 'create'
                        ? 'e.g. Freshly roasted beans delivered to your door every month. Cancel anytime.'
                        : undefined
                    }
                    helpText={
                      mode === 'create'
                        ? 'Optional — helps customers understand what they are subscribing to'
                        : undefined
                    }
                    onChange={(value) =>
                      setBasicInfo({
                        name,
                        description: value,
                        planType,
                        pricingStrategy,
                        discountValue,
                        trialPeriodDays,
                        minimumCommitment,
                      })
                    }
                    autoComplete="off"
                  />
                  <Select
                    label="Plan type"
                    options={PLAN_TYPE_OPTIONS}
                    value={planType}
                    helpText={
                      mode === 'create'
                        ? 'Standard = recurring orders; Prepaid = pay upfront; Box = curated product bundle'
                        : undefined
                    }
                    onChange={(value) =>
                      setBasicInfo({
                        name,
                        description,
                        planType: value as PlanType,
                        pricingStrategy,
                        discountValue,
                        trialPeriodDays,
                        minimumCommitment,
                      })
                    }
                  />
                  <Select
                    label="Pricing strategy"
                    options={PRICING_OPTIONS}
                    value={pricingStrategy}
                    helpText={
                      mode === 'create'
                        ? 'Percentage off retail price, a fixed subscription price, or tiered discounts per frequency'
                        : undefined
                    }
                    onChange={(value) =>
                      setBasicInfo({
                        name,
                        description,
                        planType,
                        pricingStrategy: value as PricingStrategy,
                        discountValue,
                        trialPeriodDays,
                        minimumCommitment,
                      })
                    }
                  />
                  <TextField
                    label="Default discount value"
                    type="number"
                    value={String(discountValue)}
                    placeholder={mode === 'create' ? '10' : undefined}
                    helpText={
                      mode === 'create'
                        ? 'For percentage strategy: percent off (e.g. 10 = 10% off). For fixed price: amount in your shop currency'
                        : undefined
                    }
                    onChange={(value) =>
                      setBasicInfo({
                        name,
                        description,
                        planType,
                        pricingStrategy,
                        discountValue: Number(value) || 0,
                        trialPeriodDays,
                        minimumCommitment,
                      })
                    }
                    autoComplete="off"
                  />
                  <InlineStack gap="400">
                    <TextField
                      label="Trial days"
                      type="number"
                      value={String(trialPeriodDays)}
                      placeholder={mode === 'create' ? '0' : undefined}
                      helpText={
                        mode === 'create'
                          ? 'Free trial length before the first charge. Use 0 for no trial'
                          : undefined
                      }
                      onChange={(value) =>
                        setBasicInfo({
                          name,
                          description,
                          planType,
                          pricingStrategy,
                          discountValue,
                          trialPeriodDays: Number(value) || 0,
                          minimumCommitment,
                        })
                      }
                      autoComplete="off"
                    />
                    <TextField
                      label="Minimum commitment"
                      type="number"
                      value={
                        minimumCommitment == null
                          ? ''
                          : String(minimumCommitment)
                      }
                      placeholder={mode === 'create' ? 'e.g. 3' : undefined}
                      helpText={
                        mode === 'create'
                          ? 'Optional minimum number of deliveries before cancel. Leave empty for none'
                          : undefined
                      }
                      onChange={(value) =>
                        setBasicInfo({
                          name,
                          description,
                          planType,
                          pricingStrategy,
                          discountValue,
                          trialPeriodDays,
                          minimumCommitment:
                            value === '' ? null : Number(value) || 0,
                        })
                      }
                      autoComplete="off"
                    />
                  </InlineStack>
                </FormLayout>
              ) : null}

              {step === 1 ? (
                <BlockStack gap="500">
                  <FrequencyBuilder showHints={mode === 'create'} />
                  {planType === 'box' ? (
                    <BoxConfigBuilder showHints={mode === 'create'} />
                  ) : null}
                </BlockStack>
              ) : null}

              {step === 2 ? (
                <BlockStack gap="500">
                  <ProductSelector showHints={mode === 'create'} />
                  <CollectionSelector showHints={mode === 'create'} />
                </BlockStack>
              ) : null}
            </Card>
          </BlockStack>
        </Layout.Section>

        <Layout.Section variant="oneThird">
          <PlanPreviewCard
            name={name}
            description={description}
            planType={planType}
            pricingStrategy={pricingStrategy}
            discountValue={discountValue}
            frequencies={frequencies}
            boxConfig={boxConfig}
            productCount={productIds.length}
            collectionCount={collectionIds.length}
          />
        </Layout.Section>
      </Layout>
    </Page>
  );
}
