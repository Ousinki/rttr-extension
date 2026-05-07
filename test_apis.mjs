async function testGoogle() {
  const url = "https://translate.googleapis.com/translate_a/single";
  const searchParams = new URLSearchParams();
  searchParams.append('client', 'gtx');
  searchParams.append('q', 'hello');
  searchParams.append('sl', 'auto');
  searchParams.append('tl', 'zh-CN');
  searchParams.append('dj', '1');
  searchParams.append('hl', 'zh-CN');
  searchParams.append('dt', 'rm');
  searchParams.append('dt', 'bd');
  searchParams.append('dt', 't');

  const res = await fetch(`${url}?${searchParams.toString()}`);
  const data = await res.json();
  console.log('Google:', JSON.stringify(data, null, 2));
}

async function testDeepL() {
  const url = "https://www2.deepl.com/jsonrpc";
  const postData = {
    jsonrpc: "2.0",
    method: "LMT_handle_texts",
    id: 12345678,
    params: {
      splitting: "newlines",
      lang: {
        source_lang_user_selected: "auto",
        target_lang: "ZH", // Test with ZH
      },
      texts: [{ text: "hello", requestAlternatives: 3 }],
      timestamp: Date.now()
    },
  };
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(postData).replace('"method":"', '"method" : "')
  });
  const text = await res.text();
  console.log('DeepL text:', text);
}

testGoogle();
testDeepL();
