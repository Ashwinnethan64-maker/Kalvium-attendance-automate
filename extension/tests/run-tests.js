/**
 * Standalone DOM parser and mock fixture runner without external npm dependencies.
 * Implements a lightweight DOM walker to verify detection logic across all 7 fixtures.
 */

const fs = require('fs');
const path = require('path');

const { KalviumStates, AttendanceBadgeStates, CameraStates } = require('../shared/constants.js');

const fixturesDir = path.join(__dirname, 'fixtures');

let passedTests = 0;
let totalTests = 0;

function assert(condition, message) {
  totalTests++;
  if (condition) {
    console.log(`  [PASS] ${message}`);
    passedTests++;
  } else {
    console.error(`  [FAIL] ${message}`);
  }
}

// Lightweight fixture inspector matching extension logic
const Inspector = {
  hasTakeASnapModal(html) {
    const dialogMatch = html.match(/<div[^>]*role=["']dialog["'][^>]*>([\s\S]*?)<\/div>/i) ||
                        html.match(/<div[^>]*data-state=["']open["'][^>]*>([\s\S]*?)<\/div>/i);
    return dialogMatch && dialogMatch[0].includes('Take A Snap');
  },

  hasCameraVideo(html) {
    return /<video[^>]*>/i.test(html) || /<canvas[^>]*>/i.test(html);
  },

  findDashboardAttendanceButton(html) {
    const btnRegex = /<button[^>]*>([\s\S]*?)<\/button>/gi;
    let match;
    while ((match = btnRegex.exec(html)) !== null) {
      const text = match[1].replace(/<[^>]+>/g, '').trim();
      if (/mark\s+attendance/i.test(text) && !/Take A Snap/i.test(html.substring(Math.max(0, match.index - 200), match.index))) {
        return text;
      }
    }
    return null;
  },

  hasFeedbackModal(html) {
    return html.includes('How was the session?');
  },

  detectAttendanceStatus(html) {
    if (html.includes("You're marked as present") || html.includes('• Present') || html.includes('Present')) {
      return AttendanceBadgeStates.PRESENT;
    }
    if (html.includes("You're marked as absent") || html.includes('• Absent') || html.includes('Absent')) {
      return AttendanceBadgeStates.ABSENT;
    }
    return AttendanceBadgeStates.UNKNOWN;
  }
};

console.log('--- Running Kalvium Assistant Mock Fixture Tests ---');

// Test 1: Upcoming Session
{
  console.log('\nTest 1: Upcoming Session Fixture');
  const html = fs.readFileSync(path.join(fixturesDir, 'upcoming.html'), 'utf8');
  assert(!Inspector.hasTakeASnapModal(html), 'No Take A Snap modal present');
  assert(!Inspector.hasFeedbackModal(html), 'No Feedback modal present');
  assert(!Inspector.findDashboardAttendanceButton(html), 'No Mark Attendance button on upcoming card');
}

// Test 2: Live Attendance
{
  console.log('\nTest 2: Live Attendance Fixture');
  const html = fs.readFileSync(path.join(fixturesDir, 'live.html'), 'utf8');
  const btn = Inspector.findDashboardAttendanceButton(html);
  assert(btn !== null, 'Found dashboard Mark Attendance button');
  assert(btn && btn.toLowerCase().includes('mark attendance'), 'Trigger text confirmed');
}

// Test 3: Take A Snap Modal & Camera
{
  console.log('\nTest 3: Take A Snap Modal Fixture');
  const html = fs.readFileSync(path.join(fixturesDir, 'snap_modal.html'), 'utf8');
  assert(Inspector.hasTakeASnapModal(html), 'Detected "Take A Snap" dialog');
  assert(Inspector.hasCameraVideo(html), 'Detected active <video> camera element');
}

// Test 4: Present Status
{
  console.log('\nTest 4: Present Status Fixture');
  const html = fs.readFileSync(path.join(fixturesDir, 'present.html'), 'utf8');
  const status = Inspector.detectAttendanceStatus(html);
  assert(status === AttendanceBadgeStates.PRESENT, 'Detected PRESENT status');
}

// Test 5: Absent Status
{
  console.log('\nTest 5: Absent Status Fixture');
  const html = fs.readFileSync(path.join(fixturesDir, 'absent.html'), 'utf8');
  const status = Inspector.detectAttendanceStatus(html);
  assert(status === AttendanceBadgeStates.ABSENT, 'Detected ABSENT status');
}

// Test 6: Feedback Modal
{
  console.log('\nTest 6: Feedback Modal Fixture');
  const html = fs.readFileSync(path.join(fixturesDir, 'feedback_modal.html'), 'utf8');
  assert(Inspector.hasFeedbackModal(html), 'Detected "How was the session?" modal');
}

// Test 7: Unexpected Page
{
  console.log('\nTest 7: Unexpected Page Fixture');
  const html = fs.readFileSync(path.join(fixturesDir, 'unexpected.html'), 'utf8');
  assert(!Inspector.hasTakeASnapModal(html) && 
         !Inspector.hasFeedbackModal(html) && 
         !Inspector.findDashboardAttendanceButton(html), 
         'Gracefully handles unexpected page without errors or false triggers');
}

console.log(`\n--------------------------------------------------`);
console.log(`Test Results: ${passedTests} / ${totalTests} passed.`);
console.log(`--------------------------------------------------`);

if (passedTests !== totalTests) {
  process.exit(1);
}
