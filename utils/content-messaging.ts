export async function safeSendMessage(message: any): Promise<any> {
  try {
    if (!browser?.runtime?.id) {
      console.warn('[RTTR] 扩展上下文已失效，请刷新页面');
      return null;
    }
    return await browser.runtime.sendMessage(message);
  } catch (e: any) {
    if (e?.message?.includes('Extension context invalidated') ||
        e?.message?.includes('Cannot read properties of undefined')) {
      console.warn('[RTTR] 扩展上下文已失效，请刷新页面');
      return null;
    }
    throw e;
  }
}
