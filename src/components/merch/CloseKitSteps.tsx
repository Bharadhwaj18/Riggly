'use client'

import { useState } from 'react'
import { ArrowLeft, Check, Minus, Plus } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Label } from '@/components/ui/Label'
import { SectionLabel } from '@/components/ui/SectionLabel'
import { useMoney } from '@/components/finance/FinanceSettingsContext'
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

/**
 * End of night in three steps, each already answered from what the stall recorded:
 *   1. Stock: is everything that wasn't sold still remaining? Only if not, change the items that differ.
 *   2. Money: does it match what those sales should bring in? Only if not, enter what you have.
 *   3. Check the summary and close.
 */
export function CloseKitSteps({ lines, tappedBy, onClose, onCancel }: {
  lines: KitLineView[]
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
  const remainingNow = counts.reduce((n, c) => n + c.returned, 0)
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
          <div>
            <p className="text-lg font-bold text-gray-900">Is everything else still remaining?</p>
            <p className="text-sm text-gray-500">{went} went · {soldAtStall} sold at the stall</p>
            <p className="mt-2 text-3xl font-bold tabular-nums text-gray-900">{shouldRemain} remaining</p>
          </div>
          {!differs ? (
            <div className="grid gap-2">
              <Button onClick={() => { setRemaining(Object.fromEntries(lines.map(l => [l.variantId, kitLeft(l.taken, l.sold)]))); setReasons({}); setStep(2) }}>
                <Check className="h-4 w-4" />Yes, all {shouldRemain} are remaining
              </Button>
              <Button variant="secondary" onClick={() => setDiffers(true)}>No, something’s different</Button>
            </div>
          ) : (
            <>
              <p className="text-xs text-gray-500">Set how many of each are remaining. For anything missing, say what happened to it.</p>
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
              <p className="text-xs text-gray-500">UPI is usually exact, so most nights only cash needs counting.</p>
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
          <ul className="divide-y divide-brand-100 rounded-xl border border-brand-100 text-sm">
            <Row label="Sold" value={String(soldTotal)} />
            <Row label="Remaining" value={String(remainingNow)} />
            {given + lost > 0 && <Row label="Given away / lost" value={`${given} / ${lost}`} />}
            <Row label="Handing in" value={money(handing)} strong />
          </ul>
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

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <li className="flex justify-between px-3 py-2">
      <span className="text-gray-600">{label}</span>
      <span className={cn('tabular-nums text-gray-900', strong ? 'font-bold' : 'font-semibold')}>{value}</span>
    </li>
  )
}
