import { sectionGuard } from '@/lib/section-guard'
import { getCachedTaskData, getCachedAllProfiles, getCachedUser, getCachedProfileAvatars, getCachedPersonalTasks } from '@/lib/data'
import { addDays, format } from 'date-fns'
import { PageHeader } from '@/components/ui/PageHeader'
import { ScopeToggle } from '@/components/layout/ScopeToggle'
import { PersonalTasks } from '@/components/tasks/PersonalTasks'
import { getWorkspaceContext } from '@/lib/workspace'
import { todayISO } from '@/lib/shows'
import { buildPeople } from '@/lib/tasks'
import { TasksView } from '@/components/tasks/list/TasksView'
import { ensureGeneralList } from '@/actions/tasks'

interface Props {
  searchParams: Promise<{ view?: string; group?: string; list?: string; who?: string; task?: string; mine?: string; scope?: string }>
}

/** Tasks: one list, yours or everyone's, all lists or one, by when it's due. */
export default async function TasksPage({ searchParams }: Props) {
  const denied = await sectionGuard('tasks')
  if (denied) return denied
  const { view, group, list, who, task, mine, scope } = await searchParams
  // Your Personal space opens on your tasks from every workspace, unless you pick "This one".
  const wsCtx = await getWorkspaceContext()
  const canScope = wsCtx?.current.workspace.type === 'personal' && wsCtx.memberships.length > 1
  // Any link into a list, a person's view or a task counts as "This one", so it doesn't jump back to All.
  const thisOne = scope === 'this' || !!view || !!group || !!list || !!who || !!mine || !!task
  if (wsCtx && canScope && !thisOne) {
    const today = todayISO()
    return (
      <div className="max-w-3xl">
        <PageHeader title="Tasks" subtitle="Assigned to you, across all your workspaces" action={<ScopeToggle all thisHref="/tasks?scope=this" allHref="/tasks" />} />
        <PersonalTasks tasks={await getCachedPersonalTasks()} currentId={wsCtx.current.workspace.id} today={today} weekAhead={format(addDays(new Date(today + 'T00:00:00'), 7), 'yyyy-MM-dd')} />
      </div>
    )
  }
  // Every workspace has a General list for tasks that don't fit anywhere else; make it if it's missing.
  if (wsCtx?.current.sections.tasks === 'edit') await ensureGeneralList()
  const [data, profiles, avatars, { data: { user } }, ctx] = await Promise.all([
    getCachedTaskData(), getCachedAllProfiles(), getCachedProfileAvatars(), getCachedUser(), getWorkspaceContext(),
  ])
  const { members, nameById } = buildPeople(profiles, user?.id)

  return (
    <TasksView
      boards={data.boards}
      buckets={data.buckets}
      tasks={data.tasks}
      fields={data.fields}
      members={members}
      nameById={nameById}
      avatars={avatars}
      today={todayISO()}
      currentUserId={user?.id}
      // View only, or only shared lists none of which they can edit. (Shared lists they can edit stay editable; the
      // database keeps the rest read-only.)
      readOnly={!ctx || ctx.current.sections.tasks === 'view' || (ctx.current.sections.tasks === 'items' && !(ctx.current.grants ?? []).some(g => g.section === 'tasks' && g.level === 'edit'))}
      // Tasks opens on your own; Everyone is a tap away. Old Board and Everyone links still land somewhere sensible.
      everyone={who === 'all' || (view === 'list' && mine !== '1') || view === 'kanban'}
      listId={list ?? group}
      openTaskId={task}
      scopeToggle={canScope ? <ScopeToggle all={false} thisHref="/tasks?scope=this" allHref="/tasks" /> : undefined}
    />
  )
}
