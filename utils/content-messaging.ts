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

let hasShownErrorToast = false;

export function showErrorToast(reason: string) {
  if (typeof document === 'undefined') return;
  if (hasShownErrorToast) return;
  hasShownErrorToast = true;

  let toast = document.getElementById('rttr-error-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'rttr-error-toast';
    Object.assign(toast.style, {
      all: 'initial',
      position: 'fixed',
      top: '24px',
      right: '24px',
      transform: 'translateY(-10px)',
      backgroundColor: '#f0f0f0', // Matching tooltip background
      color: '#333333', // Matching tooltip text color
      border: '1px solid #dcdcdc', // Matching tooltip border
      borderLeft: '4px solid #ef4444', // Premium left red accent border
      padding: '12px 20px',
      borderRadius: '0px', // Straight corner design
      fontSize: '13px',
      fontWeight: '500',
      zIndex: '2147483647',
      pointerEvents: 'none',
      transition: 'all 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
      opacity: '0',
      fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)',
      maxWidth: '350px',
      wordBreak: 'break-word',
      whiteSpace: 'pre-wrap'
    });
    document.documentElement.appendChild(toast);
  }
  toast.textContent = `传统机器翻译不可用（原因：${reason}），已自动切换为 AI 翻译`;
  
  // Force reflow
  void toast.offsetWidth;
  
  toast.style.opacity = '1';
  toast.style.transform = 'translateY(0)';
  
  if ((toast as any)._timeoutId) {
    clearTimeout((toast as any)._timeoutId);
  }
  
  (toast as any)._timeoutId = setTimeout(() => {
    if (toast) {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(-10px)';
    }
  }, 5000);
}

