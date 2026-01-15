import { describe, it, expect } from 'vitest';
import { ColorService } from '../../../src/services/ColorService';

describe('ColorService', () => {
    describe('rgbToCmyk', () => {
        it('純粋な赤を正しく変換する', () => {
            const [c, m, y, k] = ColorService.rgbToCmyk(255, 0, 0);
            expect(c).toBeCloseTo(0, 1);
            expect(m).toBeCloseTo(1, 1);
            expect(y).toBeCloseTo(1, 1);
            expect(k).toBeCloseTo(0, 1);
        });

        it('純粋な黒を正しく変換する', () => {
            const [c, m, y, k] = ColorService.rgbToCmyk(0, 0, 0);
            expect(k).toBeCloseTo(1, 1);
        });

        it('純粋な白を正しく変換する', () => {
            const [c, m, y, k] = ColorService.rgbToCmyk(255, 255, 255);
            expect(c).toBeCloseTo(0, 1);
            expect(m).toBeCloseTo(0, 1);
            expect(y).toBeCloseTo(0, 1);
            expect(k).toBeCloseTo(0, 1);
        });

        it('グレーを正しく変換する', () => {
            const [c, m, y, k] = ColorService.rgbToCmyk(128, 128, 128);
            expect(c).toBeCloseTo(0, 1);
            expect(m).toBeCloseTo(0, 1);
            expect(y).toBeCloseTo(0, 1);
            expect(k).toBeGreaterThan(0);
        });
    });

    describe('hexToCmyk', () => {
        it('HEX文字列を正しく変換する', () => {
            const [c, m, y, k] = ColorService.hexToCmyk('#FF0000');
            expect(m).toBeCloseTo(1, 1);
            expect(y).toBeCloseTo(1, 1);
        });

        it('#なしのHEX文字列も処理できる', () => {
            const [c, m, y, k] = ColorService.hexToCmyk('00FF00');
            expect(c).toBeCloseTo(1, 1);
            expect(y).toBeCloseTo(1, 1);
        });

        it('小文字のHEX文字列を処理できる', () => {
            const [c, m, y, k] = ColorService.hexToCmyk('#0000ff');
            expect(c).toBeCloseTo(1, 1);
            expect(m).toBeCloseTo(1, 1);
        });
    });

    describe('cmykToRgb', () => {
        it('CMYKを正しくRGBに変換する', () => {
            const [r, g, b] = ColorService.cmykToRgb(0, 1, 1, 0);
            expect(r).toBeCloseTo(255, 0);
            expect(g).toBeCloseTo(0, 10);
            expect(b).toBeCloseTo(0, 10);
        });

        it('黒を正しく変換する', () => {
            const [r, g, b] = ColorService.cmykToRgb(0, 0, 0, 1);
            expect(r).toBe(0);
            expect(g).toBe(0);
            expect(b).toBe(0);
        });

        it('白を正しく変換する', () => {
            const [r, g, b] = ColorService.cmykToRgb(0, 0, 0, 0);
            expect(r).toBe(255);
            expect(g).toBe(255);
            expect(b).toBe(255);
        });
    });

    describe('cmykToHex', () => {
        it('CMYKを正しくHEXに変換する', () => {
            const hex = ColorService.cmykToHex(0, 1, 1, 0);
            expect(hex.toLowerCase()).toMatch(/#ff0000|#fe0000/); // 変換誤差を考慮
        });

        it('黒を正しく変換する', () => {
            const hex = ColorService.cmykToHex(0, 0, 0, 1);
            expect(hex.toLowerCase()).toBe('#000000');
        });

        it('白を正しく変換する', () => {
            const hex = ColorService.cmykToHex(0, 0, 0, 0);
            expect(hex.toLowerCase()).toBe('#ffffff');
        });
    });

    describe('isOutOfGamut', () => {
        it('色域内の色はfalseを返す', () => {
            expect(ColorService.isOutOfGamut(255, 0, 0)).toBe(false);
            expect(ColorService.isOutOfGamut(0, 255, 0)).toBe(false);
            expect(ColorService.isOutOfGamut(0, 0, 255)).toBe(false);
        });

        it('白と黒は色域内', () => {
            expect(ColorService.isOutOfGamut(0, 0, 0)).toBe(false);
            expect(ColorService.isOutOfGamut(255, 255, 255)).toBe(false);
        });
    });
});
