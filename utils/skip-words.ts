/**
 * RTTR 基础词汇跳过表
 * 这些词太基础，不需要标注翻译。
 * 在 AI 返回结果后，前端本地过滤掉这些词（< 1ms）。
 *
 * 来源：基于 Oxford 3000 核心词汇精简
 * 维护：可根据需要增减
 */

const SKIP_WORDS: string[] = [
  // ─── 虚词 ───────────────────────────────────────────
  // 冠词
  'a', 'an', 'the',
  // 介词
  'in', 'on', 'at', 'to', 'of', 'for', 'with', 'from', 'by', 'about',
  'into', 'through', 'during', 'before', 'after', 'above', 'below',
  'between', 'under', 'over', 'up', 'down', 'out', 'off', 'near',
  'along', 'across', 'around', 'against', 'among', 'without', 'within',
  'behind', 'beyond', 'upon', 'toward', 'towards', 'until', 'since',
  // 连词
  'and', 'or', 'but', 'so', 'yet', 'nor', 'for', 'if', 'when',
  'while', 'because', 'although', 'though', 'unless', 'whether',
  'as', 'than', 'that', 'once', 'since', 'where',
  // 代词
  'i', 'me', 'my', 'mine', 'myself',
  'you', 'your', 'yours', 'yourself',
  'he', 'him', 'his', 'himself',
  'she', 'her', 'hers', 'herself',
  'it', 'its', 'itself',
  'we', 'us', 'our', 'ours', 'ourselves',
  'they', 'them', 'their', 'theirs', 'themselves',
  'this', 'that', 'these', 'those',
  'who', 'whom', 'whose', 'which', 'what',
  'someone', 'something', 'anyone', 'anything', 'everyone', 'everything',
  'nobody', 'nothing', 'somebody', 'somewhere',
  // 限定词
  'some', 'any', 'many', 'much', 'few', 'little', 'several',
  'all', 'each', 'every', 'both', 'either', 'neither', 'no', 'none',
  'other', 'another', 'such', 'own',

  // ─── be 动词 / 助动词 / 情态动词 ─────────────────────
  'am', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'do', 'does', 'did', 'done',
  'have', 'has', 'had', 'having',
  'will', 'would', 'shall', 'should',
  'can', 'could', 'may', 'might', 'must',
  'need', 'dare', 'ought',

  // ─── 基础副词 ───────────────────────────────────────
  'not', 'no', 'yes', 'very', 'too', 'also', 'just', 'only',
  'now', 'then', 'here', 'there', 'where', 'when', 'how', 'why',
  'well', 'still', 'already', 'even', 'ever', 'never', 'always',
  'often', 'sometimes', 'usually', 'again', 'almost', 'enough',
  'quite', 'rather', 'really', 'so', 'more', 'most', 'less', 'least',
  'ago', 'away', 'back', 'else', 'far', 'hard', 'long', 'soon',
  'today', 'tomorrow', 'yesterday', 'together', 'maybe', 'perhaps',

  // ─── 基础动词（最常见 200+） ────────────────────────
  'go', 'goes', 'went', 'gone', 'going',
  'come', 'comes', 'came', 'coming',
  'get', 'gets', 'got', 'gotten', 'getting',
  'make', 'makes', 'made', 'making',
  'take', 'takes', 'took', 'taken', 'taking',
  'give', 'gives', 'gave', 'given', 'giving',
  'put', 'puts', 'putting',
  'set', 'sets', 'setting',
  'let', 'lets', 'letting',
  'say', 'says', 'said', 'saying',
  'tell', 'tells', 'told', 'telling',
  'ask', 'asks', 'asked', 'asking',
  'see', 'sees', 'saw', 'seen', 'seeing',
  'look', 'looks', 'looked', 'looking',
  'find', 'finds', 'found', 'finding',
  'know', 'knows', 'knew', 'known', 'knowing',
  'think', 'thinks', 'thought', 'thinking',
  'feel', 'feels', 'felt', 'feeling',
  'try', 'tries', 'tried', 'trying',
  'leave', 'leaves', 'left', 'leaving',
  'call', 'calls', 'called', 'calling',
  'keep', 'keeps', 'kept', 'keeping',
  'turn', 'turns', 'turned', 'turning',
  'start', 'starts', 'started', 'starting',
  'stop', 'stops', 'stopped', 'stopping',
  'run', 'runs', 'ran', 'running',
  'move', 'moves', 'moved', 'moving',
  'open', 'opens', 'opened', 'opening',
  'close', 'closes', 'closed', 'closing',
  'play', 'plays', 'played', 'playing',
  'live', 'lives', 'lived', 'living',
  'work', 'works', 'worked', 'working',
  'read', 'reads', 'reading',
  'write', 'writes', 'wrote', 'written', 'writing',
  'show', 'shows', 'showed', 'shown', 'showing',
  'help', 'helps', 'helped', 'helping',
  'want', 'wants', 'wanted', 'wanting',
  'need', 'needs', 'needed', 'needing',
  'use', 'uses', 'used', 'using',
  'like', 'likes', 'liked', 'liking',
  'hear', 'hears', 'heard', 'hearing',
  'eat', 'eats', 'ate', 'eaten', 'eating',
  'drink', 'drinks', 'drank', 'drunk', 'drinking',
  'sit', 'sits', 'sat', 'sitting',
  'stand', 'stands', 'stood', 'standing',
  'wait', 'waits', 'waited', 'waiting',
  'walk', 'walks', 'walked', 'walking',
  'talk', 'talks', 'talked', 'talking',
  'speak', 'speaks', 'spoke', 'spoken', 'speaking',
  'send', 'sends', 'sent', 'sending',
  'pay', 'pays', 'paid', 'paying',
  'buy', 'buys', 'bought', 'buying',
  'sell', 'sells', 'sold', 'selling',
  'bring', 'brings', 'brought', 'bringing',
  'hold', 'holds', 'held', 'holding',
  'build', 'builds', 'built', 'building',
  'learn', 'learns', 'learned', 'learning',
  'change', 'changes', 'changed', 'changing',
  'follow', 'follows', 'followed', 'following',
  'create', 'creates', 'created', 'creating',
  'add', 'adds', 'added', 'adding',
  'grow', 'grows', 'grew', 'grown', 'growing',
  'watch', 'watches', 'watched', 'watching',
  'begin', 'begins', 'began', 'begun', 'beginning',
  'seem', 'seems', 'seemed', 'seeming',
  'happen', 'happens', 'happened', 'happening',
  'become', 'becomes', 'became', 'becoming',
  'meet', 'meets', 'met', 'meeting',
  'include', 'includes', 'included', 'including',
  'continue', 'continues', 'continued', 'continuing',
  'allow', 'allows', 'allowed', 'allowing',
  'fall', 'falls', 'fell', 'fallen', 'falling',
  'win', 'wins', 'won', 'winning',
  'lose', 'loses', 'lost', 'losing',
  'die', 'dies', 'died', 'dying',
  'reach', 'reaches', 'reached', 'reaching',
  'kill', 'kills', 'killed', 'killing',
  'remain', 'remains', 'remained', 'remaining',
  'suggest', 'suggests', 'suggested', 'suggesting',
  'raise', 'raises', 'raised', 'raising',
  'pass', 'passes', 'passed', 'passing',
  'require', 'requires', 'required', 'requiring',
  'report', 'reports', 'reported', 'reporting',
  'decide', 'decides', 'decided', 'deciding',
  'pull', 'pulls', 'pulled', 'pulling',
  'pick', 'picks', 'picked', 'picking',
  'develop', 'develops', 'developed', 'developing',
  'carry', 'carries', 'carried', 'carrying',
  'break', 'breaks', 'broke', 'broken', 'breaking',
  'receive', 'receives', 'received', 'receiving',
  'agree', 'agrees', 'agreed', 'agreeing',
  'support', 'supports', 'supported', 'supporting',
  'hit', 'hits', 'hitting',
  'produce', 'produces', 'produced', 'producing',
  'offer', 'offers', 'offered', 'offering',
  'consider', 'considers', 'considered', 'considering',
  'appear', 'appears', 'appeared', 'appearing',
  'cover', 'covers', 'covered', 'covering',
  'serve', 'serves', 'served', 'serving',
  'apply', 'applies', 'applied', 'applying',
  'mean', 'means', 'meant', 'meaning',
  'place', 'places', 'placed', 'placing',
  'install', 'installs', 'installed', 'installing',
  'check', 'checks', 'checked', 'checking',
  'share', 'shares', 'shared', 'sharing',
  'love', 'loves', 'loved', 'loving',
  'hate', 'hates', 'hated', 'hating',
  'remember', 'remembers', 'remembered', 'remembering',
  'forget', 'forgets', 'forgot', 'forgotten', 'forgetting',
  'understand', 'understands', 'understood', 'understanding',
  'answer', 'answers', 'answered', 'answering',

  // ─── 基础名词 ───────────────────────────────────────
  'time', 'year', 'people', 'way', 'day', 'man', 'woman',
  'child', 'children', 'world', 'life', 'hand', 'part', 'place',
  'case', 'week', 'company', 'system', 'program', 'question',
  'work', 'number', 'night', 'point', 'home', 'water', 'room',
  'mother', 'area', 'money', 'story', 'fact', 'month', 'lot',
  'right', 'study', 'book', 'eye', 'job', 'word', 'side',
  'kind', 'head', 'house', 'friend', 'father', 'power', 'hour',
  'game', 'line', 'end', 'member', 'city', 'school', 'body',
  'car', 'name', 'family', 'door', 'thing', 'idea', 'food',
  'face', 'country', 'group', 'problem', 'service', 'person',
  'state', 'form', 'team', 'table', 'class', 'type', 'level',
  'light', 'age', 'road', 'reason', 'mind', 'music', 'color',
  'file', 'files', 'page', 'paper', 'letter', 'picture', 'plan',
  'example', 'result', 'list', 'office', 'bed', 'air', 'dog',
  'window', 'piece', 'student', 'teacher', 'market', 'price',
  'size', 'card', 'view', 'wall', 'rate', 'top', 'step',
  'box', 'key', 'data', 'test', 'base', 'bit', 'ground',
  'space', 'field', 'model', 'order', 'rule', 'center', 'street',
  'site', 'note', 'term', 'sign', 'value', 'tree', 'user',

  // ─── 基础形容词 ─────────────────────────────────────
  'good', 'great', 'new', 'old', 'big', 'small', 'long', 'short',
  'high', 'low', 'large', 'little', 'young', 'right', 'wrong',
  'important', 'different', 'bad', 'same', 'able', 'last', 'next',
  'early', 'late', 'hard', 'easy', 'best', 'better', 'full',
  'free', 'real', 'sure', 'true', 'false', 'clear', 'dark',
  'fast', 'slow', 'hot', 'cold', 'warm', 'cool', 'nice',
  'happy', 'ready', 'simple', 'strong', 'possible', 'whole',
  'local', 'main', 'public', 'open', 'close', 'common', 'single',
  'special', 'available', 'second', 'first', 'third', 'final',
  'white', 'black', 'red', 'blue', 'green', 'half', 'own',
  'certain', 'enough', 'every', 'only', 'total', 'general',

  // ─── 数词 / 基础量词 ────────────────────────────────
  'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight',
  'nine', 'ten', 'hundred', 'thousand', 'million', 'billion',
  'first', 'second', 'third',

  // ─── 缩写形式 ───────────────────────────────────────
  "don't", "doesn't", "didn't", "won't", "wouldn't",
  "can't", "couldn't", "shouldn't", "mustn't",
  "isn't", "aren't", "wasn't", "weren't",
  "haven't", "hasn't", "hadn't",
  "it's", "that's", "there's", "here's", "what's",
  "i'm", "you're", "we're", "they're", "he's", "she's",
  "i've", "you've", "we've", "they've",
  "i'll", "you'll", "we'll", "they'll", "he'll", "she'll", "it'll",
  "i'd", "you'd", "we'd", "they'd", "he'd", "she'd",
  "let's", "who's", "how's", "where's", "when's",

  // ─── 其他常见基础词 ─────────────────────────────────
  'outside', 'inside', 'wherever', 'whenever', 'whatever',
  'however', 'therefore', 'otherwise',
];

/**
 * 构建跳过词 Set（用于快速查找）
 */
export const skipWordsSet: Set<string> = new Set(
  SKIP_WORDS.map((w) => w.toLowerCase())
);

/**
 * 检查一个词/短语是否应该被跳过
 * - 单个词：直接查跳过表
 * - 短语：如果每个词都是基础词则跳过（如 "you can", "won't install"）
 */
export function shouldSkip(wordOrPhrase: string): boolean {
  const lower = wordOrPhrase.toLowerCase().trim();

  // 单个词（含连字符词如 "small-scale"）：直接查表
  if (!lower.includes(' ')) {
    return skipWordsSet.has(lower);
  }

  // 短语：如果每个单词都是基础词 → 跳过
  const words = lower.split(/\s+/);
  return words.every((w) => skipWordsSet.has(w));
}

