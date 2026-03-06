/**
 * Security utilities for MCP tool responses.
 * Wraps untrusted external content with safety markers to defend against
 * Indirect Prompt Injection (XPIA) attacks.
 */
/** Wrap tool result with safety markers if it contains external content */
export declare function wrapToolResult(toolName: string, jsonText: string): string;
//# sourceMappingURL=security.d.ts.map