import test from 'node:test';
import assert from 'node:assert';
import { CoTParser } from '@tak-ps/node-cot';
import { pingFeatures } from '../lib/features.js';
import type { Ping } from '../lib/parsers/index.js';

const PING: Ping = {
    parser: 'tmobile',
    carrier: 'T-Mobile',
    phone: '7207575443',
    time: '2026-08-15T09:33:07.000Z',
    located: '8/15/2026 2:33:07 AM Pacific Daylight Time',
    lat: 38.065071,
    lon: -102.847889,
    uncertainty: 735,
    url: 'https://maps.google.com/maps?q=38.095071,-102.537889'
};

const FALLBACK = new Date('2026-08-15T09:34:02.000Z');

// Meters between two positions
function distance(a: number[], b: number[]): number {
    const rad = Math.PI / 180;
    const dLat = (b[1] - a[1]) * rad;
    const dLon = (b[0] - a[0]) * rad;

    const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * rad) * Math.cos(b[1] * rad) * Math.sin(dLon / 2) ** 2;

    return 2 * 6371008.8 * Math.asin(Math.sqrt(h));
}

test('pingFeatures: point & uncertainty', () => {
    const features = pingFeatures(PING, {
        fallback: FALLBACK,
        uncertainty: true,
        metadata: { email_id: 'message-id' }
    });

    assert.equal(features.length, 2);

    const metadata = {
        email_id: 'message-id',
        parser: 'tmobile',
        carrier: 'T-Mobile',
        phone: '7207575443',
        time: '2026-08-15T09:33:07.000Z',
        located: '8/15/2026 2:33:07 AM Pacific Daylight Time',
        lat: 38.065071,
        lon: -102.847889,
        uncertainty: 735,
        url: 'https://maps.google.com/maps?q=38.095071,-102.537889'
    };

    const remarks = [
        'Carrier: T-Mobile',
        'Phone: 7207575443',
        'Located: 8/15/2026 2:33:07 AM Pacific Daylight Time',
        'Uncertainty: 735m',
        'https://maps.google.com/maps?q=38.095071,-102.537889'
    ].join('\n');

    assert.deepEqual(features[0], {
        id: 'cellping-7207575443-1786786387',
        type: 'Feature',
        properties: {
            type: 'a-u-G',
            how: 'm-g',
            callsign: '7207575443 09:33Z',
            time: '2026-08-15T09:33:07.000Z',
            start: '2026-08-15T09:33:07.000Z',
            remarks,
            metadata
        },
        geometry: {
            type: 'Point',
            coordinates: [-102.847889, 38.065071]
        }
    });

    const circle = features[1];
    assert.equal(circle.id, 'cellping-7207575443-1786786387-uncertainty');
    assert.equal(circle.properties.type, 'u-d-c-c');
    assert.equal(circle.properties.callsign, '7207575443 09:33Z Uncertainty');
    assert.deepEqual(circle.properties.center, [-102.847889, 38.065071]);
    assert.deepEqual(circle.properties.shape, { ellipse: { major: 735, minor: 735, angle: 360 } });
    assert.deepEqual(circle.properties.metadata, metadata);

    assert.ok(circle.geometry.type === 'Polygon');
    const ring = circle.geometry.coordinates[0];
    assert.equal(ring.length, 65);
    assert.deepEqual(ring[0], ring[ring.length - 1]);

    for (const position of ring) {
        const meters = distance([PING.lon, PING.lat], position);
        assert.ok(Math.abs(meters - 735) < 1, `${position} is ${meters}m from the location`);
    }
});

test('pingFeatures: uncertainty disabled or not reported', () => {
    assert.equal(pingFeatures(PING, { fallback: FALLBACK, uncertainty: false }).length, 1);

    const features = pingFeatures({ ...PING, uncertainty: undefined, url: undefined }, { fallback: FALLBACK, uncertainty: true });

    assert.equal(features.length, 1);
    assert.equal(features[0].properties.remarks, [
        'Carrier: T-Mobile',
        'Phone: 7207575443',
        'Located: 8/15/2026 2:33:07 AM Pacific Daylight Time'
    ].join('\n'));
    assert.equal('uncertainty' in (features[0].properties.metadata || {}), false);
    assert.equal('url' in (features[0].properties.metadata || {}), false);
});

test('pingFeatures: fallback time', () => {
    const features = pingFeatures({ ...PING, time: undefined }, { fallback: FALLBACK, uncertainty: false });

    assert.equal(features[0].id, 'cellping-7207575443-1786786442');
    assert.equal(features[0].properties.time, '2026-08-15T09:34:02.000Z');
    assert.equal(features[0].properties.start, '2026-08-15T09:34:02.000Z');
    assert.equal(features[0].properties.callsign, '7207575443 09:34Z');
    assert.equal(features[0].properties.metadata?.time, '2026-08-15T09:34:02.000Z');
});

test('pingFeatures: each location of a phone has its own id', () => {
    const first = pingFeatures(PING, { fallback: FALLBACK, uncertainty: true });
    const again = pingFeatures(PING, { fallback: FALLBACK, uncertainty: true });
    const later = pingFeatures({ ...PING, time: '2026-08-15T09:48:07.000Z' }, { fallback: FALLBACK, uncertainty: true });

    assert.deepEqual(first.map((f) => f.id), again.map((f) => f.id));
    assert.notDeepEqual(first.map((f) => f.id), later.map((f) => f.id));
});

test('pingFeatures: converts to Cursor on Target', async () => {
    const [point, circle] = pingFeatures(PING, { fallback: FALLBACK, uncertainty: true });

    const cot = await CoTParser.from_geojson(point);

    assert.equal(cot.raw.event._attributes.uid, 'cellping-7207575443-1786786387');
    assert.equal(cot.raw.event._attributes.type, 'a-u-G');
    assert.equal(cot.raw.event._attributes.time, '2026-08-15T09:33:07.000Z');
    assert.equal(cot.raw.event._attributes.start, '2026-08-15T09:33:07.000Z');
    assert.equal(Number(cot.raw.event.point._attributes.lat), 38.065071);
    assert.equal(Number(cot.raw.event.point._attributes.lon), -102.847889);
    assert.equal(cot.raw.event.detail?.contact?._attributes.callsign, '7207575443 09:33Z');
    assert.match(String(cot.raw.event.detail?.remarks?._text), /Uncertainty: 735m/);

    const xml = CoTParser.to_xml(cot);
    assert.match(xml, /^<event /);
    assert.match(xml, /uid="cellping-7207575443-1786786387"/);

    const shape = await CoTParser.from_geojson(circle);

    assert.equal(shape.raw.event._attributes.uid, 'cellping-7207575443-1786786387-uncertainty');
    assert.equal(shape.raw.event._attributes.type, 'u-d-c-c');
    assert.equal(Number(shape.raw.event.point._attributes.lat), 38.065071);
    assert.equal(Number(shape.raw.event.point._attributes.lon), -102.847889);
    assert.deepEqual(shape.raw.event.detail?.shape?.ellipse?._attributes, { major: 735, minor: 735, angle: 360 });
});
