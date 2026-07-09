import {
  Banner,
  BlockStack,
  Card,
  FormLayout,
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
import type { PlanType } from '../types/plans';

const PLAN_TYPE_OPTIONS = [
  { label: 'Standard', value: 'standard' },
  { label: 'Prepaid', value: 'prepaid' },
  { label: 'Box', value: 'box' },
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
    if (step === 1 && planType === 'box' && boxConfig) {
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

    if (step < 1) {
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
          step === 1
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
            <Banner tone="info" title={`Step ${step + 1} of 2`}>
              <p>
                {step === 0 && 'Plan details and delivery options'}
                {step === 0 && planType === 'box' ? ' · box setup' : ''}
                {step === 1 && 'Products and collections'}
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
                <BlockStack gap="500">
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
                        })
                      }
                    />
                  </FormLayout>
                  <FrequencyBuilder showHints={mode === 'create'} />
                  {planType === 'box' ? (
                    <BoxConfigBuilder showHints={mode === 'create'} />
                  ) : null}
                </BlockStack>
              ) : null}

              {step === 1 ? (
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
