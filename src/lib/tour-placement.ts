/** Where the tour card goes so all of it stays on screen, even on a short phone. */
export interface Box { top: number; left: number; width: number; height: number }

const GAP = 12
const EDGE = 12

/**
 * Below the highlighted thing if the whole card fits there, else above it. If neither fits (a tall target, or a short
 * screen), it sits over the target on whichever side has more room, pushed back inside the screen. Never off the top
 * or bottom; the card scrolls inside itself if it's taller than the screen.
 */
export function placeTourCard(hole: Box, card: { height: number }, view: { width: number; height: number }) {
  const width = Math.min(340, view.width - EDGE * 2)
  const left = Math.min(Math.max(EDGE, hole.left + hole.width / 2 - width / 2), view.width - width - EDGE)
  const maxHeight = view.height - EDGE * 2
  const h = Math.min(card.height, maxHeight)

  const below = hole.top + hole.height + GAP
  const above = hole.top - GAP - h
  let top: number
  if (below + h <= view.height - EDGE) top = below
  else if (above >= EDGE) top = above
  else {
    const roomBelow = view.height - (hole.top + hole.height)
    const roomAbove = hole.top
    top = roomBelow >= roomAbove ? view.height - EDGE - h : EDGE
  }
  top = Math.min(Math.max(EDGE, top), view.height - EDGE - h)
  return { top, left, width, maxHeight }
}
