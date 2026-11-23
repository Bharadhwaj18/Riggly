'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Archive, ArchiveRestore, CalendarDays, ChevronRight, MoreHorizontal, Package, PackagePlus, Pencil, Plus, ShoppingBag, Shirt, SlidersHorizontal, Trash2 } from 'lucide-react'
import { PageHeader } from '@/components/ui/PageHeader'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { Modal } from '@/components/ui/Modal'
import { SegmentedTabs, Chip } from '@/components/ui/Chip'
import { SectionLabel } from '@/components/ui/SectionLabel'
import { StatusPill, type PillTone } from '@/components/ui/StatusPill'
import { useToast } from '@/components/ui/Toaster'
import { useMoney } from '@/components/finance/FinanceSettingsContext'
import { cn } from '@/lib/utils'
import { formatDateDMY } from '@/lib/dates'
import { isUpcoming, todayISO } from '@/lib/shows'
import { REASON_LABELS, isLowStock, isMoveReason, outInKits, statsByVariant, statsFor, sumStats, variantPrice, type MerchBatch, type MerchItem, type MerchKitLine, type MerchMove, type MerchVariant } from '@/lib/merch'
import { buildMerchTimeline, type TimelineStatus } from '@/lib/merch-timeline'
import { deleteMerchBatch, deleteMerchItem, deleteMerchMove, setMerchItemArchived, setMerchVariantArchived } from '@/actions/merch'
import { AdjustModal, ItemModal, RestockModal, VariantModal, type ShowOption } from './MerchForms'
import { PendingApprovals, type AccountOption, type Person, type SaleWithShow } from './MerchSales'
import { type KitWithShow } from './Kits'
import { MerchReports } from './MerchReports'

type MoveWithShow = MerchMove & { show: { id: string; title: string; show_date: string | null } | null }

interface Props {
  items: MerchItem[]
  variants: MerchVariant[]
  moves: MoveWithShow[]
  batches: MerchBatch[]
  shows: ShowOption[]
  sales: SaleWithShow[]
  kits: KitWithShow[]
  kitLines: MerchKitLine[]
  members: Person[]
  accounts: AccountOption[]
  canEdit: boolean
  canApprove: boolean
  userId: string
}

type Tab = 'stock' | 'shows' | 'activity'
type Stats = ReturnType<typeof statsByVariant>

export function MerchView({ items, variants, moves, batches, shows, sales, kits, kitLines, members, accounts, canEdit, canApprove, userId }: Props) {
  const { money } = useMoney()
  const [tab, setTab] = useState<Tab>('stock')
  const [showArchived, setShowArchived] = useState(false)
  const [openItemId, setOpenItemId] = useState<string | null>(null)

  const [itemModal, setItemModal] = useState<{ open: boolean; item: MerchItem | null }>({ open: false, item: null })
  const [variantModal, setVariantModal] = useState<{ open: boolean; item: MerchItem | null; variant: MerchVariant | null }>({ open: false, item: null, variant: null })
  const [restock, setRestock] = useState<{ open: boolean; itemId: string | null }>({ open: false, itemId: null })
  const [adjust, setAdjust] = useState<{ open: boolean; item: MerchItem | null; variant: MerchVariant | null }>({ open: false, item: null, variant: null })

  const stats = useMemo(() => statsByVariant(moves), [moves])
  const out = useMemo(() => outInKits(kits, kitLines, moves), [kits, kitLines, moves])
  const nameOf = (id: string | null) => members.find(m => m.id === id)?.name ?? 'Nobody yet'
  const activeItems = items.filter(i => !i.archived_at)
  const archivedItems = items.filter(i => i.archived_at)
  const liveVariants = variants.filter(v => !v.archived_at && activeItems.some(i => i.id === v.item_id))

  const totals = {
    ...sumStats(liveVariants.map(v => statsFor(stats, v.id))),
    stockValue: liveVariants.reduce((sum, v) => { const s = statsFor(stats, v.id); return sum + (s.avgCost != null ? Math.max(0, s.stock) * s.avgCost : 0) }, 0),
    low: liveVariants.filter(v => isLowStock(v, statsFor(stats, v.id).stock)).length,
    empty: liveVariants.filter(v => statsFor(stats, v.id).stock <= 0).length,
  }

  const closedKits = kits.filter(k => k.status === 'closed').map(k => ({
    id: k.id, title: k.show?.title ?? 'Deleted show', date: k.show?.show_date ?? null, closedBy: nameOf(k.closed_by),
    money: Number(k.cash_in ?? 0) + Number(k.upi_in ?? 0) + Number(k.card_in ?? 0),
  }))

  // The next show and how its merch stands: no kit yet, packed, or already sold.
  const today = todayISO()
  const nextShow = [...shows].filter(s => isUpcoming(s.show_date, today)).sort((a, b) => (a.show_date ?? '').localeCompare(b.show_date ?? ''))[0] ?? null
  const nextKit = nextShow ? kits.find(k => k.show?.id === nextShow.id) ?? null : null

  const shownItems = showArchived ? archivedItems : activeItems
  const openItem = items.find(i => i.id === openItemId) ?? null

  return (
    <div className="max-w-4xl">
      <PageHeader
        title="Merch"
        subtitle="What’s in the box, what it cost, and what went out."
        action={canEdit && items.length > 0 ? (
          <div className="flex items-center gap-2">
            <Button asChild><Link href="/merch/sell"><ShoppingBag className="h-4 w-4" />Sell</Link></Button>
            <MoreMenu items={[
              ...(canApprove ? [{ label: 'Pack a kit for a show', icon: Package, href: '/merch/kits/new' }] : []),
              { label: 'Restock', icon: PackagePlus, onSelect: () => setRestock({ open: true, itemId: null }) },
              { label: 'New item', icon: Plus, onSelect: () => setItemModal({ open: true, item: null }) },
            ]} />
          </div>
        ) : undefined}
      />

      {items.length === 0 ? (
        <EmptyState
          icon={<Shirt className="h-10 w-10" />}
          title="No merch yet"
          description="Add your first item, like a tee with its sizes, then log the stock you have."
          action={canEdit ? <Button onClick={() => setItemModal({ open: true, item: null })}><Plus className="h-4 w-4" />Add an item</Button> : undefined}
        />
      ) : (
        <>
          {nextShow && <NextShowCard show={nextShow} kit={nextKit} canApprove={canApprove} leadName={nextKit ? nameOf(nextKit.lead_id) : null} />}

          <PendingApprovals sales={sales.filter(s => !s.kit_id)} moves={moves} members={members} accounts={accounts} canApprove={canApprove} userId={userId} closedKits={closedKits} />

          <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Tile label="In stock" value={`${totals.stock}`} sub={`worth ${money(totals.stockValue)} at cost`} />
            <Tile label="Sizes to restock" value={`${totals.empty + totals.low}`} sub={totals.empty ? `${totals.empty} empty, ${totals.low} low` : totals.low ? `${totals.low} running low` : 'all fine'} warn={totals.empty + totals.low > 0} />
            <Tile label="Sold" value={`${totals.sold}`} sub="units, all time" />
            <Tile label="Takings" value={money(totals.revenue)} sub="all time" />
          </div>

          <SegmentedTabs className="mb-4" value={tab} onChange={setTab} tabs={[{ value: 'stock', label: 'Stock' }, { value: 'shows', label: 'Shows' }, { value: 'activity', label: 'Activity' }]} />

          {tab === 'stock' ? (
            <div className="space-y-4">
              {archivedItems.length > 0 && (
                <div className="flex gap-2">
                  <Chip active={!showArchived} onClick={() => setShowArchived(false)}>Current</Chip>
                  <Chip active={showArchived} onClick={() => setShowArchived(true)}>Archived ({archivedItems.length})</Chip>
                </div>
              )}
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {shownItems.map(item => (
                  <ItemTile key={item.id} item={item} variants={variants.filter(v => v.item_id === item.id && !v.archived_at)} stats={stats} onOpen={() => setOpenItemId(item.id)} />
                ))}
                {canEdit && !showArchived && (
                  <button type="button" onClick={() => setItemModal({ open: true, item: null })}
                    className="flex min-h-40 flex-col items-center justify-center gap-1.5 rounded-2xl border-2 border-dashed border-brand-200 text-sm font-semibold text-gray-500 hover:border-brand-300 hover:text-gray-700">
                    <Plus className="h-5 w-5" /> New item
                  </button>
                )}
              </div>
              {shownItems.length === 0 && <p className="py-6 text-center text-sm text-gray-500">Nothing here.</p>}
            </div>
          ) : tab === 'shows' ? (
            <ShowsTab kits={kits} moves={moves} sales={sales} items={items} variants={variants} />
          ) : (
            <History moves={moves} items={items} variants={variants} batches={batches} canEdit={canEdit} />
          )}
        </>
      )}

      <ItemSheet
        item={openItem}
        variants={openItem ? variants.filter(v => v.item_id === openItem.id) : []}
        stats={stats}
        out={out}
        canEdit={canEdit}
        onClose={() => setOpenItemId(null)}
        onEdit={item => setItemModal({ open: true, item })}
        onAddVariant={item => setVariantModal({ open: true, item, variant: null })}
        onEditVariant={(item, variant) => setVariantModal({ open: true, item, variant })}
        onRestock={item => setRestock({ open: true, itemId: item.id })}
        onAdjust={(item, variant) => setAdjust({ open: true, item, variant })}
      />
      <ItemModal open={itemModal.open} onOpenChange={open => setItemModal(m => ({ ...m, open }))} item={itemModal.item} />
      <VariantModal open={variantModal.open} onOpenChange={open => setVariantModal(m => ({ ...m, open }))} item={variantModal.item} variant={variantModal.variant} />
      <RestockModal open={restock.open} onOpenChange={open => setRestock(m => ({ ...m, open }))} items={activeItems} variants={variants} focusItemId={restock.itemId} />
      <AdjustModal
        open={adjust.open} onOpenChange={open => setAdjust(m => ({ ...m, open }))}
        item={adjust.item} variant={adjust.variant} shows={shows}
        stock={adjust.variant ? statsFor(stats, adjust.variant.id).stock : 0}
      />
    </div>
  )
}

// ---- Header menu --------------------------------------------------------------------------------------------------

type MenuEntry = { label: string; icon: typeof Plus; href?: string; onSelect?: () => void }

/** The less frequent actions, tucked behind one button so Sell stands out. */
function MoreMenu({ items }: { items: MenuEntry[] }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !ref.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', close)
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', close) }
  }, [open])

  return (
    <div ref={ref} className="relative">
      <Button variant="secondary" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(o => !o)}><MoreHorizontal className="h-4 w-4" />More</Button>
      {open && (
        <div role="menu" className="absolute right-0 z-30 mt-2 w-56 overflow-hidden rounded-xl border border-brand-200 bg-white py-1 shadow-lg">
          {items.map(({ label, icon: Icon, href, onSelect }) => {
            const cls = 'flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-sm font-medium text-gray-800 hover:bg-brand-50'
            return href
              ? <Link key={label} role="menuitem" href={href} className={cls} onClick={() => setOpen(false)}><Icon className="h-4 w-4 text-gray-500" />{label}</Link>
              : <button key={label} role="menuitem" type="button" className={cls} onClick={() => { setOpen(false); onSelect?.() }}><Icon className="h-4 w-4 text-gray-500" />{label}</button>
          })}
        </div>
      )}
    </div>
  )
}

// ---- Next show ----------------------------------------------------------------------------------------------------

function NextShowCard({ show, kit, canApprove, leadName }: { show: ShowOption; kit: KitWithShow | null; canApprove: boolean; leadName: string | null }) {
  const when = show.show_date ? formatDateDMY(show.show_date) : 'Date not set'
  const state = !kit
    ? { text: 'No merch packed yet.', action: canApprove ? <Button size="sm" asChild><Link href={`/merch/kits/new?show=${show.id}`}><Package className="h-4 w-4" />Pack a kit</Link></Button> : null }
    : kit.status === 'open'
      ? { text: `Kit packed${leadName ? `, ${leadName} runs the stall` : ''}.`, action: <Button size="sm" asChild><Link href={`/merch/kits/${kit.id}`}><ShoppingBag className="h-4 w-4" />Open the stall</Link></Button> }
      : { text: kit.status === 'closed' ? 'Stall closed, waiting for approval.' : 'Done and approved.', action: <Button size="sm" variant="secondary" asChild><Link href={`/merch/kits/${kit.id}`}>View kit</Link></Button> }

  return (
    <div className="mb-4 flex flex-wrap items-center gap-3 rounded-2xl bg-hero p-4 text-hero-fg">
      <CalendarDays className="h-5 w-5 shrink-0 text-sidebar-accent" />
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-sidebar-accent">Next show</p>
        <p className="truncate font-bold">{show.title}<span className="font-normal opacity-80"> · {when}{show.venue ? ` · ${show.venue}` : ''}</span></p>
        <p className="text-sm opacity-80">{state.text}</p>
      </div>
      {state.action}
    </div>
  )
}

function Tile({ label, value, sub, warn }: { label: string; value: string; sub: string; warn?: boolean }) {
  return (
    <div className="min-w-0 overflow-hidden rounded-2xl border border-brand-200 bg-white px-3 py-2.5 shadow-sm sm:px-4 sm:py-3">
      <p className="truncate text-[11px] font-semibold text-gray-500 sm:text-xs">{label}</p>
      <p className={cn('mt-0.5 truncate text-lg font-bold tabular-nums sm:text-xl', warn ? 'text-amber-600' : 'text-gray-900')}>{value}</p>
      <p className="break-words text-[11px] leading-snug text-gray-500 sm:text-xs">{sub}</p>
    </div>
  )
}

/** Runs a small action (archive, delete) with a toast and a refresh. */
function useQuickAction() {
  const router = useRouter()
  const toast = useToast()
  return async (action: () => Promise<{ error?: string }>, success: string) => {
    const res = await action()
    if (res.error) { toast(res.error, 'error'); return false }
    toast(success, 'success')
    router.refresh()
    return true
  }
}

// ---- Stock grid ---------------------------------------------------------------------------------------------------

const sizeTone = (variant: MerchVariant, stock: number) =>
  stock <= 0 ? 'bg-red-100 text-red-700' : isLowStock(variant, stock) ? 'bg-amber-100 text-amber-800' : 'bg-gray-100 text-gray-700'

/** One item in the stock grid: its picture, price and how many of each size are left. */
function ItemTile({ item, variants, stats, onOpen }: { item: MerchItem; variants: MerchVariant[]; stats: Stats; onOpen: () => void }) {
  const { money } = useMoney()
  const total = sumStats(variants.map(v => statsFor(stats, v.id)))
  return (
    <button type="button" onClick={onOpen} className={cn('flex flex-col overflow-hidden rounded-2xl border border-brand-200 bg-white text-left shadow-sm transition-shadow hover:shadow-md', item.archived_at && 'opacity-60')}>
      <ItemPicture item={item} className="aspect-[4/3] w-full" />
      <div className="flex flex-1 flex-col gap-2 p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-sm font-bold text-gray-900">{item.name}</p>
            <p className="text-xs text-gray-500">{money(Number(item.price))}</p>
          </div>
          <span className="shrink-0 text-right">
            <span className="block text-base font-bold tabular-nums text-gray-900">{total.stock}</span>
            <span className="block text-[10px] text-gray-500">left</span>
          </span>
        </div>
        {variants.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {variants.map(v => {
              const s = statsFor(stats, v.id).stock
              return <span key={v.id} className={cn('rounded-md px-1.5 py-0.5 text-[11px] font-bold tabular-nums', sizeTone(v, s))}>{v.label} {s}</span>
            })}
          </div>
        )}
      </div>
    </button>
  )
}

// A soft colour per item, so items without a photo still look different from each other.
const PLACEHOLDER_TONES = ['bg-brand-100 text-brand-600', 'bg-amber-100 text-amber-700', 'bg-emerald-100 text-emerald-700', 'bg-sky-100 text-sky-700', 'bg-rose-100 text-rose-700']

function ItemPicture({ item, className }: { item: MerchItem; className?: string }) {
  if (item.image_url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={item.image_url} alt="" className={cn('object-cover', className)} />
  }
  const tone = PLACEHOLDER_TONES[[...item.id].reduce((n, c) => n + c.charCodeAt(0), 0) % PLACEHOLDER_TONES.length]
  return (
    <div className={cn('flex items-center justify-center', tone, className)}>
      <Shirt className="h-10 w-10 opacity-70" />
    </div>
  )
}

/** Everything about one item: each size's stock and sales, and the actions that used to crowd the list. */
function ItemSheet({ item, variants, stats, out, canEdit, onClose, onEdit, onAddVariant, onEditVariant, onRestock, onAdjust }: {
  item: MerchItem | null
  variants: MerchVariant[]
  stats: Stats
  out: Map<string, number>
  canEdit: boolean
  onClose: () => void
  onEdit: (item: MerchItem) => void
  onAddVariant: (item: MerchItem) => void
  onEditVariant: (item: MerchItem, v: MerchVariant) => void
  onRestock: (item: MerchItem) => void
  onAdjust: (item: MerchItem, v: MerchVariant) => void
}) {
  const { money } = useMoney()
  const quick = useQuickAction()
  const [showArchivedVariants, setShowArchivedVariants] = useState(false)
  if (!item) return null

  const live = variants.filter(v => !v.archived_at)
  const archived = variants.filter(v => v.archived_at)
  const total = sumStats(live.map(v => statsFor(stats, v.id)))
  const isArchived = !!item.archived_at
  const rows = showArchivedVariants ? variants : live
  // Opening another form closes this sheet first, so two dialogs never stack.
  const then = (fn: () => void) => () => { onClose(); fn() }

  return (
    <Modal open onOpenChange={o => { if (!o) onClose() }} title={item.name} className="max-w-lg">
      <div className="space-y-4">
        <div className="flex gap-3">
          <ItemPicture item={item} className="h-20 w-20 shrink-0 rounded-xl" />
          <div className="min-w-0 text-sm">
            <p className="text-gray-900"><span className="font-bold">{money(Number(item.price))}</span>{item.kind && <span className="text-gray-500"> · {item.kind}</span>}</p>
            <p className="text-gray-500">{total.stock} in stock · {total.sold} sold{total.avgCost != null ? ` · costs ${money(total.avgCost)}` : ''}</p>
            {isArchived && <StatusPill className="mt-1">Archived</StatusPill>}
          </div>
        </div>

        <ul className="divide-y divide-brand-100 rounded-xl border border-brand-200">
          {rows.map(v => {
            const s = statsFor(stats, v.id)
            const low = !v.archived_at && isLowStock(v, s.stock)
            const away = out.get(v.id) ?? 0
            return (
              <li key={v.id} className={cn('flex flex-wrap items-center gap-x-3 gap-y-1.5 px-3 py-2.5', v.archived_at && 'opacity-60')}>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-gray-900">{v.label}{v.archived_at && <span className="ml-1.5 text-xs font-normal text-gray-500">archived</span>}</p>
                  <p className="text-xs text-gray-500">{[`${s.sold} sold`, money(variantPrice(item, v)), away ? `${away} out at a show` : null].filter(Boolean).join(' · ')}</p>
                </div>
                <span className={cn('rounded-md px-2 py-0.5 text-sm font-bold tabular-nums', sizeTone(v, s.stock))} title={low ? `Low: warns at ${v.low_stock_at}` : undefined}>{s.stock} left</span>
                {canEdit && !isArchived && (
                  <div className="flex w-full justify-end gap-1 sm:w-auto">
                    {!v.archived_at && <SmallAction onClick={then(() => onAdjust(item, v))}><SlidersHorizontal className="h-3.5 w-3.5" />Adjust</SmallAction>}
                    <SmallAction onClick={then(() => onEditVariant(item, v))}><Pencil className="h-3.5 w-3.5" />Edit</SmallAction>
                    {v.archived_at
                      ? <SmallAction onClick={() => quick(() => setMerchVariantArchived(v.id, false), `${v.label} restored`)}><ArchiveRestore className="h-3.5 w-3.5" />Restore</SmallAction>
                      : <SmallAction onClick={() => quick(() => setMerchVariantArchived(v.id, true), `${v.label} archived`)}><Archive className="h-3.5 w-3.5" />Archive</SmallAction>}
                  </div>
                )}
              </li>
            )
          })}
          {rows.length === 0 && <li className="px-3 py-4 text-center text-sm text-gray-500">No sizes yet.</li>}
        </ul>

        {archived.length > 0 && (
          <button type="button" onClick={() => setShowArchivedVariants(s => !s)} className="text-xs text-gray-500 hover:underline">
            {showArchivedVariants ? 'Hide archived sizes' : `Show ${archived.length} archived size${archived.length === 1 ? '' : 's'}`}
          </button>
        )}

        {canEdit && (
          <div className="flex flex-wrap gap-2 border-t border-brand-100 pt-3">
            {!isArchived ? (
              <>
                <Button size="sm" onClick={then(() => onRestock(item))}><PackagePlus className="h-4 w-4" />Restock</Button>
                <Button size="sm" variant="secondary" onClick={then(() => onAddVariant(item))}><Plus className="h-4 w-4" />Add size</Button>
                <Button size="sm" variant="secondary" onClick={then(() => onEdit(item))}><Pencil className="h-4 w-4" />Edit item</Button>
                <Button size="sm" variant="ghost" className="ml-auto" onClick={async () => { if (await quick(() => setMerchItemArchived(item.id, true), `${item.name} archived`)) onClose() }}><Archive className="h-4 w-4" />Archive</Button>
              </>
            ) : (
              <>
                <Button size="sm" variant="secondary" onClick={async () => { if (await quick(() => setMerchItemArchived(item.id, false), `${item.name} restored`)) onClose() }}><ArchiveRestore className="h-4 w-4" />Restore</Button>
                <Button size="sm" variant="ghost" className="ml-auto text-red-700" onClick={async () => { if (confirm(`Delete ${item.name}? This can’t be undone.`) && await quick(() => deleteMerchItem(item.id), `${item.name} deleted`)) onClose() }}><Trash2 className="h-4 w-4" />Delete</Button>
              </>
            )}
          </div>
        )}
      </div>
    </Modal>
  )
}

function SmallAction({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold text-gray-600 hover:bg-brand-100 hover:text-gray-900">
      {children}
    </button>
  )
}

function IconButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} aria-label={label} title={label} className="rounded-md p-1.5 text-gray-500 transition-colors hover:bg-brand-100 hover:text-gray-900">
      {children}
    </button>
  )
}

// ---- Shows timeline -----------------------------------------------------------------------------------------------

const STATUS_PILL: Record<TimelineStatus, { tone: PillTone; label: string }> = {
  open: { tone: 'gray', label: 'At the show' },
  waiting: { tone: 'amber', label: 'Waiting for approval' },
  done: { tone: 'green', label: 'In Finance' },
}

/** Every show that had merch, newest first, with a switch to the full report. */
function ShowsTab({ kits, moves, sales, items, variants }: { kits: KitWithShow[]; moves: MoveWithShow[]; sales: SaleWithShow[]; items: MerchItem[]; variants: MerchVariant[] }) {
  const { money } = useMoney()
  const [view, setView] = useState<'timeline' | 'report'>('timeline')
  const rows = useMemo(() => buildMerchTimeline({ kits, moves, sales }), [kits, moves, sales])

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <Chip active={view === 'timeline'} onClick={() => setView('timeline')}>Show by show</Chip>
        <Chip active={view === 'report'} onClick={() => setView('report')}>Report and export</Chip>
      </div>
      {view === 'report' ? (
        <MerchReports items={items} variants={variants} moves={moves} sales={sales} kits={kits} />
      ) : rows.length === 0 ? (
        <p className="py-6 text-center text-sm text-gray-500">No shows with merch yet. Pack a kit for your next show, or use Sell.</p>
      ) : (
        <ol className="relative space-y-3 border-l-2 border-brand-100 pl-5">
          {rows.map(r => {
            const pill = STATUS_PILL[r.status]
            const body = (
              <>
                <span className="absolute -left-[1.6rem] top-4 h-3 w-3 rounded-full border-2 border-white bg-brand-400" aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-gray-900">{r.title}</p>
                  <p className="text-xs text-gray-500">{[r.date && formatDateDMY(r.date), r.kitId ? 'Kit' : 'Sell page', `${r.units} sold`].filter(Boolean).join(' · ')}</p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <span className="text-sm font-bold tabular-nums text-gray-900">{money(r.money)}</span>
                  <StatusPill tone={pill.tone}>{pill.label}</StatusPill>
                </div>
                {r.href && <ChevronRight className="h-4 w-4 shrink-0 text-gray-400" />}
              </>
            )
            const cls = 'relative flex items-center gap-3 rounded-2xl border border-brand-200 bg-white px-4 py-3 shadow-sm'
            return (
              <li key={r.key}>
                {r.href ? <Link href={r.href} className={cn(cls, 'hover:bg-brand-50')}>{body}</Link> : <div className={cls}>{body}</div>}
              </li>
            )
          })}
        </ol>
      )}
    </div>
  )
}

// ---- Activity -----------------------------------------------------------------------------------------------------

type HistoryRow =
  | { kind: 'batch'; key: string; date: string; created: string; batch: MerchBatch; moves: MoveWithShow[] }
  | { kind: 'move'; key: string; date: string; created: string; move: MoveWithShow }

function History({ moves, items, variants, batches, canEdit }: { moves: MoveWithShow[]; items: MerchItem[]; variants: MerchVariant[]; batches: MerchBatch[]; canEdit: boolean }) {
  const { money } = useMoney()
  const quick = useQuickAction()

  const nameOf = useMemo(() => {
    const itemById = new Map(items.map(i => [i.id, i]))
    const map = new Map(variants.map(v => [v.id, { item: itemById.get(v.item_id)?.name ?? 'Item', variant: v.label }]))
    return (variantId: string) => map.get(variantId) ?? { item: 'Removed item', variant: '' }
  }, [items, variants])

  // A restock shows as one row with its lines; everything else is one row per move.
  const rows = useMemo<HistoryRow[]>(() => {
    const byBatch = new Map<string, MoveWithShow[]>()
    const out: HistoryRow[] = []
    for (const m of moves) {
      if (m.batch_id) byBatch.set(m.batch_id, [...(byBatch.get(m.batch_id) ?? []), m])
      else out.push({ kind: 'move', key: m.id, date: m.date, created: m.created_at, move: m })
    }
    for (const b of batches) out.push({ kind: 'batch', key: b.id, date: b.date, created: b.created_at, batch: b, moves: byBatch.get(b.id) ?? [] })
    return out.sort((a, b) => (a.date === b.date ? b.created.localeCompare(a.created) : b.date.localeCompare(a.date)))
  }, [moves, batches])

  if (!rows.length) return <p className="py-6 text-center text-sm text-gray-500">Nothing logged yet. Restocks, sales and adjustments show up here.</p>

  return (
    <div className="space-y-1">
      {rows.map((row, i) => {
        const header = row.date !== rows[i - 1]?.date ? <SectionLabel className="pb-1 pt-3">{formatDateDMY(row.date)}</SectionLabel> : null
        if (row.kind === 'batch') {
          const units = row.moves.reduce((n, m) => n + m.qty, 0)
          return (
            <div key={row.key}>
              {header}
              <div className="flex items-start gap-3 rounded-xl border border-brand-100 bg-white px-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-gray-900">Restock{row.batch.supplier ? ` from ${row.batch.supplier}` : ''}</p>
                  <p className="text-xs text-gray-500">
                    {row.moves.map(m => { const n = nameOf(m.variant_id); return `${n.item} ${n.variant} ×${m.qty}` }).join(', ')}
                  </p>
                  {row.batch.notes && <p className="mt-0.5 text-xs text-gray-500">{row.batch.notes}</p>}
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-sm font-semibold tabular-nums text-brand-400 dark:text-emerald-400">+{units}</p>
                  {Number(row.batch.total_cost) > 0 && <p className="text-xs tabular-nums text-gray-500">{money(Number(row.batch.total_cost))}</p>}
                </div>
                {canEdit && (
                  <IconButton label="Delete restock" onClick={() => { if (confirm('Delete this restock and the stock it added?')) void quick(() => deleteMerchBatch(row.batch.id), 'Restock deleted') }}>
                    <Trash2 className="h-4 w-4" />
                  </IconButton>
                )}
              </div>
            </div>
          )
        }
        const m = row.move
        const n = nameOf(m.variant_id)
        const reason = isMoveReason(m.reason) ? REASON_LABELS[m.reason] : m.reason
        return (
          <div key={row.key}>
            {header}
            <div className="flex items-start gap-3 rounded-xl border border-brand-100 bg-white px-3 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-gray-900">{reason} · {n.item} {n.variant}</p>
                <p className="text-xs text-gray-500">
                  {[m.show ? `at ${m.show.title}` : null, m.unit_price != null ? `${money(Number(m.unit_price))} each` : null, m.note].filter(Boolean).join(' · ') || ' '}
                </p>
              </div>
              <p className={cn('shrink-0 text-sm font-semibold tabular-nums', m.qty > 0 ? 'text-brand-400 dark:text-emerald-400' : 'text-red-700')}>
                {m.qty > 0 ? `+${m.qty}` : `−${Math.abs(m.qty)}`}
              </p>
              {canEdit && !m.sale_id && (
                <IconButton label="Undo this entry" onClick={() => { if (confirm('Undo this stock entry?')) void quick(() => deleteMerchMove(m.id), 'Entry removed') }}>
                  <Trash2 className="h-4 w-4" />
                </IconButton>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
