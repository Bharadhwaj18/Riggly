'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Check, Minus, Pencil, Plus } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Label } from '@/components/ui/Label'
import { SectionLabel } from '@/components/ui/SectionLabel'
import { useMoney } from '@/components/finance/FinanceSettingsContext'
import { useToast } from '@/components/ui/Toaster'
import { updateKitSale } from '@/actions/merch-kits'
import { cn } from '@/lib/utils'
import { closeoutCounts, expectedTotal, kitLeft, type ShortReason } from '@/lib/merch'
import type { KitLineView } from './KitView'

const REASONS: { value: ShortReason; label: string }[] = [
  { value: 'sold', label: 'Sold' },
  { value: 'given', label: 'Given away' },
  { value: 'lost', label: 'Lost' },
]

const METHODS = [
  { value: 'cash', label: 'Cash' },
  { value: 'upi', label: 'UPI' },
  { value: 'card', label: 'Card' },
] as const

type Paid = { cash: number; upi: number; card: number }

export interface SaleItem { name: string; qty: number; price: number }
export interface StallSale { id: string; at: string; items: SaleItem[]; method: 'cash' | 'upi' | 'card'; amount: number }

/**
 * End of night in three steps, each already answered from what the stall recorded:
 *   1. Stock: is everything that wasn't sold still remaining? Only if not, change the items that differ.
 *   2. Money: does it match what those sales should bring in? Only if not, enter what you have.
 *   3. Check the summary and close.
 */
export function CloseKitSteps({ kitId, lines, stallSales, tappedBy, onClose, onCancel }: {
  kitId: string
  lines: KitLineView[]
  /** Every sale tapped at the stall, oldest first in the table. */
  stallSales: StallSale[]
  tappedBy: Paid
  onClose: (counts: { variantId: string; returned: number; given: number; lost: number }[], paid: Paid, notes: string) => Promise<boolean>
  onCancel: () => void
}) {
  const { money, symbol } = useMoney()
  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [differs, setDiffers] = useState(false)
  // Per item: how many are remaining (starts at what should be left) and why any shortfall happened.
  const [remaining, setRemaining] = useState<Record<string, number>>(() => Object.fromEntries(lines.map(l => [l.variantId, kitLeft(l.taken, l.sold)])))
  const [reasons, setReasons] = useState<Record<string, ShortReason>>({})
  const [moneyDiffers, setMoneyDiffers] = useState(false)
  const [paidText, setPaidText] = useState<Record<keyof Paid, string> | null>(null)
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)

  const counts = closeoutCounts(lines, remaining, reasons)
  const went = lines.reduce((n, l) => n + l.taken, 0)
  const soldAtStall = lines.reduce((n, l) => n + l.sold, 0)
  const shouldRemain = lines.reduce((n, l) => n + kitLeft(l.taken, l.sold), 0)
  const soldTotal = counts.reduce((n, c) => n + c.soldTotal, 0)
  const given = counts.reduce((n, c) => n + c.given, 0)
  const lost = counts.reduce((n, c) => n + c.lost, 0)
  const shouldBe = expectedTotal(counts.map(c => ({ qty: c.soldTotal, price: c.price })))
  const stallMoney = tappedBy.cash + tappedBy.upi + tappedBy.card

  // What we expect handed in: the stall's money, with any extra (items sold but not tapped) as cash.
  const suggested: Paid = { ...tappedBy, cash: tappedBy.cash + Math.max(0, shouldBe - stallMoney) }
  const paid: Paid = paidText
    ? { cash: Number(paidText.cash || 0), upi: Number(paidText.upi || 0), card: Number(paidText.card || 0) }
    : suggested
  const handing = Math.round((paid.cash + paid.upi + paid.card) * 100) / 100
  const fmtAmt = (n: number) => (n > 0 ? String(Math.round(n * 100) / 100) : '')

  const close = async () => {
    setBusy(true)
    await onClose(counts.map(c => ({ variantId: c.variantId, returned: c.returned, given: c.given, lost: c.lost })), paid, notes)
    setBusy(false)
  }

  return (
    <div className="space-y-4">
      <p className="text-xs font-semibold text-gray-500">Step {step} of 3 · {step === 1 ? 'Stock' : step === 2 ? 'Money' : 'Check'}</p>

      {step === 1 && (
        <>
          {!differs ? (
            <>
              <div>
                <p className="text-lg font-bold text-gray-900">Here’s what the stall recorded</p>
                <p className="text-sm text-gray-500">{went} went · {soldAtStall} sold · {shouldRemain} should be remaining</p>
              </div>
              <ItemTable rows={lines.map(l => ({ key: l.variantId, name: `${l.itemName} · ${l.label}`, sold: l.sold, remaining: kitLeft(l.taken, l.sold) }))} />
              <p className="font-semibold text-gray-900">Is that what’s remaining?</p>
            </>
          ) : null}
          {!differs ? (
            <div className="grid gap-2">
              <Button onClick={() => { setRemaining(Object.fromEntries(lines.map(l => [l.variantId, kitLeft(l.taken, l.sold)]))); setReasons({}); setStep(2) }}>
                <Check className="h-4 w-4" />Yes, that’s right
              </Button>
              <Button variant="secondary" onClick={() => setDiffers(true)}>No, something’s different</Button>
            </div>
          ) : (
            <>
              <p className="text-lg font-bold text-gray-900">What’s actually remaining?</p>
              <p className="text-xs text-gray-500">Change the items that differ. For anything missing, say what happened to it.</p>
              <ul className="max-h-[45vh] divide-y divide-brand-100 overflow-y-auto rounded-xl border border-brand-100">
                {counts.map(c => {
                  const l = lines.find(x => x.variantId === c.variantId)!
                  const max = kitLeft(l.taken, l.sold)
                  const set = (n: number) => setRemaining(r => ({ ...r, [c.variantId]: Math.min(max, Math.max(0, n)) }))
                  return (
                    <li key={c.variantId} className="px-3 py-2.5">
                      <div className="flex items-center gap-3">
                        <span className="min-w-0 flex-1 text-sm text-gray-900">
                          {l.itemName} · {l.label}
                          <span className="block text-[11px] text-gray-500">{max} should be remaining</span>
                        </span>
                        <button type="button" aria-label={`One fewer ${l.itemName} ${l.label}`} onClick={() => set(c.returned - 1)} className="rounded-md border border-brand-200 p-1.5 text-gray-600 hover:bg-brand-50"><Minus className="h-4 w-4" /></button>
                        <input aria-label={`${l.itemName} ${l.label} remaining`} type="number" inputMode="numeric" min={0} max={max} value={c.returned}
                          onChange={e => set(Math.trunc(Number(e.target.value || 0)))}
                          className="w-12 rounded-md border border-gray-300 bg-white px-1 py-1 text-center text-sm font-semibold text-gray-900 focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-400" />
                        <button type="button" aria-label={`One more ${l.itemName} ${l.label}`} onClick={() => set(c.returned + 1)} className="rounded-md border border-brand-200 p-1.5 text-gray-600 hover:bg-brand-50"><Plus className="h-4 w-4" /></button>
                      </div>
                      {c.short > 0 && (
                        <div className="mt-2 flex flex-wrap items-center gap-1.5">
                          <span className="text-xs text-gray-500">{c.short} missing:</span>
                          {REASONS.map(r => (
                            <button key={r.value} type="button" aria-pressed={c.reason === r.value} onClick={() => setReasons(x => ({ ...x, [c.variantId]: r.value }))}
                              className={cn('rounded-full px-2.5 py-1 text-xs font-bold', c.reason === r.value ? 'bg-brand-400 text-white' : 'bg-brand-100 text-gray-700')}>
                              {r.label}
                            </button>
                          ))}
                        </div>
                      )}
                    </li>
                  )
                })}
              </ul>
              <div className="flex justify-between gap-2">
                <Button variant="ghost" onClick={() => setDiffers(false)}>Cancel changes</Button>
                <Button onClick={() => setStep(2)}>Continue</Button>
              </div>
            </>
          )}
        </>
      )}

      {step === 2 && (
        <>
          <div>
            <p className="text-lg font-bold text-gray-900">Does the money match?</p>
            <p className="text-sm text-gray-500">{soldTotal} sold should bring in</p>
            <p className="mt-2 text-3xl font-bold tabular-nums text-gray-900">{money(shouldBe)}</p>
          </div>
          <SalesTable kitId={kitId} sales={stallSales} untapped={counts.flatMap(c => {
            const extra = c.soldTotal - (lines.find(l => l.variantId === c.variantId)?.sold ?? 0)
            const l = lines.find(x => x.variantId === c.variantId)!
            return extra > 0 ? [{ name: `${l.itemName} · ${l.label}`, qty: extra, price: c.price }] : []
          })} />
          {!moneyDiffers ? (
            <>
              <ul className="divide-y divide-brand-100 rounded-xl border border-brand-100 text-sm">
                {METHODS.filter(m => suggested[m.value] > 0).map(m => (
                  <li key={m.value} className="flex justify-between px-3 py-2"><span className="text-gray-600">{m.label}</span><span className="font-semibold tabular-nums text-gray-900">{money(suggested[m.value])}</span></li>
                ))}
                {suggested.cash + suggested.upi + suggested.card === 0 && <li className="px-3 py-2 text-gray-500">No money recorded at the stall.</li>}
              </ul>
              <div className="grid gap-2">
                <Button onClick={() => { setPaidText(null); setStep(3) }}><Check className="h-4 w-4" />Yes, it matches</Button>
                <Button variant="secondary" onClick={() => { setPaidText({ cash: fmtAmt(suggested.cash), upi: fmtAmt(suggested.upi), card: fmtAmt(suggested.card) }); setMoneyDiffers(true) }}>No, enter what I have</Button>
              </div>
              <p className="text-xs text-gray-500">Tap an amount in the table to correct a sale. UPI is usually exact, so most nights only cash needs counting.</p>
            </>
          ) : (
            <>
              <div className="grid grid-cols-3 gap-3">
                {METHODS.map(m => (
                  <div key={m.value} className="space-y-1.5">
                    <Label htmlFor={`close-${m.value}`}>{m.label} ({symbol})</Label>
                    <Input id={`close-${m.value}`} type="number" inputMode="decimal" min={0} step="0.01" placeholder="0"
                      value={paidText?.[m.value] ?? ''} onChange={e => setPaidText(p => ({ ...(p ?? { cash: '', upi: '', card: '' }), [m.value]: e.target.value }))} />
                  </div>
                ))}
              </div>
              <p className={cn('text-sm font-semibold', handing === shouldBe ? 'text-gray-900' : 'text-amber-600')}>
                Handing in {money(handing)}{handing !== shouldBe && ` (${handing < shouldBe ? 'short' : 'over'} by ${money(Math.abs(handing - shouldBe))})`}
              </p>
              <div className="flex justify-between gap-2">
                <Button variant="ghost" onClick={() => { setPaidText(null); setMoneyDiffers(false) }}>Cancel changes</Button>
                <Button onClick={() => setStep(3)}>Continue</Button>
              </div>
            </>
          )}
        </>
      )}

      {step === 3 && (
        <>
          <p className="text-lg font-bold text-gray-900">Close the kit?</p>
          <ItemTable
            rows={counts.map(c => {
              const l = lines.find(x => x.variantId === c.variantId)!
              return { key: c.variantId, name: `${l.itemName} · ${l.label}`, sold: c.soldTotal, remaining: c.returned, note: [c.given && `${c.given} given away`, c.lost && `${c.lost} lost`].filter(Boolean).join(', ') }
            })}
          />
          <ul className="divide-y divide-brand-100 rounded-xl border border-brand-100 text-sm">
            <Row label={`Sold (${soldTotal}) should bring in`} value={money(shouldBe)} />
            {given + lost > 0 && <Row label="Given away / lost" value={`${given} / ${lost}`} />}
          </ul>
          {/* The money handed in can still be changed here, right before closing. */}
          <div className="rounded-xl border border-brand-100 p-3">
            <div className="mb-2 flex items-baseline justify-between">
              <SectionLabel>Handing in</SectionLabel>
              <span className="text-lg font-bold tabular-nums text-gray-900">{money(handing)}</span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {METHODS.map(m => (
                <div key={m.value} className="space-y-1">
                  <Label htmlFor={`final-${m.value}`} className="text-xs">{m.label} ({symbol})</Label>
                  <Input id={`final-${m.value}`} type="number" inputMode="decimal" min={0} step="0.01" placeholder="0"
                    value={paidText ? paidText[m.value] : fmtAmt(paid[m.value])}
                    onChange={e => setPaidText(p => ({ ...(p ?? { cash: fmtAmt(paid.cash), upi: fmtAmt(paid.upi), card: fmtAmt(paid.card) }), [m.value]: e.target.value }))} />
                </div>
              ))}
            </div>
          </div>
          {handing !== shouldBe && (
            <p className="text-sm font-semibold text-amber-600">{handing < shouldBe ? 'Short' : 'Over'} by {money(Math.abs(handing - shouldBe))} against what was sold.</p>
          )}
          <div className="space-y-1.5">
            <SectionLabel>Note (optional)</SectionLabel>
            <Input value={notes} onChange={e => setNotes(e.target.value)} maxLength={2000} placeholder="Discounts, freebies, anything odd" />
          </div>
          <Button className="w-full" onClick={close} loading={busy}>Close kit</Button>
          <p className="text-center text-xs text-gray-500">An admin approves it into Finance.</p>
        </>
      )}

      <div className="flex justify-between border-t border-brand-100 pt-3">
        {step > 1
          ? <button type="button" onClick={() => setStep(s => (s === 3 ? 2 : 1))} className="inline-flex items-center gap-1 text-sm font-semibold text-gray-600 hover:text-gray-900"><ArrowLeft className="h-4 w-4" />Previous step</button>
          : <span />}
        <button type="button" onClick={onCancel} className="text-sm text-gray-500 hover:text-gray-900">Not now</button>
      </div>
    </div>
  )
}

/** Every sale at the stall (time, what was bought, how it was paid, amount), plus anything sold but not tapped. */
function SalesTable({ kitId, sales, untapped }: { kitId: string; sales: StallSale[]; untapped: SaleItem[] }) {
  const { money } = useMoney()
  const router = useRouter()
  const toast = useToast()
  const [editing, setEditing] = useState<{ id: string; amount: string; method: StallSale['method'] } | null>(null)
  const [saving, setSaving] = useState(false)
  const label = (m: StallSale['method']) => METHODS.find(x => x.value === m)?.label ?? m
  const save = async () => {
    if (!editing) return
    const value = Number(editing.amount)
    if (editing.amount === '' || !Number.isFinite(value) || value < 0) { toast('Enter an amount of 0 or more.', 'error'); return }
    setSaving(true)
    const res = await updateKitSale(editing.id, kitId, value, editing.method)
    setSaving(false)
    if (res.error) { toast(res.error, 'error'); return }
    toast('Sale updated', 'success')
    setEditing(null)
    router.refresh()
  }
  const describe = (items: SaleItem[]) => items.length ? items.map(i => (i.qty > 1 ? `${i.name} × ${i.qty}` : i.name)).join(', ') : 'No items'
  const ordered = [...sales].sort((a, b) => a.at.localeCompare(b.at))
  const untappedValue = untapped.reduce((n, i) => n + i.qty * i.price, 0)
  const total = ordered.reduce((n, s) => n + s.amount, 0)
  if (!ordered.length && !untapped.length) return <p className="text-sm text-gray-500">Nothing was sold.</p>
  return (
    <div className="max-h-[40vh] overflow-y-auto rounded-xl border border-brand-100">
      <table className="w-full text-sm">
        <thead className="sticky top-0 bg-white">
          <tr className="text-left text-[11px] font-bold uppercase tracking-wide text-gray-500">
            <th className="px-3 py-2 font-bold">Time</th>
            <th className="px-2 py-2 font-bold">Bought</th>
            <th className="px-2 py-2 font-bold">Paid by</th>
            <th className="px-3 py-2 text-right font-bold">Amount</th>
          </tr>
        </thead>
        <tbody>
          {ordered.map(s => {
            const list = s.items.reduce((n, i) => n + i.qty * i.price, 0)
            return (
              <tr key={s.id} className="border-t border-brand-100 align-top">
                <td className="whitespace-nowrap px-3 py-1.5 text-gray-500">{new Date(s.at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</td>
                <td className="px-2 py-1.5 text-gray-900">
                  {describe(s.items)}
                  {Math.abs(list - s.amount) > 0.5 && <span className="block text-[11px] text-amber-600">{s.amount < list ? `${money(list - s.amount)} discount` : `${money(s.amount - list)} over list price`}</span>}
                </td>
                {editing?.id === s.id ? (
                  <td className="px-2 py-1.5" colSpan={2}>
                    <div className="flex flex-wrap items-center justify-end gap-1.5">
                      <select aria-label="Paid by" value={editing.method} onChange={e => setEditing({ ...editing, method: e.target.value as StallSale['method'] })}
                        className="rounded-md border border-gray-300 bg-white px-1.5 py-1 text-xs text-gray-900">
                        {METHODS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                      </select>
                      <input aria-label="Amount" type="number" inputMode="decimal" min={0} step="0.01" autoFocus value={editing.amount}
                        onChange={e => setEditing({ ...editing, amount: e.target.value })}
                        onKeyDown={e => { if (e.key === 'Enter') void save(); if (e.key === 'Escape') setEditing(null) }}
                        className="w-20 rounded-md border border-gray-300 bg-white px-1.5 py-1 text-right text-sm text-gray-900 focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-400" />
                      <button type="button" disabled={saving} onClick={() => void save()} className="rounded-md bg-brand-400 px-2 py-1 text-xs font-bold text-white disabled:opacity-60">Save</button>
                      <button type="button" onClick={() => setEditing(null)} className="rounded-md px-1.5 py-1 text-xs text-gray-500 hover:text-gray-900">Cancel</button>
                    </div>
                  </td>
                ) : (
                  <>
                    <td className="px-2 py-1.5 text-gray-600">{label(s.method)}</td>
                    <td className="px-3 py-1.5 text-right">
                      <button type="button" onClick={() => setEditing({ id: s.id, amount: String(Math.round(s.amount * 100) / 100), method: s.method })}
                        aria-label={`Change this sale (${money(s.amount)})`} title="Change amount or how it was paid"
                        className="inline-flex items-center gap-1 font-semibold tabular-nums text-gray-900 underline decoration-dotted underline-offset-4 hover:text-brand-400">
                        {money(s.amount)}<Pencil className="h-3 w-3 text-gray-400" />
                      </button>
                    </td>
                  </>
                )}
              </tr>
            )
          })}
          {untapped.length > 0 && (
            <tr className="border-t border-brand-100 align-top">
              <td className="px-3 py-1.5 text-gray-500">Not tapped</td>
              <td className="px-2 py-1.5 text-gray-900">{describe(untapped)}<span className="block text-[11px] text-gray-500">Sold but not recorded at the stall</span></td>
              <td className="px-2 py-1.5 text-gray-600">Cash?</td>
              <td className="px-3 py-1.5 text-right font-semibold tabular-nums text-gray-900">{money(untappedValue)}</td>
            </tr>
          )}
        </tbody>
        <tfoot>
          <tr className="border-t border-brand-200 font-semibold text-gray-900">
            <td className="px-3 py-1.5" colSpan={3}>{ordered.length} sale{ordered.length === 1 ? '' : 's'}{untapped.length ? ' + not tapped' : ''}</td>
            <td className="px-3 py-1.5 text-right tabular-nums">{money(total + untappedValue)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  )
}

/** Each item with how many sold and how many are remaining, plus totals. */
function ItemTable({ rows }: { rows: { key: string; name: string; sold: number; remaining: number; note?: string }[] }) {
  const shown = rows.filter(r => r.sold || r.remaining || r.note)
  return (
    <div className="max-h-[40vh] overflow-y-auto rounded-xl border border-brand-100">
      <table className="w-full text-sm">
        <thead className="sticky top-0 bg-white">
          <tr className="text-left text-[11px] font-bold uppercase tracking-wide text-gray-500">
            <th className="px-3 py-2 font-bold">Item</th>
            <th className="px-2 py-2 text-right font-bold">Sold</th>
            <th className="px-3 py-2 text-right font-bold">Remaining</th>
          </tr>
        </thead>
        <tbody>
          {shown.map(r => (
            <tr key={r.key} className="border-t border-brand-100">
              <td className="px-3 py-1.5 text-gray-900">{r.name}{r.note && <span className="block text-[11px] text-amber-600">{r.note}</span>}</td>
              <td className="px-2 py-1.5 text-right font-semibold tabular-nums text-gray-900">{r.sold}</td>
              <td className="px-3 py-1.5 text-right tabular-nums text-gray-900">{r.remaining}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t border-brand-200 font-semibold text-gray-900">
            <td className="px-3 py-1.5">Total</td>
            <td className="px-2 py-1.5 text-right tabular-nums">{shown.reduce((n, r) => n + r.sold, 0)}</td>
            <td className="px-3 py-1.5 text-right tabular-nums">{shown.reduce((n, r) => n + r.remaining, 0)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  )
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <li className="flex justify-between px-3 py-2">
      <span className="text-gray-600">{label}</span>
      <span className={cn('tabular-nums text-gray-900', strong ? 'font-bold' : 'font-semibold')}>{value}</span>
    </li>
  )
}
