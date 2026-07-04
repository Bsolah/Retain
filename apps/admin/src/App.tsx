import {
  AppProvider,
  Banner,
  Card,
  Layout,
  Page,
  Text,
} from '@shopify/polaris';
import enTranslations from '@shopify/polaris/locales/en.json';
import { APP_NAME } from '@retain/shared';

export default function App() {
  return (
    <AppProvider i18n={enTranslations}>
      <Page title={APP_NAME}>
        <Layout>
          <Layout.Section>
            <Card>
              <Text as="h2" variant="headingMd">
                Admin dashboard
              </Text>
              <Text as="p" tone="subdued">
                Scaffold only — Shopify App Bridge and retention features will
                be wired up next.
              </Text>
            </Card>
          </Layout.Section>
          <Layout.Section>
            <Banner tone="success" title="Health check">
              <p>Admin app is running (200 OK).</p>
            </Banner>
          </Layout.Section>
        </Layout>
      </Page>
    </AppProvider>
  );
}
