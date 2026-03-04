type SelectionRect = {
  left: number;
  top: number;
  width: number;
  height: number;
};

type SelectionInfo = {
  hasSelection: boolean;
  rect?: SelectionRect;
  dpr?: number;
  pageLeft?: number;
  pageRight?: number;
  pageTop?: number;
  pageBottom?: number;
  viewportWidth?: number;
  viewportHeight?: number;
  scrollX?: number;
  scrollY?: number;
  docHeight?: number;
  isLong?: boolean;
};

const CONTENT_SCRIPT_FILE = 'content.js';

type ActiveTabInfo = {
  tabId: number;
  windowId: number;
};

async function getActiveTabInfo(): Promise<ActiveTabInfo | null> {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const tab = tabs[0];
  if (tab?.id == null || tab.windowId == null) return null;
  return { tabId: tab.id, windowId: tab.windowId };
}

async function ensureContentScript(tabId: number): Promise<void> {
  const ping = await sendMessage<{ ok: true }>(tabId, { type: 'ping' });
  if (ping?.ok) return;

  await chrome.scripting.executeScript({
    target: { tabId },
    files: [CONTENT_SCRIPT_FILE]
  });
}

function sendMessage<T>(tabId: number, message: unknown): Promise<T | null> {
  return new Promise((resolve) => {
    chrome.tabs.sendMessage(tabId, message, (response) => {
      if (chrome.runtime.lastError) {
        resolve(null);
        return;
      }
      resolve((response ?? null) as T | null);
    });
  });
}

async function handleCopyMarkdown(tabId: number) {
  await sendMessage(tabId, { type: 'copy_markdown' });
}

async function handleCaptureImage(tabId: number, windowId: number) {
  const selection = await sendMessage<SelectionInfo>(tabId, { type: 'get_selection' });
  if (!selection || !selection.hasSelection || !selection.rect || !selection.dpr) {
    await sendMessage(tabId, { type: 'toast', text: 'No selection' });
    return;
  }

  if (selection.isLong) {
    await sendMessage(tabId, { type: 'render_selection' });
    return;
  }

  await sendMessage(tabId, { type: 'clear_selection' });
  await new Promise((resolve) => setTimeout(resolve, 60));

  chrome.tabs.captureVisibleTab(windowId, { format: 'png' }, async (dataUrl) => {
    if (chrome.runtime.lastError || !dataUrl) {
      await sendMessage(tabId, {
        type: 'toast',
        text: 'Capture failed (iframe/cross-origin/permission)'
      });
      return;
    }

    await sendMessage(tabId, {
      type: 'show_capture',
      dataUrl,
      rect: selection.rect,
      dpr: selection.dpr
    });
  });
}



chrome.commands.onCommand.addListener(async (command) => {
  const activeTab = await getActiveTabInfo();
  if (!activeTab) return;
  const { tabId, windowId } = activeTab;

  try {
    await ensureContentScript(tabId);
  } catch {
    return;
  }

  if (command === 'copy_markdown') {
    await handleCopyMarkdown(tabId);
  }

  if (command === 'capture_image') {
    await handleCaptureImage(tabId, windowId);
  }
});
