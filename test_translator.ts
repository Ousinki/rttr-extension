import { handleFetchTranslation } from './utils/translator';

async function test() {
  try {
    const resGoogle = await handleFetchTranslation('hello', 'auto', 'zh-CN', 'google');
    console.log('Google:', resGoogle);
  } catch(e) {
    console.error('Google error:', e);
  }

  try {
    const resDeepL = await handleFetchTranslation('hello', 'auto', 'zh-CN', 'deepl');
    console.log('DeepL:', resDeepL);
  } catch(e) {
    console.error('DeepL error:', e);
  }
}

test();
