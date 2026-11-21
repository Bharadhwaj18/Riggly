/**
 * Whether a field may grab focus by itself when it appears. Only with a mouse: on phones (Safari especially) an
 * automatic focus pops the keyboard up mid-animation and the browser scrolls the page to make room, which hides the
 * very field it focused. On a phone people tap the field when they want to type.
 */
export const canAutoFocus = () => typeof window !== 'undefined' && window.matchMedia('(pointer: fine)').matches
