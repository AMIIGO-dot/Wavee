/**
 * Normalize text for SMS to reduce segments and cost
 * Forces GSM-7 (ASCII) encoding where possible
 */
export function normalizeSmsText(input: string): string {
  if (!input) return '';

  let text = input;

  // 1. Normalize Swedish characters to ASCII
  text = text
    .replace(/[åä]/gi, 'a')
    .replace(/[ö]/gi, 'o')
    .replace(/[Å]/g, 'A')
    .replace(/[Ä]/g, 'A')
    .replace(/[Ö]/g, 'O');

  // 2. Replace smart quotes with ASCII quotes
  text = text
    .replace(/[""]/g, '"')
    .replace(/['']/g, "'");

  // 3. Replace long dashes with regular dash
  text = text.replace(/[–—]/g, '-');

  // 4. Remove emojis and other unicode symbols
  text = text.replace(
    /[\u{1F300}-\u{1FAFF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu,
    ''
  );

  // 5. Remove control characters except newline
  text = text.replace(/[^\x0A\x20-\x7E]/g, '');

  // 6. Limit consecutive newlines to max 1
  text = text.replace(/\n{2,}/g, '\n');

  // 7. Trim excessive whitespace
  text = text.trim();

  // 8. Remove leading/trailing whitespace from each line
  text = text.split('\n').map(line => line.trim()).join('\n');

  return text;
}

/**
 * Calculate approximate SMS segment count
 */
export function estimateSmsSegments(text: string): number {
  const length = text.length;
  
  // GSM-7 encoding
  if (length <= 160) return 1;
  if (length <= 306) return 2;
  if (length <= 459) return 3;
  if (length <= 612) return 4;
  
  return Math.ceil(length / 153);
}
