/**
 * Configuration Parser
 * Parses EMAIL_CREDENTIALS env var and auto-discovers IMAP/SMTP settings
 */
export interface ServerConfig {
    host: string;
    port: number;
    secure: boolean;
}
export interface AccountConfig {
    id: string;
    email: string;
    password: string;
    imap: ServerConfig;
    smtp: ServerConfig;
}
/**
 * Parse EMAIL_CREDENTIALS environment variable
 *
 * Supported formats:
 * - Simple: email1:password1,email2:password2
 * - With custom IMAP host: email1:password1:imap.custom.com,email2:password2
 * - Passwords with commas are NOT supported (use env var per account instead)
 *
 * For passwords containing colons, use the 3-field format to disambiguate:
 *   email:password_with:colon:imap_host
 */
export declare function parseCredentials(envValue: string): AccountConfig[];
/**
 * Load and validate configuration from environment
 */
export declare function loadConfig(): AccountConfig[];
export declare function resolveAccount(accounts: AccountConfig[], query: string): AccountConfig;
/**
 * Resolve a single account, with optional filter.
 * When filter is omitted and there's exactly one account, returns it.
 * Throws AMBIGUOUS_ACCOUNT if multiple accounts match.
 */
export declare function resolveSingleAccount(accounts: AccountConfig[], accountFilter?: string): AccountConfig;
export declare function resolveAccounts(accounts: AccountConfig[], query?: string): AccountConfig[];
//# sourceMappingURL=config.d.ts.map