import type { Ping, PingParser } from './types.js';
import tmobile from './tmobile.js';

export type { Ping, PingParser };

/** In the order that they are tested against an email */
export const PARSERS: PingParser[] = [
    tmobile
];

export const PARSER_NAMES = PARSERS.map((p) => p.name);

/**
 * Collapse an email body to single spaced text so that a parser doesn't
 * depend on how a mail client wrapped, quoted or indented the message
 */
export function normalize(text: string): string {
    return text
        .replace(/^[ \t]*(?:>[ \t]*)+/gm, '')
        .replace(/[\u00A0\u2007\u202F]/g, ' ')
        .replace(/[\u200B-\u200D\uFEFF]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

/** Plain text of an HTML only email */
export function htmlToText(html: string): string {
    return html
        .replace(/<(style|script)\b[\s\S]*?<\/\1>/gi, ' ')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/gi, ' ')
        .replace(/&amp;/gi, '&')
        .replace(/&lt;/gi, '<')
        .replace(/&gt;/gi, '>')
        .replace(/&#(\d+);/g, (entity, code) => String.fromCodePoint(Number(code)));
}

/**
 * Parse the body of an email into the phone locations it reports
 *
 * @returns An empty list if no parser recognises the email
 */
export function parsePings(text: string): Ping[] {
    const body = normalize(text);

    const seen = new Set<string>();
    const pings: Ping[] = [];

    for (const parser of PARSERS) {
        if (!parser.test(body)) continue;

        // A forwarded or replied to email repeats the location in its quoted text
        for (const ping of parser.parse(body)) {
            const key = [ping.phone, ping.located, ping.lat, ping.lon].join('|');
            if (seen.has(key)) continue;

            seen.add(key);
            pings.push(ping);
        }

        if (pings.length) break;
    }

    return pings;
}
