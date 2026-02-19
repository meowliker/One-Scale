import type { AutomationRule, RulePreset, RuleLogEntry } from '@/types/automation';
import { mockRules, mockRulePresets, mockRuleLog } from '@/data/mockRules';

const USE_MOCK = true;

// In-memory copy so mutations reflect immediately within the same session
let rules = [...mockRules];

export async function getRules(): Promise<AutomationRule[]> {
  if (USE_MOCK) {
    await new Promise((resolve) => setTimeout(resolve, 100));
    return rules;
  }

  return [];
}

export async function getRulePresets(): Promise<RulePreset[]> {
  if (USE_MOCK) {
    await new Promise((resolve) => setTimeout(resolve, 100));
    return mockRulePresets;
  }

  return [];
}

export async function getRuleLog(): Promise<RuleLogEntry[]> {
  if (USE_MOCK) {
    await new Promise((resolve) => setTimeout(resolve, 100));
    return mockRuleLog;
  }

  return [];
}

export async function createRule(rule: AutomationRule): Promise<AutomationRule> {
  if (USE_MOCK) {
    await new Promise((resolve) => setTimeout(resolve, 100));
    rules = [rule, ...rules];
    return rule;
  }

  return rule;
}

export async function updateRuleStatus(
  id: string,
  status: AutomationRule['status']
): Promise<AutomationRule | null> {
  if (USE_MOCK) {
    await new Promise((resolve) => setTimeout(resolve, 100));
    const index = rules.findIndex((r) => r.id === id);
    if (index === -1) return null;
    rules[index] = { ...rules[index], status };
    return rules[index];
  }

  return null;
}

export async function deleteRule(id: string): Promise<boolean> {
  if (USE_MOCK) {
    await new Promise((resolve) => setTimeout(resolve, 100));
    const before = rules.length;
    rules = rules.filter((r) => r.id !== id);
    return rules.length < before;
  }

  return false;
}
