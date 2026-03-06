import { describe, expect, it } from 'vitest';
import { getCameraConstraintCandidates, getOppositeFacingMode } from '@/hooks/useCompositor';

describe('camera toggle helpers', () => {
    it('flips user to environment and back', () => {
        expect(getOppositeFacingMode('user')).toBe('environment');
        expect(getOppositeFacingMode('environment')).toBe('user');
    });

    it('builds camera constraint fallbacks in strict-to-relaxed order', () => {
        const userCandidates = getCameraConstraintCandidates('user');
        expect(userCandidates).toHaveLength(3);
        expect(userCandidates[0]).toEqual({
            width: 640,
            height: 480,
            facingMode: { exact: 'user' },
        });
        expect(userCandidates[1]).toEqual({
            width: 640,
            height: 480,
            facingMode: 'user',
        });
        expect(userCandidates[2]).toEqual({
            width: 640,
            height: 480,
        });
    });
});
