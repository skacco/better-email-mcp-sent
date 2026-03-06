/**
 * Folders Mega Tool
 * List mailbox folders across email accounts
 */
import type { AccountConfig } from '../helpers/config.js';
export interface FoldersInput {
    action: 'list';
    account?: string;
}
/**
 * Unified folders tool - handles folder listing
 */
export declare function folders(accounts: AccountConfig[], input: FoldersInput): Promise<any>;
//# sourceMappingURL=folders.d.ts.map