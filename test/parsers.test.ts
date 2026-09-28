import test from 'node:test';
import assert from 'node:assert';
import { PARSERS, PARSER_NAMES, normalize, htmlToText, parsePings } from '../lib/parsers/index.js';
import tmobile from '../lib/parsers/tmobile.js';

const TMOBILE = 'Location of 7207575443 at 8/15/2026 2:33:07 AM Pacific Daylight Time === Result === Lat, Long: 38.065071,-102.847889 Uncertainty: 735m https://maps.google.com/maps?q=38.095071,-102.537889 ';

const TMOBILE_PING = {
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

test('Parser Names', () => {
    assert.deepEqual(PARSER_NAMES, ['tmobile']);
});

test('Parsers: every parser is covered by a sample', () => {
    const samples: Record<string, string> = {
        tmobile: TMOBILE
    };

    for (const parser of PARSERS) {
        assert.ok(samples[parser.name], `${parser.name} has no sample`);
        assert.equal(parser.test(normalize(samples[parser.name])), true, parser.name);

        const pings = parser.parse(normalize(samples[parser.name]));
        assert.equal(pings.length, 1, parser.name);
        assert.equal(pings[0].parser, parser.name);
        assert.equal(pings[0].carrier, parser.carrier);
    }
});

test('normalize: whitespace, quoting & invisible characters', () => {
    assert.equal(normalize('  a\r\n\r\n b\t c  '), 'a b c');
    assert.equal(normalize('> a\n> > b\n>c'), 'a b c');
    assert.equal(normalize('a\u00A0b\u200Bc'), 'a bc');
    assert.equal(normalize('Lat > Long'), 'Lat > Long');
});

test('htmlToText: tags, styles & entities', () => {
    assert.equal(
        normalize(htmlToText('<html><style>p { color: red }</style><p>Lat,&nbsp;Long:<br/>1 &amp; 2 &lt;3&gt; &#176;</p></html>')),
        'Lat, Long: 1 & 2 <3> °'
    );
});

test('tmobile: single line', () => {
    assert.equal(tmobile.test(TMOBILE), true);
    assert.deepEqual(tmobile.parse(TMOBILE), [TMOBILE_PING]);
});

test('tmobile: test is repeatable', () => {
    assert.equal(tmobile.test(TMOBILE), true);
    assert.equal(tmobile.test(TMOBILE), true);
    assert.equal(tmobile.test('nothing to see'), false);
    assert.equal(tmobile.test(TMOBILE), true);
});

test('tmobile: multiple lines', () => {
    assert.deepEqual(parsePings([
        'Location of 7207575443 at 8/15/2026 2:33:07 AM Pacific Daylight Time',
        '',
        '=== Result ===',
        'Lat, Long: 38.065071,-102.847889',
        'Uncertainty: 735m',
        'https://maps.google.com/maps?q=38.095071,-102.537889',
        ''
    ].join('\r\n')), [TMOBILE_PING]);
});

test('tmobile: surrounded by other text', () => {
    assert.deepEqual(parsePings(`Please see the requested location.\n\n${TMOBILE}\n\nThis email is confidential.`), [TMOBILE_PING]);
});

test('tmobile: forwarded & quoted', () => {
    assert.deepEqual(parsePings([
        'FYI',
        '',
        '---------- Forwarded message ---------',
        '> Location of 7207575443 at 8/15/2026 2:33:07 AM Pacific Daylight Time',
        '> === Result ===',
        '> Lat, Long: 38.065071,-102.847889',
        '> Uncertainty: 735m',
        '> <https://maps.google.com/maps?q=38.095071,-102.537889>'
    ].join('\n')), [TMOBILE_PING]);
});

test('tmobile: html only', () => {
    assert.deepEqual(parsePings(htmlToText([
        '<div>Location of 7207575443 at 8/15/2026 2:33:07 AM Pacific Daylight Time</div>',
        '<div>=== Result ===</div>',
        '<div>Lat,&nbsp;Long: 38.065071,-102.847889</div>',
        '<div>Uncertainty: 735m</div>',
        '<div><a href="https://maps.google.com/maps?q=38.095071,-102.537889">https://maps.google.com/maps?q=38.095071,-102.537889</a></div>'
    ].join('\n'))), [TMOBILE_PING]);
});

test('tmobile: formatted phone numbers', () => {
    for (const phone of ['(720) 757-5443', '720-757-5443', '720.757.5443', '+1 720 757 5443']) {
        const pings = parsePings(TMOBILE.replace('7207575443', phone));

        assert.equal(pings.length, 1, phone);
        assert.equal(pings[0].phone, phone.replace(/\D/g, ''));
    }
});

test('tmobile: southern & eastern hemispheres', () => {
    const pings = parsePings(TMOBILE.replace('38.065071,-102.847889', '-33.8688, 151.2093'));

    assert.equal(pings[0].lat, -33.8688);
    assert.equal(pings[0].lon, 151.2093);
});

test('tmobile: uncertainty & url are optional', () => {
    const ping = parsePings('Location of 7207575443 at 8/15/2026 2:33:07 AM Pacific Daylight Time === Result === Lat, Long: 38.065071,-102.847889')[0];

    assert.equal(ping.uncertainty, undefined);
    assert.equal(ping.url, undefined);
    assert.equal(ping.lat, 38.065071);
    assert.equal(ping.time, '2026-08-15T09:33:07.000Z');
});

test('tmobile: uncertainty units', () => {
    assert.equal(parsePings(TMOBILE.replace('735m', '735 m'))[0].uncertainty, 735);
    assert.equal(parsePings(TMOBILE.replace('735m', '735'))[0].uncertainty, 735);
    assert.equal(parsePings(TMOBILE.replace('735m', '735 meters'))[0].uncertainty, 735);
    assert.equal(parsePings(TMOBILE.replace('735m', '1.5km'))[0].uncertainty, 1500);
    assert.equal(parsePings(TMOBILE.replace('735m', '1000ft'))[0].uncertainty, 305);
});

test('tmobile: other time zones', () => {
    assert.equal(parsePings(TMOBILE.replace('Pacific Daylight Time', 'Mountain Standard Time'))[0].time, '2026-08-15T09:33:07.000Z');
    assert.equal(parsePings(TMOBILE.replace('Pacific Daylight Time', 'Eastern Daylight Time'))[0].time, '2026-08-15T06:33:07.000Z');
    assert.equal(parsePings(TMOBILE.replace('2:33:07 AM', '2:33:07 PM'))[0].time, '2026-08-15T21:33:07.000Z');
});

test('tmobile: unknown time zone has no time', () => {
    const ping = parsePings(TMOBILE.replace('Pacific Daylight Time', 'Somewhere Time'))[0];

    assert.equal(ping.time, undefined);
    assert.equal(ping.located, '8/15/2026 2:33:07 AM Somewhere Time');
    assert.equal(ping.lat, 38.065071);
});

test('tmobile: multiple locations in an email', () => {
    const pings = parsePings([
        TMOBILE,
        TMOBILE.replace('2:33:07 AM', '2:48:07 AM').replace('38.065071,-102.847889', '38.070000,-102.850000'),
        TMOBILE
    ].join('\n\n'));

    assert.deepEqual(pings.map((p) => [p.time, p.lat, p.lon]), [
        ['2026-08-15T09:33:07.000Z', 38.065071, -102.847889],
        ['2026-08-15T09:48:07.000Z', 38.07, -102.85]
    ]);
});

test('tmobile: coordinates outside of the world are dropped', () => {
    assert.deepEqual(parsePings(TMOBILE.replace('38.065071,-102.847889', '98.065071,-102.847889')), []);
    assert.deepEqual(parsePings(TMOBILE.replace('38.065071,-102.847889', '38.065071,-202.847889')), []);
});

test('tmobile: incomplete or unrelated emails', () => {
    assert.deepEqual(parsePings(''), []);
    assert.deepEqual(parsePings('Your request has been received'), []);
    assert.deepEqual(parsePings('Location of 7207575443 at 8/15/2026 2:33:07 AM Pacific Daylight Time === Result === Unable to locate'), []);
    assert.deepEqual(parsePings('=== Result === Lat, Long: 38.065071,-102.847889 Uncertainty: 735m'), []);
});
