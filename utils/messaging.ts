/**
 * RTTR Messaging Layer
 * Content Script ↔ Background 类型安全通信
 */

import type { AnnotationResult } from './ai';

// ─── 消息类型定义 ────────────────────────────────────────

export interface TranslateRequest {
  type: 'TRANSLATE';
  text: string;
}

export interface TranslateResponse {
  success: boolean;
  results?: AnnotationResult[];
  error?: string;
}

export interface DismissWordRequest {
  type: 'DISMISS_WORD';
  word: string;
}

export interface DismissWordResponse {
  success: boolean;
}

export interface UndismissWordRequest {
  type: 'UNDISMISS_WORD';
  word: string;
}

export interface UndismissWordResponse {
  success: boolean;
}


export interface LookupIpaRequest {
  type: 'LOOKUP_IPA';
  word: string;
}

export interface LookupIpaResponse {
  ipa: string | null;
}

export interface ExplainWordRequest {
  type: 'EXPLAIN_WORD';
  word: string;
  sentence: string;
}

export interface ContextualTranslateRequest {
  type: 'CONTEXTUAL_TRANSLATE';
  word: string;
  sentence: string;
}

export interface OpenOptionsRequest {
  type: 'OPEN_OPTIONS';
}

export interface FetchImageBase64Request {
  type: 'FETCH_IMAGE_BASE64';
  url: string;
}

export interface FetchImageBase64Response {
  base64: string | null;
}

export type TranslationEngine = 'google' | 'deepl' | 'bing';

export interface FetchTranslationRequest {
  type: 'FETCH_TRANSLATION';
  text: string;
  sourceLang: string;
  targetLang: string;
  engine: TranslationEngine;
}

export interface FetchTranslationResponse {
  targetText: string;
  detectedLang?: string;
  engine: TranslationEngine;
  error?: string;
}

export type RTTRMessage =
  | TranslateRequest
  | DismissWordRequest
  | UndismissWordRequest
  | LookupIpaRequest
  | ExplainWordRequest
  | ContextualTranslateRequest
  | OpenOptionsRequest
  | FetchImageBase64Request
  | FetchTranslationRequest;
