import { defineConfig } from 'wxt';

// See https://wxt.dev/api/config.html
export default defineConfig({
  modules: ['@wxt-dev/module-vue'],
  manifest: {
    name: '__MSG_extName__',
    description: '__MSG_extDescription__',
    default_locale: 'zh_CN',
    version: '0.1.0',
    permissions: ['storage', 'activeTab'],
    host_permissions: [
      '*://*.googleapis.com/*',
      '*://api.deepl.com/*',
      '*://api.openai.com/*',
      '*://api.deepseek.com/*',
      '*://open.bigmodel.cn/*',
      '*://generativelanguage.googleapis.com/*',
      '*://api.anthropic.com/*',
      '*://api.x.ai/*',
      '*://dashscope.aliyuncs.com/*',
      '*://api.moonshot.cn/*',
      '*://api.siliconflow.cn/*',
      '*://api.lingyiwanwu.com/*'
    ],
    action: {
      default_icon: {
        '16': 'icon/16.png',
        '32': 'icon/32.png',
        '48': 'icon/48.png',
        '96': 'icon/96.png',
        '128': 'icon/128.png',
      },
      default_title: 'RTTR — 点击开启/关闭',
    },
    icons: {
      '16': 'icon/16.png',
      '32': 'icon/32.png',
      '48': 'icon/48.png',
      '96': 'icon/96.png',
      '128': 'icon/128.png',
    },
    commands: {
      'translate-paragraph': {
        suggested_key: {
          default: 'Alt+T',
          mac: 'Alt+T',
        },
        description: '__MSG_commandTranslateParagraph__',
      },
    },
  },
});
