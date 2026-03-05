import { describe, expect, it } from 'vitest';
import {
  APP_DESCRIPTION,
  APP_NAME,
  APP_TAGLINE,
  APP_TITLE,
} from '@/lib/branding';
import { DASHBOARD_MAIN_LAYOUT_CLASS } from '@/lib/layoutClasses';

describe('App branding and responsive layout config', () => {
  it('uses a consistent app identity', () => {
    expect(APP_NAME).toBe('VantAIge');
    expect(APP_TITLE).toContain(APP_NAME);
    expect(APP_TAGLINE.length).toBeGreaterThan(10);
    expect(APP_DESCRIPTION).toContain(APP_NAME);
  });

  it('keeps the dashboard layout mobile-friendly', () => {
    expect(DASHBOARD_MAIN_LAYOUT_CLASS).toContain('sm:gap-6');
    expect(DASHBOARD_MAIN_LAYOUT_CLASS).toContain('100dvh');
    expect(DASHBOARD_MAIN_LAYOUT_CLASS).not.toContain('100vh');
  });
});
