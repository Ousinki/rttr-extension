import re

with open('entrypoints/content.ts', 'r') as f:
    content = f.read()

# Replace host.style.position = 'fixed'; with 'absolute';
content = content.replace("host.style.position = 'fixed';", "host.style.position = 'absolute';")

# 1. doFocusAPITranslate
content = re.sub(
    r"uiActions\.showTranslationBadge\(([^,]+),([^,]+), rect, false,\s*pos, currentSettings\.showTranslationEngine \?\? true, true\);",
    r"uiActions.showTranslationBadge(\1, \2, rect, false, pos, currentSettings.showTranslationEngine ?? true, true, getFocusedSentenceRect);",
    content
)

# 2. doFocusAITranslate (1st call)
content = re.sub(
    r"uiActions\.showTranslationBadge\('AI 翻译中\.\.\.', 'AI', rect, true, pos, currentSettings\.showTranslationEngine \?\? true, true\);",
    r"uiActions.showTranslationBadge('AI 翻译中...', 'AI', rect, true, pos, currentSettings.showTranslationEngine ?? true, true, getFocusedSentenceRect);",
    content
)

# 3. doFocusAITranslate (2nd call - success)
content = re.sub(
    r"uiActions\.showTranslationBadge\(resp\.translation, 'AI', newRect, false, pos, currentSettings\.showTranslationEngine \?\? true\);",
    r"uiActions.showTranslationBadge(resp.translation, 'AI', newRect, false, pos, currentSettings.showTranslationEngine ?? true, false, getFocusedSentenceRect);",
    content
)

# 4. doFocusAITranslate (3rd call - error)
content = re.sub(
    r"uiActions\.showTranslationBadge\(`翻译失败: \$\{resp\.error\}`,\s*'AI',\s*newRect,\s*false,\s*pos,\s*currentSettings\.showTranslationEngine \?\? true\);",
    r"uiActions.showTranslationBadge(`翻译失败: ${resp.error}`, 'AI', newRect, false, pos, currentSettings.showTranslationEngine ?? true, false, getFocusedSentenceRect);",
    content
)

# 5. Long press logic (translation success)
content = re.sub(
    r"uiActions\.showTranslationBadge\(resp\.translation, 'AI', longPressRect\(\), false,\s*pos, currentSettings\.showTranslationEngine \?\? true\);",
    r"uiActions.showTranslationBadge(resp.translation, 'AI', longPressRect(), false, pos, currentSettings.showTranslationEngine ?? true, false, longPressRect);",
    content
)

# 6. Context menu translate logic
content = re.sub(
    r"uiActions\.showTranslationBadge\(resp\.translation, 'AI', rect, false,\s*pos, currentSettings\.showTranslationEngine \?\? true\);",
    r"uiActions.showTranslationBadge(resp.translation, 'AI', rect, false, pos, currentSettings.showTranslationEngine ?? true, false, () => targetRange!.getBoundingClientRect());",
    content
)

with open('entrypoints/content.ts', 'w') as f:
    f.write(content)

