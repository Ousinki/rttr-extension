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

export interface GetSettingsRequest {
  type: 'GET_SETTINGS';
}

export interface LookupIpaRequest {
  type: 'LOOKUP_IPA';
  word: string;
}

export interface LookupIpaResponse {
  ipa: string | null;
}

export type RTTRMessage =
  | TranslateRequest
  | DismissWordRequest
  | UndismissWordRequest
  | GetSettingsRequest
  | LookupIpaRequest;
