import type { Ping, PingParser } from './types.js';
import { parseTime } from '../time.js';

// Location of 7207575443 at 8/15/2026 2:33:07 AM Pacific Daylight Time
// === Result ===
// Lat, Long: 38.065071,-102.847889
// Uncertainty: 735m
// https://maps.google.com/maps?q=38.095071,-102.537889
const LOCATION = [
    /Location of (\+?[\d(][\d ().-]{5,18}\d) at /,
    /(\d{1,2}\/\d{1,2}\/\d{4}) (\d{1,2}:\d{2}(?::\d{2})?) ?([AP]M)? ?([^=]*?) ?/,
    /=+ ?Result ?=+ ?/,
    /Lat, ?Long: ?(-?\d+(?:\.\d+)?) ?, ?(-?\d+(?:\.\d+)?)/,
    /(?: ?Uncertainty: ?(\d+(?:\.\d+)?) ?(km|m|ft)?\b)?/,
    /(?: ?<?(https?:\/\/[^\s<>]+))?/
].map((part) => part.source).join('');

const METERS: Record<string, number> = {
    m: 1,
    km: 1000,
    ft: 0.3048
};

const tmobile: PingParser = {
    name: 'tmobile',
    carrier: 'T-Mobile',

    test(text: string): boolean {
        return new RegExp(LOCATION, 'i').test(text);
    },

    parse(text: string): Ping[] {
        const pings: Ping[] = [];

        for (const match of text.matchAll(new RegExp(LOCATION, 'gi'))) {
            const [, phone, date, time, meridiem, zone, lat, lon, uncertainty, unit, url] = match;

            const ping: Ping = {
                parser: tmobile.name,
                carrier: tmobile.carrier,
                phone: phone.replace(/\D/g, ''),
                located: [date, time, meridiem, zone].filter(Boolean).join(' '),
                lat: Number(lat),
                lon: Number(lon)
            };

            if (Math.abs(ping.lat) > 90 || Math.abs(ping.lon) > 180) continue;

            const iso = parseTime(date, time, meridiem || '', zone);
            if (iso) ping.time = iso;

            if (uncertainty !== undefined) {
                ping.uncertainty = Math.round(Number(uncertainty) * METERS[(unit || 'm').toLowerCase()]);
            }

            if (url) ping.url = url;

            pings.push(ping);
        }

        return pings;
    }
};

export default tmobile;
