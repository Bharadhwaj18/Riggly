'use client'

import { Input } from '@/components/ui/Input'
import { Label } from '@/components/ui/Label'
import { useMoney } from '@/components/finance/FinanceSettingsContext'
import { cn } from '@/lib/utils'

/**
 * The amount an approval puts into Finance. Starts at what was recorded (or handed in) and can be changed for
 * payments that were missed or not accounted for; the difference is shown so it's a deliberate change.
 */
export function AmountField({ id, label, amount, setAmount, recorded, recordedLabel }: {
  id: string
  label: string
  amount: string
  setAmount: (v: string) => void
  recorded: number
  /** How the starting amount came about: "handed in", "recorded". */
  recordedLabel: string
}) {
  const { money, symbol } = useMoney()
  const value = Number(amount)
  const valid = amount.trim() !== '' && Number.isFinite(value) && value >= 0
  const diff = valid ? Math.round((value - recorded) * 100) / 100 : 0
  return (
    <div className="space-y-1.5 rounded-xl bg-brand-50 px-4 py-3">
      <Label htmlFor={id}>{label} ({symbol})</Label>
      <Input id={id} type="number" inputMode="decimal" min={0} step="0.01" value={amount} onChange={e => setAmount(e.target.value)}
        className="text-lg font-bold tabular-nums" />
      <p className={cn('text-xs', !valid ? 'text-red-700' : diff !== 0 ? 'font-semibold text-amber-600' : 'text-gray-500')}>
        {!valid
          ? 'Enter an amount of 0 or more.'
          : diff === 0
            ? `${money(recorded)} ${recordedLabel}. Change it if some payments were missed or not accounted for.`
            : `${diff > 0 ? 'Up' : 'Down'} ${money(Math.abs(diff))} from the ${money(recorded)} ${recordedLabel}. Finance will note it was adjusted.`}
        {valid && diff !== 0 && (
          <button type="button" onClick={() => setAmount(String(Math.round(recorded * 100) / 100))} className="ml-1 font-semibold text-brand-400 underline">Reset</button>
        )}
      </p>
    </div>
  )
}
