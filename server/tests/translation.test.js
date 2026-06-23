import { describe, it, expect } from 'vitest';
import { detectLanguage } from '../services/translation.js';

describe('detectLanguage (Unicode script detection)', () => {
  it('detects Devanagari as Hindi', () => {
    expect(detectLanguage('नमस्ते दुनिया')).toBe('hi');
  });
  it('detects Tamil', () => {
    expect(detectLanguage('வணக்கம் உலகம்')).toBe('ta');
  });
  it('detects Bengali', () => {
    expect(detectLanguage(' হ্যালো বিশ্ব')).toBe('bn');
  });
  it('detects Telugu', () => {
    expect(detectLanguage('నమస్తే ప్రపంచం')).toBe('te');
  });
  it('detects Gujarati', () => {
    expect(detectLanguage('નમસ્તે વિશ્વ')).toBe('gu');
  });
  it('defaults to English for Latin script', () => {
    expect(detectLanguage('hello world')).toBe('en');
  });
});
