/**
 * Bilibili Study Companion Global Reactive State
 * 负责协调视频播放进度、加载数据包、以及 Sidebar、HUD、字幕层之间的状态同步
 */

import { reactive } from 'vue';
import { SubtitleEntry, StudyNote, BiliStudyPackage } from './bilibili-parser';
import { getBiliPreference, saveBiliPreference } from './bilibili-storage';

export interface BiliState {
  bvid: string;
  videoTitle: string;
  packageLoaded: boolean;
  subtitles: SubtitleEntry[];
  notes: StudyNote[];
  currentTime: number;
  activeIndex: number;
  activeNote: StudyNote | null;
  isPlaying: boolean;
  
  // UI 状态
  sidebarVisible: boolean;
  hudVisible: boolean;
  hudX: number;
  hudY: number;
  
  // 控制状态
  autoPause: boolean;
  playbackRate: number;
  loopActive: boolean;
  loopStart: number;
  loopEnd: number;
  customSubtitlesEnabled: boolean;
  studyActive: boolean;
  subtitleHoverPause: 'off' | 'hover' | 'click';
}

export const biliState = reactive<BiliState>({
  bvid: '',
  videoTitle: '',
  packageLoaded: false,
  subtitles: [],
  notes: [],
  currentTime: 0,
  activeIndex: -1,
  activeNote: null,
  isPlaying: false,
  
  sidebarVisible: false,
  hudVisible: true,
  hudX: 0,
  hudY: 0,
  
  autoPause: false,
  playbackRate: 1.0,
  loopActive: false,
  loopStart: 0,
  loopEnd: 0,
  customSubtitlesEnabled: true,
  studyActive: false,
  subtitleHoverPause: 'hover',
});

import { storage } from '#imports';
import { settingsStorage } from './storage';

export const biliActions = {
  /**
   * 初始化视频状态，自动载入偏好设置
   */
  async initVideo(bvid: string, title: string) {
    biliState.bvid = bvid;
    biliState.videoTitle = title;
    biliState.packageLoaded = false;
    biliState.subtitles = [];
    biliState.notes = [];
    biliState.currentTime = 0;
    biliState.activeIndex = -1;
    biliState.activeNote = null;
    biliState.loopActive = false;

    // 获取并应用用户的持久化配置
    const prefKey = `local:bili-pref-${bvid}` as `local:${string}`;
    const savedPref = await storage.getItem<{
      playbackRate: number;
      autoPauseEnabled: boolean;
      subtitleOverlayEnabled: boolean;
      hudEnabled: boolean;
      studyActive?: boolean;
      subtitleHoverPauseEnabled?: 'off' | 'hover' | 'click';
    }>(prefKey);
    const globalSettings = await settingsStorage.getValue();

    if (savedPref) {
      biliState.playbackRate = savedPref.playbackRate;
      biliState.autoPause = savedPref.autoPauseEnabled;
      biliState.customSubtitlesEnabled = savedPref.subtitleOverlayEnabled;
      biliState.hudVisible = savedPref.hudEnabled;
      biliState.subtitleHoverPause = savedPref.subtitleHoverPauseEnabled ?? globalSettings.biliSubtitleHoverPause;
      biliState.studyActive = savedPref.studyActive ?? false;
    } else {
      // 没有本视频专属配置，则读取 options 页面设置的全局默认值
      biliState.playbackRate = 1.0;
      biliState.autoPause = globalSettings.biliAutoPause;
      biliState.customSubtitlesEnabled = globalSettings.biliCustomSubtitles;
      biliState.hudVisible = globalSettings.biliHudVisible;
      biliState.subtitleHoverPause = globalSettings.biliSubtitleHoverPause;
      biliState.studyActive = false;
    }
  },

  /**
   * 载入精读学习包
   */
  loadPackage(pkg: BiliStudyPackage) {
    biliState.subtitles = pkg.subtitles;
    biliState.notes = pkg.notes;
    biliState.packageLoaded = true;
    biliState.activeIndex = -1;
    biliState.activeNote = null;
  },

  clearPackage() {
    biliState.subtitles = [];
    biliState.notes = [];
    biliState.packageLoaded = false;
    biliState.activeIndex = -1;
    biliState.activeNote = null;
    biliState.loopActive = false;
    biliState.studyActive = false;
  },

  /**
   * 高精度时间更新逻辑，每帧执行
   * @returns {boolean} 是否由于“自动暂停”触发了暂停
   */
  updateTime(time: number, pauseVideoCallback: () => void): boolean {
    biliState.currentTime = time;

    // 1. A-B 单句循环区间拦截
    if (biliState.loopActive && (time < biliState.loopStart || time > biliState.loopEnd)) {
      // 循环回跳到起点
      return true; // 告知外部需要 Seek
    }

    // 2. 匹配当前时间轴所属的字幕
    let foundIndex = -1;
    for (let i = 0; i < biliState.subtitles.length; i++) {
      const sub = biliState.subtitles[i];
      if (time >= sub.start && time <= sub.end) {
        foundIndex = i;
        break;
      }
    }

    // 3. 匹配当前时间轴触发的精读讲义
    let foundNote: StudyNote | null = null;
    if (foundIndex !== -1) {
      const sub = biliState.subtitles[foundIndex];
      // 寻找在该字幕区间 [start, end] 内触发的讲义
      foundNote = biliState.notes.find(note => note.timestamp >= sub.start && note.timestamp <= sub.end) || null;
    } else {
      // 如果没有字幕，则找最接近的讲义（展示前后各 3 秒）
      foundNote = biliState.notes.find(note => Math.abs(time - note.timestamp) < 3.0) || null;
    }

    // 4. 精读自动暂停逻辑 (Auto-Pause)
    // 条件：启用了自动暂停、找到了新讲义、且该讲义在本次 Tick 之前尚未激活，且视频正在播放
    if (
      biliState.autoPause &&
      foundNote &&
      biliState.activeNote?.timestamp !== foundNote.timestamp &&
      biliState.isPlaying
    ) {
      pauseVideoCallback();
    }

    biliState.activeIndex = foundIndex;
    biliState.activeNote = foundNote;
    
    return false;
  },

  setPlaying(playing: boolean) {
    biliState.isPlaying = playing;
  },

  setPlaybackRate(rate: number, updateVideoRateCallback: (r: number) => void) {
    biliState.playbackRate = rate;
    updateVideoRateCallback(rate);
    this.savePrefs();
  },

  setAutoPause(enabled: boolean) {
    biliState.autoPause = enabled;
    this.savePrefs();
  },

  setCustomSubtitlesEnabled(enabled: boolean) {
    biliState.customSubtitlesEnabled = enabled;
    this.savePrefs();
  },

  setHudVisible(enabled: boolean) {
    biliState.hudVisible = enabled;
    this.savePrefs();
  },

  setStudyActive(enabled: boolean) {
    biliState.studyActive = enabled;
    this.savePrefs();
  },

  setSubtitleHoverPause(mode: 'off' | 'hover' | 'click') {
    biliState.subtitleHoverPause = mode;
    this.savePrefs();
  },

  setLoopActive(active: boolean, start = 0, end = 0) {
    biliState.loopActive = active;
    if (active) {
      biliState.loopStart = start;
      biliState.loopEnd = end;
    }
  },

  updateHudPosition(x: number, y: number) {
    biliState.hudX = x;
    biliState.hudY = y;
  },

  savePrefs() {
    if (!biliState.bvid) return;
    saveBiliPreference(biliState.bvid, {
      playbackRate: biliState.playbackRate,
      autoPauseEnabled: biliState.autoPause,
      subtitleOverlayEnabled: biliState.customSubtitlesEnabled,
      hudEnabled: biliState.hudVisible,
      studyActive: biliState.studyActive,
      subtitleHoverPauseEnabled: biliState.subtitleHoverPause,
    });
  }
};
