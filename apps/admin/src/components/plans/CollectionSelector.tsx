import {
  BlockStack,
  InlineError,
  Select,
  Spinner,
  Tag,
  Text,
} from '@shopify/polaris';
import { useCollections } from '../../hooks/usePlans';
import { usePlanWizardStore } from '../../stores/plan-wizard';

type CollectionSelectorProps = {
  showHints?: boolean;
};

export function CollectionSelector({
  showHints = false,
}: CollectionSelectorProps) {
  const { data, isLoading, isError, error } = useCollections();
  const collectionIds = usePlanWizardStore((state) => state.collectionIds);
  const selectedCollectionTitles = usePlanWizardStore(
    (state) => state.selectedCollectionTitles,
  );
  const toggleCollection = usePlanWizardStore(
    (state) => state.toggleCollection,
  );

  const options = [
    { label: 'Select a collection', value: '' },
    ...(data ?? [])
      .filter((collection) => !collectionIds.includes(collection.id))
      .map((collection) => ({
        label: collection.title,
        value: collection.id,
      })),
  ];

  return (
    <BlockStack gap="300">
      <BlockStack gap="100">
        <Text as="h3" variant="headingMd">
          Collections
        </Text>
        {showHints ? (
          <Text as="p" tone="subdued">
            Optional — add a collection to include all its products in this plan
          </Text>
        ) : null}
      </BlockStack>
      {isLoading ? <Spinner size="small" /> : null}
      {isError ? (
        <InlineError
          message={
            error instanceof Error
              ? error.message
              : 'Failed to load collections'
          }
          fieldID="collections"
        />
      ) : null}
      <Select
        label="Add collection"
        options={options}
        value=""
        helpText={
          showHints
            ? 'e.g. Best Sellers — every product in the collection becomes subscribable'
            : undefined
        }
        onChange={(value) => {
          const collection = data?.find((item) => item.id === value);
          if (collection) {
            toggleCollection(collection.id, collection.title);
          }
        }}
      />
      <BlockStack gap="200">
        {collectionIds.map((id) => (
          <Tag key={id} onRemove={() => toggleCollection(id, '')}>
            {selectedCollectionTitles[id] ?? id}
          </Tag>
        ))}
      </BlockStack>
    </BlockStack>
  );
}
