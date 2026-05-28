import { redirect } from 'next/navigation';

export default async function DashboardCreativeHubLaunchPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const nextParams = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (Array.isArray(value)) {
      for (const item of value) {
        if (item != null) nextParams.append(key, item);
      }
    } else if (value != null) {
      nextParams.set(key, value);
    }
  }

  const query = nextParams.toString();
  redirect(`/creative-hub/launch${query ? `?${query}` : ''}`);
}
