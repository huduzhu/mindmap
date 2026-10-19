/**
 * Whether a dialog is open (#166). Document-level shortcuts (Delete, arrows,
 * Enter, folding, F5, copy and paste…) must not act on the map, outline or
 * brainstorm behind it: with focus on the page itself, rather than inside the
 * dialog, they used to reach the project underneath.
 */
export function dialogOpen(): boolean {
  for (const dialog of document.querySelectorAll('[role="dialog"], [role="alertdialog"]')) {
    if (!dialog.closest('[hidden]')) return true
  }
  return false
}
