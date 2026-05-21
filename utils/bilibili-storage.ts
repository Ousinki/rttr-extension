/**
 * Bilibili Study Companion Storage Cache Manager
 * 利用 WXT 本地存储机制 (storage.local) 持久化存储已导入的精读学习包
 */

import { storage } from '#imports';
import { BiliStudyPackage } from './bilibili-parser';

/**
 * 将精读学习包保存到本地存储
 */
export async function saveBiliPackage(bvid: string, pkg: BiliStudyPackage): Promise<void> {
  if (!bvid) return;
  const key = `local:bili-study-${bvid}` as `local:${string}`;
  await storage.setItem(key, pkg);
}

/**
 * 从本地存储读取精读学习包
 */
export async function getBiliPackage(bvid: string): Promise<BiliStudyPackage | null> {
  if (!bvid) return null;
  const key = `local:bili-study-${bvid}` as `local:${string}`;
  return await storage.getItem<BiliStudyPackage>(key);
}

/**
 * 删除指定视频的缓存学习包
 */
export async function deleteBiliPackage(bvid: string): Promise<void> {
  if (!bvid) return;
  const key = `local:bili-study-${bvid}` as `local:${string}`;
  await storage.removeItem(key);
}

/**
 * 记录用户对每个视频的个性化学习配置 (如当前变速、是否自动暂停等)
 */
export interface BiliVideoPreference {
  playbackRate: number;
  autoPauseEnabled: boolean;
  subtitleOverlayEnabled: boolean;
  hudEnabled: boolean;
  studyActive?: boolean;
  subtitleHoverPauseEnabled?: boolean;
}

const DEFAULT_PREF: BiliVideoPreference = {
  playbackRate: 1.0,
  autoPauseEnabled: false,
  subtitleOverlayEnabled: true,
  hudEnabled: true,
  studyActive: false,
  subtitleHoverPauseEnabled: true,
};

export async function saveBiliPreference(bvid: string, pref: BiliVideoPreference): Promise<void> {
  if (!bvid) return;
  const key = `local:bili-pref-${bvid}` as `local:${string}`;
  await storage.setItem(key, pref);
}

export async function getBiliPreference(bvid: string): Promise<BiliVideoPreference> {
  if (!bvid) return DEFAULT_PREF;
  const key = `local:bili-pref-${bvid}` as `local:${string}`;
  const saved = await storage.getItem<BiliVideoPreference>(key);
  return saved || DEFAULT_PREF;
}
