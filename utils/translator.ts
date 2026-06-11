import type { TranslationEngine, FetchTranslationResponse } from './messaging';

// --- Google Translator ---
async function translateGoogle(text: string, sourceLang: string, targetLang: string): Promise<FetchTranslationResponse> {
  const url = "https://translate.googleapis.com/translate_a/single";
  const searchParams = new URLSearchParams();
  searchParams.append("client", "gtx");
  searchParams.append("q", text);
  searchParams.append("sl", sourceLang);
  searchParams.append("tl", targetLang);
  searchParams.append("dj", "1");
  searchParams.append("hl", targetLang);
  searchParams.append("dt", "rm");
  searchParams.append("dt", "bd");
  searchParams.append("dt", "t");

  const res = await fetch(`${url}?${searchParams.toString()}`);
  if (!res.ok) throw new Error(`Google API error: ${res.status}`);
  const data = await res.json();
  
  let targetText = data.sentences
    ?.map((s: any) => s.trans)
    .filter(Boolean)
    .join(" ");
  
  if (targetText) {
    targetText = targetText.replace(/\n /g, "\n");
  }

  return {
    engine: 'google',
    targetText,
    detectedLang: data.src
  };
}

// --- DeepL Translator ---
function getICount(text: string) {
  return text.split("i").length - 1;
}

function getRandomNumber() {
  const rand = Math.floor(Math.random() * 99999) + 100000;
  return rand * 1000;
}

function getTimeStamp(iCount: number) {
  const ts = Date.now();
  if (iCount !== 0) {
    iCount = iCount + 1;
    return ts - (ts % iCount) + iCount;
  } else {
    return ts;
  }
}

async function translateDeepL(text: string, sourceLang: string, targetLang: string): Promise<FetchTranslationResponse> {
  const url = "https://www2.deepl.com/jsonrpc";
  
  // DeepL expects specific uppercase lang codes, ZH for Chinese
  const dlSource = sourceLang === 'auto' ? 'auto' : sourceLang.toUpperCase();
  let dlTarget = targetLang.toUpperCase();
  if (dlTarget.startsWith('ZH')) dlTarget = 'ZH';

  const postData = {
    jsonrpc: "2.0",
    method: "LMT_handle_texts",
    id: getRandomNumber(),
    params: {
      splitting: "newlines",
      lang: {
        source_lang_user_selected: dlSource,
        target_lang: dlTarget,
      },
      texts: [
        {
          text,
          requestAlternatives: 3,
        },
      ],
      timestamp: getTimeStamp(getICount(text))
    },
  };

  let postStr = JSON.stringify(postData);
  const id = postData.id;
  if ((id + 5) % 29 === 0 || (id + 3) % 13 === 0) {
    postStr = postStr.replace('"method":"', '"method" : "');
  } else {
    postStr = postStr.replace('"method":"', '"method": "');
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: postStr
  });

  if (!res.ok) throw new Error(`DeepL API error: ${res.status}`);
  const data = await res.json();
  
  if (data.result && data.result.texts && data.result.texts.length > 0) {
    return {
      engine: 'deepl',
      targetText: data.result.texts[0].text,
      detectedLang: data.result.lang
    };
  }
  throw new Error('DeepL returned invalid format');
}

// --- Bing Translator ---
let bingAccessToken: any = null;

async function getBingAccessToken() {
  const tokenUrl = "https://www.bing.com/translator";
  
  if (!bingAccessToken || Date.now() - bingAccessToken.tokenTs > bingAccessToken.tokenExpiryInterval) {
    const res = await fetch(tokenUrl);
    const html = await res.text();
    
    const igMatch = html.match(/IG:"([^"]+)"/);
    const iidMatch = html.match(/data-iid="([^"]+)"/);
    const paramsMatch = html.match(/params_AbusePreventionHelper\s?=\s?([^\]]+\])/);
    
    if (!igMatch || !iidMatch || !paramsMatch) {
      throw new Error("Failed to extract Bing tokens");
    }

    const IG = igMatch[1];
    const IID = iidMatch[1];
    const [key, token, interval] = JSON.parse(paramsMatch[1]);
    
    bingAccessToken = {
      IG,
      IID,
      key,
      token,
      tokenTs: Date.now(),
      tokenExpiryInterval: interval,
      count: 0
    };
  }
  return bingAccessToken;
}

async function translateBing(text: string, sourceLang: string, targetLang: string): Promise<FetchTranslationResponse> {
  const url = "https://www.bing.com/ttranslatev3";
  const auth = await getBingAccessToken();
  
  const searchParams = new URLSearchParams({
    IG: auth.IG,
    IID: auth.IID ? `${auth.IID}.${auth.count++}` : "",
    isVertical: "1"
  });

  const body = new URLSearchParams({
    text,
    fromLang: sourceLang === 'auto' ? 'auto-detect' : sourceLang,
    to: targetLang,
    token: auth.token,
    key: auth.key
  });

  const res = await fetch(`${url}?${searchParams.toString()}`, {
    method: 'POST',
    body
  });

  if (!res.ok) throw new Error(`Bing API error: ${res.status}`);
  const data = await res.json();
  
  if (data && data[0] && data[0].translations) {
    return {
      engine: 'bing',
      targetText: data[0].translations[0].text,
      detectedLang: data[0].detectedLanguage?.language
    };
  }
  throw new Error('Bing returned invalid format');
}

// --- Main Handler ---
export async function handleFetchTranslation(text: string, sourceLang: string, targetLang: string, engine: TranslationEngine): Promise<FetchTranslationResponse> {
  const engines: TranslationEngine[] = [engine];
  if (engine !== 'google') engines.push('google');
  if (engine !== 'bing') engines.push('bing');
  if (engine !== 'deepl') engines.push('deepl');

  let lastError: any = null;
  for (const eng of engines) {
    try {
      switch (eng) {
        case 'google':
          return await translateGoogle(text, sourceLang, targetLang);
        case 'deepl':
          return await translateDeepL(text, sourceLang, targetLang);
        case 'bing':
          return await translateBing(text, sourceLang, targetLang);
        default:
          throw new Error(`Unknown engine: ${eng}`);
      }
    } catch (err) {
      console.warn(`[RTTR] ${eng} translation failed, trying fallback:`, err);
      lastError = err;
    }
  }
  console.error(`[RTTR] All translation engines failed. Last error:`, lastError);
  throw lastError || new Error('All translation engines failed');
}
