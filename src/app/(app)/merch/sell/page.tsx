import { getCachedAllProfiles, getCachedMerch, getCachedShows, getCachedUser } from '@/lib/data'
import { redirect } from 'next/navigation'
import { getWorkspaceContext, isMerchApprover, merchScopeOf } from '@/lib/workspace'
import { sectionGuard } from '@/lib/section-guard'
import { SellView } from '@/components/merch/SellView'

export default async function MerchSellPage({ searchParams }: { searchParams: Promise<{ show?: string }> }) {
  // Merch crew sell from the kits they're on, not from the whole stock.
  const scopeCtx = await getWorkspaceContext()
  if (scopeCtx && merchScopeOf(scopeCtx.current) === 'crew') redirect('/merch')
  const denied = await sectionGuard('merch')
  if (denied) return denied
  const [{ show }, ctx, merch, shows, profiles, { data: { user } }] = await Promise.all([
    searchParams, getWorkspaceContext(), getCachedMerch(), getCachedShows(), getCachedAllProfiles(), getCachedUser(),
  ])

  // A show sells through its kit: go to it, or to packing one. Others get a note that there's no kit yet.
  const forShow = show ? shows.find(s => s.id === show) ?? null : null
  if (forShow) {
    const kit = merch.kits.find(k => k.show_id === forShow.id)
    if (kit) redirect(`/merch/kits/${kit.id}`)
    if (ctx && isMerchApprover(ctx.current)) redirect(`/merch/kits/new?show=${forShow.id}`)
  }

  return (
    <SellView
      items={merch.items.filter(i => !i.archived_at)}
      variants={merch.variants.filter(v => !v.archived_at)}
      moves={merch.moves}
      sales={merch.sales}
      members={profiles.map(p => ({ id: p.id, name: p.id === user?.id ? 'You' : (p.display_name?.trim() || 'Member') }))}
      userId={user?.id ?? ''}
      showWithoutKit={forShow?.title ?? null}
      canEdit={ctx?.current.sections.merch === 'edit'}
      workspaceId={ctx?.current.workspace.id ?? ''}
      proofsBySale={merch.proofsBySale}
    />
  )
}
