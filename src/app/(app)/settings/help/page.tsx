import { SettingsHeader } from '@/components/settings/SettingsHeader'
import { TourList } from '@/components/tour/TourList'

export default function HelpPage() {
  return (
    <>
      <SettingsHeader eyebrow="You" title="Help & tours" />
      <section className="max-w-xl rounded-2xl border border-brand-200 bg-white p-5 shadow-sm">
        <p className="mb-4 text-sm text-gray-500">Short walkthroughs that point at the real buttons. Best tried in the demo band, where nothing you change matters.</p>
        <TourList />
      </section>
    </>
  )
}
