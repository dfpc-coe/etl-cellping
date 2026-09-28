import test, { mock } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import type { Static } from '@sinclair/typebox';
import { Email, StaticCapabilities } from '@tak-ps/etl';
import type { Feature } from '@tak-ps/etl';

process.env.ETL_API = process.env.ETL_API || 'http://localhost:5001';
process.env.ETL_LAYER = process.env.ETL_LAYER || '1';
process.env.ETL_TOKEN = process.env.ETL_TOKEN || 'etl.test-token';

const { default: Task, handler } = await import('../task.js');

type FeatureCollection = Static<typeof Feature.InputFeatureCollection>;

const TMOBILE = fs.readFileSync(new URL('./fixtures/tmobile.eml', import.meta.url));

function eml(body: string, headers: string[] = []): string {
    return [
        'From: Carrier Locations <locations@carrier.example.com>',
        'To: Layer <aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa@mail.map.example.com>',
        'Subject: Location',
        'Date: Sat, 15 Aug 2026 09:34:02 +0000',
        'MIME-Version: 1.0',
        ...headers,
        '',
        body,
        ''
    ].join('\r\n');
}

function stub(task: InstanceType<typeof Task>, environment: Record<string, unknown> = {}) {
    const layer = {
        id: 1,
        connection: 1,
        task: 'etl-cellping-v1.0.0',
        incoming: {
            environment,
            ephemeral: {}
        }
    };

    // @ts-expect-error partial layer for testing
    task.fetchLayer = async () => layer;
    // @ts-expect-error private in base
    task.layer = layer;

    const submitted: FeatureCollection[] = [];
    task.submit = async (fc: FeatureCollection) => {
        submitted.push(structuredClone(fc));
        return true;
    };

    return submitted;
}

async function run(raw: Buffer | string, environment: Record<string, unknown> = {}) {
    const task = await Task.init();
    const submitted = stub(task, environment);

    await task.email(await Email.parse(raw, 'message-id'));

    return submitted;
}

test('email: T-Mobile location', async () => {
    const submitted = await run(TMOBILE);

    assert.equal(submitted.length, 1);
    assert.equal(submitted[0].type, 'FeatureCollection');
    assert.deepEqual(submitted[0].features.map((f) => f.id), [
        'cellping-7207575443-1786786387',
        'cellping-7207575443-1786786387-uncertainty'
    ]);

    const point = submitted[0].features[0];

    assert.deepEqual(point.geometry, { type: 'Point', coordinates: [-102.847889, 38.065071] });
    assert.equal(point.properties.type, 'a-u-G');
    assert.equal(point.properties.callsign, '7207575443 09:33Z');
    assert.equal(point.properties.time, '2026-08-15T09:33:07.000Z');
    assert.equal(point.properties.start, '2026-08-15T09:33:07.000Z');
    assert.deepEqual(point.properties.metadata, {
        email_id: 'message-id',
        email_subject: 'Location of 7207575443',
        email_from: 'locations@carrier.example.com',
        email_date: '2026-08-15T09:34:02.000Z',
        parser: 'tmobile',
        carrier: 'T-Mobile',
        phone: '7207575443',
        time: '2026-08-15T09:33:07.000Z',
        located: '8/15/2026 2:33:07 AM Pacific Daylight Time',
        lat: 38.065071,
        lon: -102.847889,
        uncertainty: 735,
        url: 'https://maps.google.com/maps?q=38.095071,-102.537889'
    });

    assert.equal(submitted[0].features[1].properties.type, 'u-d-c-c');
    assert.equal(submitted[0].features[1].geometry?.type, 'Polygon');
});

test('email: Uncertainty disabled', async () => {
    const submitted = await run(TMOBILE, { Uncertainty: false });

    assert.equal(submitted.length, 1);
    assert.deepEqual(submitted[0].features.map((f) => f.id), ['cellping-7207575443-1786786387']);
});

test('email: html only message', async () => {
    const submitted = await run(eml([
        '<html><body>',
        '<p>Location of 7207575443 at 8/15/2026 2:33:07 AM Pacific Daylight Time</p>',
        '<p>=== Result ===</p>',
        '<p>Lat,&nbsp;Long: 38.065071,-102.847889<br>Uncertainty: 735m</p>',
        '</body></html>'
    ].join('\r\n'), ['Content-Type: text/html; charset=utf-8']));

    assert.equal(submitted.length, 1);
    assert.deepEqual(submitted[0].features.map((f) => f.id), [
        'cellping-7207575443-1786786387',
        'cellping-7207575443-1786786387-uncertainty'
    ]);
});

test('email: quoted-printable message', async () => {
    const submitted = await run(eml([
        'Location of 7207575443 at 8/15/2026 2:33:07 AM Pacific Daylight Time =3D=3D=3D=',
        ' Result =3D=3D=3D Lat, Long: 38.065071,-102.847889 Uncertainty: 735m https:/=',
        '/maps.google.com/maps?q=3D38.095071,-102.537889'
    ].join('\r\n'), [
        'Content-Type: text/plain; charset=utf-8',
        'Content-Transfer-Encoding: quoted-printable'
    ]));

    assert.equal(submitted.length, 1);
    assert.equal(submitted[0].features[0].id, 'cellping-7207575443-1786786387');
    assert.equal(submitted[0].features[0].properties.metadata?.url, 'https://maps.google.com/maps?q=38.095071,-102.537889');
});

test('email: unknown time zone uses the date of the email', async () => {
    const submitted = await run(eml('Location of 7207575443 at 8/15/2026 2:33:07 AM Somewhere Time === Result === Lat, Long: 38.065071,-102.847889'));

    assert.equal(submitted.length, 1);
    assert.equal(submitted[0].features.length, 1);
    assert.equal(submitted[0].features[0].id, 'cellping-7207575443-1786786442');
    assert.equal(submitted[0].features[0].properties.time, '2026-08-15T09:34:02.000Z');
    assert.equal(submitted[0].features[0].properties.metadata?.located, '8/15/2026 2:33:07 AM Somewhere Time');
});

test('email: unrelated message is not submitted', async () => {
    const submitted = await run(eml('Your request has been received'));

    assert.equal(submitted.length, 0);
});

test('handler: email event is parsed & submitted', async () => {
    const events: unknown[] = [];

    mock.method(Email, 'fetch', async (event: unknown) => {
        events.push(event);
        return await Email.parse(TMOBILE, 'message-id');
    });

    try {
        const task = await Task.init();
        const submitted = stub(task);

        const { handler: internal } = await import('@tak-ps/etl');

        await internal(task, {
            type: 'email',
            bucket: 'tak-cloudtak-mail-prod',
            key: 'message-id'
        });

        assert.deepEqual(events, [{ type: 'email', bucket: 'tak-cloudtak-mail-prod', key: 'message-id' }]);
        assert.equal(submitted.length, 1);
        assert.equal(submitted[0].features[0].id, 'cellping-7207575443-1786786387');
    } finally {
        mock.restoreAll();
    }
});

test('handler: exported for Lambda', () => {
    assert.equal(typeof handler, 'function');
});

test('handler: scheduled invocations are rejected', async () => {
    const task = await Task.init();
    stub(task);

    const { handler: internal } = await import('@tak-ps/etl');

    await assert.rejects(internal(task, {}), /Schedule Invocation type is not configured/);
});

test('capabilities: email is the only invocation', async () => {
    const task = await Task.init();

    const capabilities = await task.capabilities();

    assert.deepEqual(capabilities.incoming?.invocation, ['email']);
    assert.deepEqual(capabilities.incoming?.invocationDefaults, { email: { enabled: true } });

    const doc = StaticCapabilities.validate(JSON.parse(String(fs.readFileSync(new URL('../capabilities.json', import.meta.url)))));

    assert.deepEqual(Object.keys(doc.invocations.incoming || {}), ['email']);
    assert.equal(doc.invocations.incoming?.email?.default.enabled, true);
});
