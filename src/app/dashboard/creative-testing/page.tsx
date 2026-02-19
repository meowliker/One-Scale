import { CreativeTestingClient } from '@/components/creative-testing/CreativeTestingClient';

export default function CreativeTestingPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-text-primary">Creative Testing</h1>
        <p className="text-sm text-text-secondary mt-1">Schedule, test, and optimize your ad creatives</p>
      </div>
      <CreativeTestingClient />
    </div>
  );
}
