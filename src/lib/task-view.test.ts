import { describe, it, expect } from 'vitest'
import { DEFAULT_VIEW, activeFilterCount, filterTasks, groupTasks, sectionsByWhen, sortTasks } from './task-view'
import type { Task, TaskBoard } from '@/types/tasks'

const task = (o: Partial<Task>): Task => ({
  workspace_id: 'w', id: Math.random().toString(36).slice(2), board_id: 'b1', bucket_id: 'k1', title: 'Task', description: null,
  progress: 'not_started', priority: 'medium', start_date: null, due_date: null, completed_at: null, position: 1,
  remind_days_before: null, recurrence: null, assignee_ids: [], label_ids: [], checklist: [], source_note_id: null,
  created_by: 'u', updated_by: null, created_at: '2026-10-01T00:00:00Z', updated_at: '2026-10-01T00:00:00Z', custom: {}, ...o,
})
const ctx = { today: '2026-10-16', userId: 'me-id', boardIds: new Set(['b1', 'b2']) }

describe('filterTasks', () => {
  const list = [
    task({ title: 'Overdue', due_date: '2026-10-10', assignee_ids: ['me-id'] }),
    task({ title: 'This week', due_date: '2026-10-20', board_id: 'b2' }),
    task({ title: 'No date', assignee_ids: ['raga'] }),
    task({ title: 'Done', progress: 'completed', due_date: '2026-10-01' }),
    task({ title: 'Archived group', board_id: 'gone' }),
  ]

  it('drops tasks from groups that no longer exist', () => {
    expect(filterTasks(list, DEFAULT_VIEW, ctx).map(t => t.title)).not.toContain('Archived group')
  })
  it('filters by who, including "me"', () => {
    expect(filterTasks(list, { ...DEFAULT_VIEW, who: ['me'] }, ctx).map(t => t.title)).toEqual(['Overdue'])
    expect(filterTasks(list, { ...DEFAULT_VIEW, who: ['raga'] }, ctx).map(t => t.title)).toEqual(['No date'])
  })
  it('handles overdue, this week, no date and hide done', () => {
    expect(filterTasks(list, { ...DEFAULT_VIEW, show: ['overdue'] }, ctx).map(t => t.title)).toEqual(['Overdue'])
    expect(filterTasks(list, { ...DEFAULT_VIEW, show: ['week'] }, ctx).map(t => t.title)).toEqual(['This week'])
    expect(filterTasks(list, { ...DEFAULT_VIEW, show: ['nodate'] }, ctx).map(t => t.title)).toEqual(['No date'])
    expect(filterTasks(list, { ...DEFAULT_VIEW, show: ['hidedone'] }, ctx).map(t => t.title)).not.toContain('Done')
  })
  it('filters by group and search, and counts active filters', () => {
    expect(filterTasks(list, { ...DEFAULT_VIEW, groups: ['b2'] }, ctx).map(t => t.title)).toEqual(['This week'])
    expect(filterTasks(list, { ...DEFAULT_VIEW, query: 'week' }, ctx).map(t => t.title)).toEqual(['This week'])
    expect(activeFilterCount({ ...DEFAULT_VIEW, who: ['me'], show: ['hidedone', 'overdue'] })).toBe(3)
  })
})

describe('sortTasks and groupTasks', () => {
  it('sorts by due date with no date last', () => {
    const s = sortTasks([task({ title: 'none' }), task({ title: 'late', due_date: '2026-11-01' }), task({ title: 'soon', due_date: '2026-10-17' })], 'due')
    expect(s.map(t => t.title)).toEqual(['soon', 'late', 'none'])
  })
  it('sorts by priority, urgent first', () => {
    const s = sortTasks([task({ title: 'low', priority: 'low' }), task({ title: 'urgent', priority: 'urgent' })], 'priority')
    expect(s.map(t => t.title)).toEqual(['urgent', 'low'])
  })
  it('groups by status with Done folded away', () => {
    const sections = groupTasks([task({ progress: 'completed' }), task({ progress: 'in_progress' })], DEFAULT_VIEW, { boards: [], nameById: {} })
    expect(sections.map(s => [s.label, s.tasks.length, !!s.collapsedByDefault])).toEqual([['Doing', 1, false], ['To do', 0, false], ['Done', 1, true]])
  })
  it('groups by person with nobody last', () => {
    const sections = groupTasks([task({ assignee_ids: [] }), task({ assignee_ids: ['r'] })], { ...DEFAULT_VIEW, groupBy: 'person' }, { boards: [] as TaskBoard[], nameById: { r: 'Raga' } })
    expect(sections.map(s => s.label)).toEqual(['Raga', 'Nobody yet'])
  })
})

describe('sectionsByWhen', () => {
  const t = (id: string, due: string | null, progress = 'not_started', completed_at: string | null = null) =>
    ({ id, title: id, due_date: due, progress, completed_at, position: 0 }) as unknown as Parameters<typeof sectionsByWhen>[0][number]
  const today = '2026-06-10'
  it('sorts open tasks by when they are due, and folds recent done ones away', () => {
    const s = sectionsByWhen([
      t('late', '2026-06-01'), t('now', today), t('soon', '2026-06-15'), t('far', '2026-07-30'), t('whenever', null),
      t('finished', '2026-06-09', 'completed', '2026-06-09T10:00:00Z'), t('old', '2026-01-01', 'completed', '2026-01-02T10:00:00Z'),
    ], today, '2026-06-17', '2026-05-27')
    expect(s.map(x => [x.key, x.tasks.map(y => y.id)])).toEqual([
      ['overdue', ['late']], ['today', ['now']], ['week', ['soon']], ['later', ['far']], ['nodate', ['whenever']], ['done', ['finished']],
    ])
    expect(s.find(x => x.key === 'done')?.collapsedByDefault).toBe(true)
  })
  it('leaves out empty sections', () => {
    expect(sectionsByWhen([t('now', today)], today, '2026-06-17', '2026-05-27').map(x => x.key)).toEqual(['today'])
  })
})
