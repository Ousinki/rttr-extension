import re

with open('entrypoints/content.ts', 'r') as f:
    content = f.read()

# 1. Double click word (around line 450)
content = re.sub(
    r"uiActions\.showTranslationBadge\(resp\.targetText, resp\.engine \|\| engine, rect, true,\s*pos, currentSettings\.showTranslationEngine \?\? true\);",
    r"uiActions.showTranslationBadge(resp.targetText, resp.engine || engine, rect, true, pos, currentSettings.showTranslationEngine ?? true, false, () => getClosestRect(range, e.clientX, e.clientY));",
    content
)

# 2. Translate paragraph (around line 718)
content = re.sub(
    r"uiActions\.showTranslationBadge\(resp\.targetText, resp\.engine \|\| engine, info\.rect, false,\s*pos, currentSettings\.showTranslationEngine \?\? true\);",
    r"uiActions.showTranslationBadge(resp.targetText, resp.engine || engine, info.rect, false, pos, currentSettings.showTranslationEngine ?? true, false, () => info.rect);", # We can't easily recompute paragraph rect without the node, but usually paragraph doesn't reflow its top as much as a word
    content
)

# 3. Selection auto translate (around line 780)
content = re.sub(
    r"uiActions\.showTranslationBadge\(resp\.targetText, resp\.engine \|\| engine, rect, false,\s*pos, currentSettings\.showTranslationEngine \?\? true\);",
    r"uiActions.showTranslationBadge(resp.targetText, resp.engine || engine, rect, false, pos, currentSettings.showTranslationEngine ?? true, false, () => { const sel = document.getSelection(); return sel && sel.rangeCount > 0 ? sel.getRangeAt(0).getBoundingClientRect() : null; });",
    content
)

with open('entrypoints/content.ts', 'w') as f:
    f.write(content)

