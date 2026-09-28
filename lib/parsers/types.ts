export interface Ping {
    /** Name of the parser that produced the ping */
    parser: string;
    carrier: string;
    /** Digits only */
    phone: string;
    /** ISO 8601 time of the location - absent if the carrier's time zone wasn't recognised */
    time?: string;
    /** Time of the location as written by the carrier */
    located: string;
    lat: number;
    lon: number;
    /** Radius in meters */
    uncertainty?: number;
    url?: string;
}

export interface PingParser {
    name: string;
    carrier: string;
    test(text: string): boolean;
    parse(text: string): Ping[];
}
