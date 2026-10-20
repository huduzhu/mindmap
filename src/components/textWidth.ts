const WIDE =
  /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}\u3000-\u303f\uff00-\uffef\p{Extended_Pictographic}]/u

/**
 * How many `ch` a title needs: Chinese, Japanese and Korean characters and
 * emoji are about two `ch` wide, so counting characters clipped them (#171).
 */
export function textWidthCh(text: string): number {
  let width = 0
  for (const char of text) width += WIDE.test(char) ? 2 : 1
  return width
}
