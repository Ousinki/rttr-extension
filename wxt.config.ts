import { defineConfig } from 'wxt';

// See https://wxt.dev/api/config.html
export default defineConfig({
  modules: ['@wxt-dev/module-vue'],
  manifest: {
    name: 'RTTR — RubyText Translator',
    description: 'AI 语境单词上标翻译，智能标注实义词并以 Ruby 注音呈现',
    version: '0.1.0',
    permissions: ['storage', 'activeTab'],
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
        description: '翻译鼠标悬浮段落',
      },
    },
  },
});
