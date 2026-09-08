import type { Dialog, Page } from 'playwright';

type PendingDialogArm = {
  handler: (dialog: Dialog) => void;
};

// A dialog arm belongs to the page and is consumed by one dialog or discarded
// after the next tool action. Keeping this state here gives all callers one
// cleanup path instead of leaving page listeners to live for the rest of a run.
const pendingDialogArms = new WeakMap<Page, PendingDialogArm>();

export function handleDialog(page: Page, behavior: 'accept' | 'dismiss'): void {
  clearUnusedDialogHandler(page);
  const handler = (dialog: Dialog) => {
    pendingDialogArms.delete(page);
    if (behavior === 'accept') {
      void dialog.accept();
    } else {
      void dialog.dismiss();
    }
  };
  pendingDialogArms.set(page, { handler });
  try {
    page.once('dialog', handler);
  } catch (error) {
    pendingDialogArms.delete(page);
    throw error;
  }
}

/** Removes a dialog arm that was not consumed by the immediately following action. */
export function clearUnusedDialogHandler(page: Page): boolean {
  const pending = pendingDialogArms.get(page);
  if (!pending) return false;
  pendingDialogArms.delete(page);
  try {
    page.off('dialog', pending.handler);
  } catch {
    // A closed page may reject listener cleanup; the weak map entry is already gone.
  }
  return true;
}
