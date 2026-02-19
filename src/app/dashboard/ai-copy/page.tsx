import { AICopyGenerator } from '@/components/ai/AICopyGenerator';

export default function AICopyPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-text-primary">AI Copy Generator</h1>
        <p className="text-sm text-text-secondary mt-1">
          Generate high-converting ad copy based on your winning data
        </p>
      </div>
      <AICopyGenerator />
    </div>
  );
}
