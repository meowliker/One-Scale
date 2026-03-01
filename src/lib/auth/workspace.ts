let cachedWorkspaceId: string | null = null;

export async function getWorkspaceId(): Promise<string | undefined> {
  if (cachedWorkspaceId) return cachedWorkspaceId;
  try {
    const res = await fetch('/api/auth/session', { cache: 'no-store' });
    if (!res.ok) return undefined;
    const body = await res.json();
    const wsId = body?.user?.workspaceId;
    if (wsId) cachedWorkspaceId = wsId;
    return wsId || undefined;
  } catch {
    return undefined;
  }
}
