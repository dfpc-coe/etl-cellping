import test from 'node:test';
import assert from 'node:assert';
import { parseOffset, parseTime } from '../lib/time.js';

test('parseOffset: named zones', () => {
    assert.equal(parseOffset('Pacific Daylight Time'), -420);
    assert.equal(parseOffset('Pacific Standard Time'), -480);
    assert.equal(parseOffset('Mountain Daylight Time'), -360);
    assert.equal(parseOffset('Central Standard Time'), -360);
    assert.equal(parseOffset('Eastern Daylight Time'), -240);
    assert.equal(parseOffset('Alaskan Standard Time'), -540);
    assert.equal(parseOffset('Hawaii-Aleutian Standard Time'), -600);
    assert.equal(parseOffset('Coordinated Universal Time'), 0);
});

test('parseOffset: abbreviations, case & whitespace', () => {
    assert.equal(parseOffset('PDT'), -420);
    assert.equal(parseOffset('mst'), -420);
    assert.equal(parseOffset('  pacific   daylight time '), -420);
});

test('parseOffset: numeric offsets', () => {
    assert.equal(parseOffset('UTC-07:00'), -420);
    assert.equal(parseOffset('GMT+5:30'), 330);
    assert.equal(parseOffset('-0700'), -420);
    assert.equal(parseOffset('UTC-7'), -420);
});

test('parseOffset: unknown zones', () => {
    assert.equal(parseOffset(''), null);
    assert.equal(parseOffset('Pacific Time'), null);
    assert.equal(parseOffset('UTC-25'), null);
});

test('parseTime: 12 hour times', () => {
    assert.equal(parseTime('8/15/2026', '2:33:07', 'AM', 'Pacific Daylight Time'), '2026-08-15T09:33:07.000Z');
    assert.equal(parseTime('8/15/2026', '2:33:07', 'PM', 'Pacific Daylight Time'), '2026-08-15T21:33:07.000Z');
    assert.equal(parseTime('8/15/2026', '12:00:00', 'AM', 'UTC'), '2026-08-15T00:00:00.000Z');
    assert.equal(parseTime('8/15/2026', '12:00:00', 'PM', 'UTC'), '2026-08-15T12:00:00.000Z');
    assert.equal(parseTime('8/15/2026', '2:33', 'pm', 'UTC'), '2026-08-15T14:33:00.000Z');
});

test('parseTime: 24 hour times', () => {
    assert.equal(parseTime('12/31/2026', '23:30:00', '', 'Pacific Standard Time'), '2027-01-01T07:30:00.000Z');
});

test('parseTime: invalid values', () => {
    assert.equal(parseTime('8/15/2026', '2:33:07', 'AM', 'Somewhere Time'), null);
    assert.equal(parseTime('2/30/2026', '2:33:07', 'AM', 'UTC'), null);
    assert.equal(parseTime('13/1/2026', '2:33:07', 'AM', 'UTC'), null);
    assert.equal(parseTime('8/15/2026', '13:00:00', 'PM', 'UTC'), null);
    assert.equal(parseTime('8/15/2026', '24:00:00', '', 'UTC'), null);
    assert.equal(parseTime('8/15/2026', '2:61:00', 'AM', 'UTC'), null);
});
