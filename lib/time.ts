// Minutes from UTC
const ZONES: Record<string, number> = {
    'utc': 0,
    'gmt': 0,
    'z': 0,
    'coordinated universal time': 0,
    'greenwich mean time': 0,
    'atlantic standard time': -240,
    'ast': -240,
    'atlantic daylight time': -180,
    'adt': -180,
    'eastern standard time': -300,
    'est': -300,
    'eastern daylight time': -240,
    'edt': -240,
    'central standard time': -360,
    'cst': -360,
    'central daylight time': -300,
    'cdt': -300,
    'mountain standard time': -420,
    'mst': -420,
    'mountain daylight time': -360,
    'mdt': -360,
    'pacific standard time': -480,
    'pst': -480,
    'pacific daylight time': -420,
    'pdt': -420,
    'alaska standard time': -540,
    'alaskan standard time': -540,
    'akst': -540,
    'alaska daylight time': -480,
    'alaskan daylight time': -480,
    'akdt': -480,
    'hawaii standard time': -600,
    'hawaiian standard time': -600,
    'hawaii-aleutian standard time': -600,
    'hst': -600
};

/**
 * Minutes from UTC of a named zone or a `UTC-07:00` style offset
 *
 * @returns null if the zone isn't known
 */
export function parseOffset(zone: string): number | null {
    const name = zone.trim().replace(/\s+/g, ' ').toLowerCase();

    if (name in ZONES) return ZONES[name];

    const offset = name.match(/^(?:utc|gmt)? ?([+-])(\d{1,2})(?::?(\d{2}))?$/);
    if (!offset) return null;

    const hours = Number(offset[2]);
    const minutes = Number(offset[3] || 0);
    if (hours > 14 || minutes > 59) return null;

    return (offset[1] === '-' ? -1 : 1) * (hours * 60 + minutes);
}

/**
 * ISO 8601 time of a US formatted date & time in a named zone
 *
 * @param date      `M/D/YYYY`
 * @param time      `H:MM` or `H:MM:SS`
 * @param meridiem  `AM`, `PM` or empty for a 24 hour time
 * @param zone      Named zone or offset
 *
 * @returns null if the zone isn't known or the date isn't valid
 */
export function parseTime(date: string, time: string, meridiem: string, zone: string): string | null {
    const offset = parseOffset(zone);
    if (offset === null) return null;

    const [month, day, year] = date.split('/').map(Number);
    const [hour, minute, second = 0] = time.split(':').map(Number);

    let hours = hour;
    if (meridiem) {
        if (hour < 1 || hour > 12) return null;
        hours = hour % 12 + (meridiem.toUpperCase() === 'PM' ? 12 : 0);
    }

    if (hours > 23 || minute > 59 || second > 59) return null;

    const local = new Date(Date.UTC(year, month - 1, day, hours, minute, second));

    if (
        local.getUTCFullYear() !== year
        || local.getUTCMonth() !== month - 1
        || local.getUTCDate() !== day
    ) return null;

    return new Date(local.getTime() - offset * 60 * 1000).toISOString();
}
