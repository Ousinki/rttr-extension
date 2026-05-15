<template>
  <div>
    <GlobalTooltip />
    <PronounceBadge />
    <TranslationBadge />
    <ExplainPanel />
    <ContextMenu />
    <LongPressRing />
    <SyllableOverlay />
  </div>
</template>

<script setup lang="ts">
import GlobalTooltip from './GlobalTooltip.vue';
import PronounceBadge from './PronounceBadge.vue';
import TranslationBadge from './TranslationBadge.vue';
import ExplainPanel from './ExplainPanel.vue';
import ContextMenu from './ContextMenu.vue';
import LongPressRing from './LongPressRing.vue';
import SyllableOverlay from './SyllableOverlay.vue';
</script>
