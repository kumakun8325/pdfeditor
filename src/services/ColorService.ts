import convert from 'color-convert';

/**
 * ColorService
 * RGB ↔ CMYK 変換を担当するサービスクラス
 */
export class ColorService {
  /**
   * RGB (0-255) → CMYK (0-1)
   * @param r Red (0-255)
   * @param g Green (0-255)
   * @param b Blue (0-255)
   * @returns [c, m, y, k] (0-1の範囲)
   */
  static rgbToCmyk(
    r: number,
    g: number,
    b: number
  ): [number, number, number, number] {
    const [c, m, y, k] = convert.rgb.cmyk(r, g, b);
    // color-convert は 0-100 で返すので 0-1 に正規化
    return [c / 100, m / 100, y / 100, k / 100];
  }

  /**
   * CMYK (0-1) → RGB (0-255)
   * プレビュー用の逆変換
   * @param c Cyan (0-1)
   * @param m Magenta (0-1)
   * @param y Yellow (0-1)
   * @param k Key (Black) (0-1)
   * @returns [r, g, b] (0-255の範囲)
   */
  static cmykToRgb(
    c: number,
    m: number,
    y: number,
    k: number
  ): [number, number, number] {
    const [r, g, b] = convert.cmyk.rgb(c * 100, m * 100, y * 100, k * 100);
    return [r, g, b];
  }

  /**
   * HEX文字列 → CMYK (0-1)
   * @param hex カラーコード（例: "#FF0000"）
   * @returns [c, m, y, k] (0-1の範囲)
   */
  static hexToCmyk(hex: string): [number, number, number, number] {
    const rgb = convert.hex.rgb(hex.replace('#', ''));
    return this.rgbToCmyk(rgb[0], rgb[1], rgb[2]);
  }

  /**
   * CMYK色域警告（Gamut Warning）
   * RGBで表現可能な色域を超えていないかチェック
   * @param r Red (0-255)
   * @param g Green (0-255)
   * @param b Blue (0-255)
   * @returns 色域外の場合true
   */
  static isOutOfGamut(r: number, g: number, b: number): boolean {
    const cmyk = this.rgbToCmyk(r, g, b);
    const [r2, g2, b2] = this.cmykToRgb(...cmyk);
    const deltaE = Math.sqrt(
      Math.pow(r - r2, 2) + Math.pow(g - g2, 2) + Math.pow(b - b2, 2)
    );
    return deltaE > 10; // 閾値（調整可能）
  }

  /**
   * CMYK (0-1) → HEX文字列
   * プレビュー用
   * @param c Cyan (0-1)
   * @param m Magenta (0-1)
   * @param y Yellow (0-1)
   * @param k Key (Black) (0-1)
   * @returns HEX文字列（例: "#FF0000"）
   */
  static cmykToHex(
    c: number,
    m: number,
    y: number,
    k: number
  ): string {
    const hex = convert.cmyk.hex(c * 100, m * 100, y * 100, k * 100);
    return `#${hex}`;
  }
}
