export function focusMovedOutside(container, nextTarget) {
  // Safari can report no next target when a mouse click blurs a summary.
  // Closing at that point removes the menu button before its click runs.
  return Boolean(container && nextTarget && !container.contains(nextTarget))
}
