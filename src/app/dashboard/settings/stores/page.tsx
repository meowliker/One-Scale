import { StoreManager } from '@/components/settings/StoreManager';

export default function StoresSettingsPage() {
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-text-primary">Store Management</h2>
        <p className="text-sm text-text-secondary mt-0.5">Manage your stores and map ad accounts</p>
      </div>
      <StoreManager />
    </div>
  );
}
