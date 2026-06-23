import '@testing-library/jest-dom';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

// Initialise i18n once for all component tests.
import '../i18n/i18n';

afterEach(() => {
  cleanup();
  localStorage.clear();
});
