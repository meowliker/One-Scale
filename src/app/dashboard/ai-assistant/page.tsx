import { AIChatClient } from '@/components/ai/AIChatClient';

export default function AIAssistantPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-text-primary">AI Media Buyer</h1>
        <p className="text-sm text-text-secondary mt-1">
          Your AI-powered media buying assistant with 10+ years of experience
        </p>
      </div>
      <AIChatClient />
    </div>
  );
}
