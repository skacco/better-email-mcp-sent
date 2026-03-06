/**
 * Messages Mega Tool
 * All email message operations in one unified interface
 */
import type { AccountConfig } from '../helpers/config.js';
export interface MessagesInput {
    action: 'search' | 'read' | 'mark_read' | 'mark_unread' | 'flag' | 'unflag' | 'move' | 'archive' | 'trash';
    account?: string;
    query?: string;
    folder?: string;
    limit?: number;
    uid?: number;
    uids?: number[];
    destination?: string;
}
/**
 * Unified messages tool - handles all message operations
 */
export declare function messages(accounts: AccountConfig[], input: MessagesInput): Promise<any>;
//# sourceMappingURL=messages.d.ts.map