/**
 * Error Handling Utilities
 * AI-friendly error messages and suggestions for email operations
 */
export declare class EmailMCPError extends Error {
    code: string;
    suggestion?: string | undefined;
    details?: any | undefined;
    constructor(message: string, code: string, suggestion?: string | undefined, details?: any | undefined);
    toJSON(): {
        error: string;
        code: string;
        message: string;
        suggestion: string | undefined;
        details: any;
    };
}
/**
 * Enhance email-related errors with helpful context
 */
export declare function enhanceError(error: any): EmailMCPError;
/**
 * Create AI-readable error message
 */
export declare function aiReadableMessage(error: EmailMCPError): string;
/**
 * Suggest fixes based on error
 */
export declare function suggestFixes(error: EmailMCPError): string[];
/**
 * Wrap async function with error handling
 */
export declare function withErrorHandling<T extends (...args: any[]) => Promise<any>>(fn: T): (...args: Parameters<T>) => Promise<ReturnType<T>>;
//# sourceMappingURL=errors.d.ts.map