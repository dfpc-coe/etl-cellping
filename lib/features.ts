import type { Static } from '@sinclair/typebox';
import type { Feature } from '@tak-ps/etl';
import type { Ping } from './parsers/index.js';

type InputFeature = Static<typeof Feature.InputFeature>;

const EARTH_RADIUS = 6371008.8;
const CIRCLE_STEPS = 64;

export interface FeatureOptions {
    /** Used when the time of the location couldn't be resolved */
    fallback: Date;
    /** Draw the uncertainty of the location as a circle */
    uncertainty: boolean;
    /** Added to the metadata of each feature */
    metadata?: Record<string, unknown>;
}

function circle(lon: number, lat: number, radius: number): number[][] {
    const ring: number[][] = [];

    const lat1 = lat * Math.PI / 180;
    const lon1 = lon * Math.PI / 180;
    const dist = radius / EARTH_RADIUS;

    for (let i = 0; i < CIRCLE_STEPS; i++) {
        const bearing = 2 * Math.PI * i / CIRCLE_STEPS;

        const lat2 = Math.asin(Math.sin(lat1) * Math.cos(dist) + Math.cos(lat1) * Math.sin(dist) * Math.cos(bearing));
        const lon2 = lon1 + Math.atan2(
            Math.sin(bearing) * Math.sin(dist) * Math.cos(lat1),
            Math.cos(dist) - Math.sin(lat1) * Math.sin(lat2)
        );

        ring.push([
            Number((((lon2 * 180 / Math.PI) + 540) % 360 - 180).toFixed(6)),
            Number((lat2 * 180 / Math.PI).toFixed(6))
        ]);
    }

    ring.push(ring[0]);

    return ring;
}

/**
 * Features of a phone location - a point and, if the carrier reported one, its uncertainty
 *
 * Ids are derived from the phone & time of the location so that an email
 * delivered more than once updates the features it already created
 */
export function pingFeatures(ping: Ping, opts: FeatureOptions): InputFeature[] {
    const time = ping.time ? new Date(ping.time) : opts.fallback;
    const iso = time.toISOString();

    const id = `cellping-${ping.phone}-${Math.floor(time.getTime() / 1000)}`;
    const callsign = `${ping.phone} ${iso.slice(11, 16)}Z`;

    const metadata: Record<string, unknown> = {
        ...opts.metadata,
        parser: ping.parser,
        carrier: ping.carrier,
        phone: ping.phone,
        time: iso,
        located: ping.located,
        lat: ping.lat,
        lon: ping.lon
    };

    if (ping.uncertainty !== undefined) metadata.uncertainty = ping.uncertainty;
    if (ping.url) metadata.url = ping.url;

    const remarks = [
        `Carrier: ${ping.carrier}`,
        `Phone: ${ping.phone}`,
        `Located: ${ping.located}`
    ];

    if (ping.uncertainty !== undefined) remarks.push(`Uncertainty: ${ping.uncertainty}m`);
    if (ping.url) remarks.push(ping.url);

    const features: InputFeature[] = [{
        id,
        type: 'Feature',
        properties: {
            type: 'a-u-G',
            how: 'm-g',
            callsign,
            time: iso,
            start: iso,
            remarks: remarks.join('\n'),
            metadata
        },
        geometry: {
            type: 'Point',
            coordinates: [ping.lon, ping.lat]
        }
    }];

    if (opts.uncertainty && ping.uncertainty) {
        features.push({
            id: `${id}-uncertainty`,
            type: 'Feature',
            properties: {
                type: 'u-d-c-c',
                how: 'm-g',
                callsign: `${callsign} Uncertainty`,
                time: iso,
                start: iso,
                center: [ping.lon, ping.lat],
                shape: {
                    ellipse: {
                        major: ping.uncertainty,
                        minor: ping.uncertainty,
                        angle: 360
                    }
                },
                'fill-opacity': 0.1,
                remarks: remarks.join('\n'),
                metadata
            },
            geometry: {
                type: 'Polygon',
                coordinates: [circle(ping.lon, ping.lat, ping.uncertainty)]
            }
        });
    }

    return features;
}
