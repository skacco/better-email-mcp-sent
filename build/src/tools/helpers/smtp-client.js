/**
 * SMTP Client
 * Send, reply, and forward emails via SMTP using Nodemailer
 */
import { marked } from 'marked';
import { createTransport } from 'nodemailer';
import { EmailMCPError } from './errors.js';
import { escapeHtml } from './html-utils.js';
/**
 * Create a Nodemailer transporter for the given account.
 * Enforces TLS for all connections to prevent STARTTLS downgrade attacks.
 * - Port 465: implicit TLS (secure: true)
 * - Port 587: STARTTLS with requireTLS to enforce upgrade
 */
function createSmtpTransport(account) {
    const isImplicitTls = account.smtp.secure || account.smtp.port === 465;
    return createTransport({
        host: account.smtp.host,
        port: account.smtp.port,
        secure: isImplicitTls,
        requireTLS: !isImplicitTls,
        auth: {
            user: account.email,
            pass: account.password
        }
    });
}
/** Dangerous URI schemes that could execute code in email clients */
const DANGEROUS_SCHEMES = /^(javascript|data|vbscript):/i;
/**
 * Convert markdown text to simple HTML for email.
 * Uses marked with custom renderers that:
 * - Escape raw HTML tokens (prevents injected tags)
 * - Strip dangerous URI schemes from links/images (prevents javascript: XSS)
 */
function textToHtml(text) {
    const renderer = new marked.Renderer();
    // Escape raw HTML instead of passing it through
    renderer.html = ({ text: rawHtml }) => escapeHtml(rawHtml);
    // Strip dangerous URI schemes from links
    const originalLink = renderer.link.bind(renderer);
    renderer.link = (token) => {
        if (DANGEROUS_SCHEMES.test(token.href)) {
            return escapeHtml(token.text);
        }
        return originalLink(token);
    };
    // Strip dangerous URI schemes from images
    const originalImage = renderer.image.bind(renderer);
    renderer.image = (token) => {
        if (DANGEROUS_SCHEMES.test(token.href)) {
            return escapeHtml(token.text || '');
        }
        return originalImage(token);
    };
    return marked.parse(text, { async: false, breaks: true, renderer });
}
/**
 * Send a new email
 */
export async function sendNewEmail(account, options) {
    const transport = createSmtpTransport(account);
    try {
        const result = await transport.sendMail({
            from: account.email,
            to: options.to,
            cc: options.cc,
            bcc: options.bcc,
            subject: options.subject,
            text: options.body,
            html: textToHtml(options.body)
        });
        return {
            success: true,
            message_id: result.messageId || ''
        };
    }
    finally {
        transport.close();
    }
}
/**
 * Reply to an email (maintains thread via In-Reply-To and References headers)
 */
export async function replyToEmail(account, options) {
    if (!options.in_reply_to) {
        throw new EmailMCPError('in_reply_to is required for reply', 'MISSING_PARAM', 'Use email_read to get the message_id of the email you want to reply to');
    }
    const transport = createSmtpTransport(account);
    try {
        const subject = options.subject.startsWith('Re:') ? options.subject : `Re: ${options.subject}`;
        const result = await transport.sendMail({
            from: account.email,
            to: options.to,
            cc: options.cc,
            bcc: options.bcc,
            subject,
            text: options.body,
            html: textToHtml(options.body),
            inReplyTo: options.in_reply_to,
            references: options.references || options.in_reply_to
        });
        return {
            success: true,
            message_id: result.messageId || ''
        };
    }
    finally {
        transport.close();
    }
}
/**
 * Forward an email
 */
export async function forwardEmail(account, options) {
    const transport = createSmtpTransport(account);
    try {
        const subject = options.subject.startsWith('Fwd:') ? options.subject : `Fwd: ${options.subject}`;
        const body = `${options.body}\n\n---------- Forwarded message ----------\n${options.original_body}`;
        const result = await transport.sendMail({
            from: account.email,
            to: options.to,
            cc: options.cc,
            bcc: options.bcc,
            subject,
            text: body,
            html: textToHtml(body)
        });
        return {
            success: true,
            message_id: result.messageId || ''
        };
    }
    finally {
        transport.close();
    }
}
//# sourceMappingURL=smtp-client.js.map