/** A demo band: sample data a person can try things in (workspaces.settings.demo). */
export function isDemoWorkspace(workspace: { settings?: unknown } | null | undefined): boolean {
  const s = workspace?.settings
  return !!s && typeof s === 'object' && !Array.isArray(s) && (s as Record<string, unknown>).demo === true
}

/**
 * The workspaces whose things may show up together (Personal's "everything" views, the bell). A demo band keeps to
 * itself: inside it you see only it, and from anywhere else it's left out.
 */
export function withoutDemos<M extends { workspace: { id: string; settings?: unknown } }>(memberships: M[], currentId: string): M[] {
  const current = memberships.find(m => m.workspace.id === currentId)
  if (current && isDemoWorkspace(current.workspace)) return [current]
  return memberships.filter(m => !isDemoWorkspace(m.workspace))
}

/** Should something from this workspace show while you're in `currentId`? Demo things only inside their own demo. */
export function visibleFrom<M extends { workspace: { id: string; settings?: unknown } }>(memberships: M[], currentId: string, workspaceId: string | null): boolean {
  const ws = memberships.find(m => m.workspace.id === workspaceId)?.workspace
  if (!ws || !isDemoWorkspace(ws)) {
    // Real things don't show inside a demo band.
    const current = memberships.find(m => m.workspace.id === currentId)?.workspace
    return !(current && isDemoWorkspace(current))
  }
  return ws.id === currentId
}
