/**
 * Folders Mega Tool
 * List mailbox folders across email accounts
 */
import { resolveAccounts } from '../helpers/config.js';
import { EmailMCPError, withErrorHandling } from '../helpers/errors.js';
import { listFolders } from '../helpers/imap-client.js';
/**
 * Unified folders tool - handles folder listing
 */
export async function folders(accounts, input) {
    return withErrorHandling(async () => {
        switch (input.action) {
            case 'list':
                return await handleList(accounts, input);
            default:
                throw new EmailMCPError(`Unknown action: ${input.action}`, 'VALIDATION_ERROR', 'Supported actions: list');
        }
    })();
}
/**
 * List folders across accounts
 */
async function handleList(accounts, input) {
    const targetAccounts = resolveAccounts(accounts, input.account);
    const accountPromises = targetAccounts.map(async (account) => {
        try {
            const folderList = await listFolders(account);
            return {
                account_id: account.id,
                account_email: account.email,
                folders: folderList
            };
        }
        catch (error) {
            return {
                account_id: account.id,
                account_email: account.email,
                error: error.message,
                folders: []
            };
        }
    });
    const results = await Promise.all(accountPromises);
    return {
        action: 'list',
        total_accounts: results.length,
        accounts: results
    };
}
//# sourceMappingURL=folders.js.map