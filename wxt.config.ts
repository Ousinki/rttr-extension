import { defineConfig } from 'wxt';

// See https://wxt.dev/api/config.html
export default defineConfig({
  modules: ['@wxt-dev/module-vue'],
  manifest: {
    name: 'RTTR — RubyText Translator',
    description: 'AI 语境单词上标翻译，智能标注实义词并以 Ruby 注音呈现',
    version: '0.1.0',
    permissions: ['storage', 'activeTab'],
    options_ui: {
      page: 'options.html',
      open_in_tab: true,
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
