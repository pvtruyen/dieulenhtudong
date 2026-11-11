import test from 'node:test';
import assert from 'node:assert/strict';
import {
  shouldTriggerSchedule,
  buildTriggerKey,
  filterSchedules,
  getNextSchedule,
  formatMinutesRemaining,
} from './scheduleEngine';
import { ScheduleItem } from '../types/schedule';

const sampleSchedules: ScheduleItem[] = [
  {
    id: '1',
    name: 'Báo thức',
    time: '05:00',
    days: [1, 2, 3, 4, 5],
    mode: 'summer',
    audioType: 'preset',
    audioPreset: 'bao_thuc',
    enabled: true,
  },
  {
    id: '2',
    name: 'Báo thức Mùa Đông',
    time: '05:30',
    days: [1, 2, 3, 4, 5],
    mode: 'winter',
    audioType: 'preset',
    audioPreset: 'bao_thuc',
    enabled: true,
  },
  {
    id: '3',
    name: 'Báo ăn trưa',
    time: '11:30',
    days: [0, 1, 2, 3, 4, 5, 6],
    mode: 'all',
    audioType: 'preset',
    audioPreset: 'bao_an',
    enabled: false,
  },
];

test('shouldTriggerSchedule matches exact time, day, and mode', () => {
  // Monday 05:00
  const monday5am = new Date(2026, 10, 9, 5, 0, 10);
  assert.equal(shouldTriggerSchedule(sampleSchedules[0], monday5am, 'summer', null), true);
  assert.equal(shouldTriggerSchedule(sampleSchedules[0], monday5am, 'winter', null), false);

  // Prevent duplicate trigger in same minute
  const key = buildTriggerKey('1', monday5am);
  assert.equal(shouldTriggerSchedule(sampleSchedules[0], monday5am, 'summer', key), false);

  // Disabled item never triggers
  const monday1130 = new Date(2026, 10, 9, 11, 30, 0);
  assert.equal(shouldTriggerSchedule(sampleSchedules[2], monday1130, 'all', null), false);
});

test('filterSchedules filters by mode and search query and sorts by time', () => {
  const summerList = filterSchedules(sampleSchedules, 'summer', '');
  assert.equal(summerList.length, 2); // 'summer' + 'all'
  assert.equal(summerList[0].id, '1');
  assert.equal(summerList[1].id, '3');

  const searchList = filterSchedules(sampleSchedules, 'all', 'Mùa Đông');
  assert.equal(searchList.length, 1);
  assert.equal(searchList[0].id, '2');
});

test('getNextSchedule returns nearest upcoming enabled schedule', () => {
  // Monday 04:45
  const monday445 = new Date(2026, 10, 9, 4, 45, 0);
  const next = getNextSchedule(sampleSchedules, monday445, 'summer');
  assert.ok(next);
  assert.equal(next.item.id, '1');
  assert.equal(next.minutesRemaining, 15);
  assert.equal(formatMinutesRemaining(next.minutesRemaining), 'Còn 15 phút');
});
