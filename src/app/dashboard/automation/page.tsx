import { getRules, getRulePresets, getRuleLog } from '@/services/automation';
import { getDayPartingSchedules, getDayPartingPresets } from '@/services/dayPartingBot';
import { AutomationClient } from '@/components/automation/AutomationClient';

export default async function AutomationPage() {
  const [rules, presets, log, dayPartingSchedules, dayPartingPresets] = await Promise.all([
    getRules(),
    getRulePresets(),
    getRuleLog(),
    getDayPartingSchedules(),
    getDayPartingPresets(),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-text-primary">Automation</h1>
        <p className="text-sm text-text-secondary">
          Create rules to automatically manage your campaigns
        </p>
      </div>

      <AutomationClient
        initialRules={rules}
        presets={presets}
        log={log}
        dayPartingSchedules={dayPartingSchedules}
        dayPartingPresets={dayPartingPresets}
      />
    </div>
  );
}
