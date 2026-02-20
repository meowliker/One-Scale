import { TeamUsersManager } from '@/components/settings/TeamUsersManager';

export default function TeamSettingsPage() {
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-text-primary">Team Users</h2>
        <p className="text-sm text-text-secondary mt-0.5">
          Create unique logins for each member and manage workspace access.
        </p>
      </div>
      <TeamUsersManager />
    </div>
  );
}
