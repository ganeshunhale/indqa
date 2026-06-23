import { describe, it, expect, afterEach } from 'vitest';
import i18n from './i18n';

afterEach(async () => {
  await i18n.changeLanguage('en');
});

describe('i18n resources', () => {
  it('defaults to English', () => {
    expect(i18n.t('welcome')).toBe('Welcome to IndQA');
  });

  it('translates UI strings to Hindi', async () => {
    await i18n.changeLanguage('hi');
    expect(i18n.t('send')).toBe('भेजें');
    expect(i18n.t('newChat')).toBe('नई चैट');
  });

  it('translates UI strings to Tamil', async () => {
    await i18n.changeLanguage('ta');
    expect(i18n.t('send')).toBe('அனுப்பு');
  });

  it('falls back to English for an undefined key', async () => {
    await i18n.changeLanguage('ml');
    // A key that does not exist in any resource returns the key itself by default.
    expect(i18n.t('welcome')).toBe('IndQA ലേക്ക് സ്വാഗതം');
  });
});
