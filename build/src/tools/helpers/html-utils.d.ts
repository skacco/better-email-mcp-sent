/**
 * HTML to Clean Text Utilities
 * Strips HTML tags, CSS, scripts and returns clean text for LLM consumption
 */
/**
 * Escapes HTML characters in a string to prevent XSS attacks when embedding user input into HTML
 */
export declare function escapeHtml(unsafe: string): string;
/**
 * Convert HTML email body to clean plain text
 * Removes CSS, scripts, images, and formatting noise to save LLM tokens
 */
export declare function htmlToCleanText(html: string): string;
/**
 * Fast regex-based HTML snippet extraction for search results
 * Much faster than full html-to-text for short previews (~30x speedup)
 */
export declare function fastExtractSnippet(html: string, maxLength?: number): string;
//# sourceMappingURL=html-utils.d.ts.map