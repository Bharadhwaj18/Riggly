import { redirect } from 'next/navigation'

interface Props {
  params: Promise<{ boardId: string }>
  searchParams: Promise<{ task?: string }>
}

// Lists don't have their own page. A link to one task opens it; a link to a list opens Tasks filtered to it.
export default async function BoardPage({ params, searchParams }: Props) {
  const [{ boardId }, { task }] = await Promise.all([params, searchParams])
  redirect(task ? `/tasks?task=${encodeURIComponent(task)}` : `/tasks?list=${encodeURIComponent(boardId)}`)
}
