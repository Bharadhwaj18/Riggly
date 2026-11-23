/** A demo band: sample data a person can try things in (workspaces.settings.demo). */
export function isDemoWorkspace(workspace: { settings?: unknown } | null | undefined): boolean {
  const s = workspace?.settings
  return !!s && typeof s === 'object' && !Array.isArray(s) && (s as Record<string, unknown>).demo === true
}
