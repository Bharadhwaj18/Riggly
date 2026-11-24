import { NoAccess } from '@/components/layout/NoAccess'
import { AccessEnded } from '@/components/layout/AccessEnded'
import { getWorkspaceContext } from '@/lib/workspace'
import { sectionLabelOf, type SectionKey } from '@/lib/workspace-sections'

/**
 * Checked on the server for every request to a section page. Returns the no-access screen when the
 * signed-in member's access to that section is off in the current workspace, otherwise null.
 *
 * `alsoVia`: for a single item's page, the sections whose shared items bring this one along (a setlist's songs,
 * a show's setlists). The page opens if any of those is open; the database then only returns the item if it
 * really is theirs to see, and the page shows "not found" otherwise.
 */
export async function sectionGuard(key: SectionKey, alsoVia: SectionKey[] = []) {
  const ctx = await getWorkspaceContext()
  if (!ctx) return null
  if (ctx.current.accessEnded) return <AccessEnded workspaceName={ctx.current.workspace.name} accessUntil={ctx.current.accessUntil} />
  if ([key, ...alsoVia].some(k => ctx.current.sections[k] !== 'none')) return null
  return <NoAccess section={sectionLabelOf(key)} workspaceName={ctx.current.workspace.name} />
}
