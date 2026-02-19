import { ApiCredentials } from '@/components/settings/ApiCredentials';

export default function CredentialsPage() {
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-text-primary">API Credentials</h2>
        <p className="text-sm text-text-secondary mt-0.5">
          Configure your Meta and Shopify app credentials for OAuth connections
        </p>
      </div>
      <ApiCredentials />
    </div>
  );
}
