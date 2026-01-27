import { checkAndIncrementUsage, getMaskedUsage } from '../lib/usage-tracker.js';
import fs from 'fs';
import path from 'path';
import os from 'os';

const CONFIG_DIR = path.join(os.homedir(), '.scribe-center');
const USAGE_FILE = path.join(CONFIG_DIR, 'usage.json');

async function runTest() {
    console.log('--- Starting Enhanced Usage Tracker Test ---');

    // 1. Clean up existing usage file for clean test
    if (fs.existsSync(USAGE_FILE)) {
        fs.unlinkSync(USAGE_FILE);
        console.log('Cleaned up existing usage file.');
    }

    try {
        const TEST_KEY_1 = 'AIzaSy_TEST_KEY_ONE_123456';
        const TEST_KEY_2 = 'AIzaSy_TEST_KEY_TWO_654321';

        // 2. Test incrementing for key 1
        console.log('Testing increment for Key 1 (4s)...');
        checkAndIncrementUsage(TEST_KEY_1, 4);

        // 3. Test incrementing for key 2
        console.log('Testing increment for Key 2 (8s)...');
        checkAndIncrementUsage(TEST_KEY_2, 8);

        const stats = getMaskedUsage();
        console.log('Current Stats:', JSON.stringify(stats, null, 2));

        // 4. Verify masking
        const maskedKeys = Object.keys(stats.usage);
        if (maskedKeys.length !== 2) throw new Error('Expected 2 tracked keys');
        if (!maskedKeys.every(k => k.includes('...'))) throw new Error('Keys should be masked');

        console.log('--- Enhanced Usage Tracker Test PASSED ---');
    } catch (error) {
        console.error('--- Enhanced Usage Tracker Test FAILED ---');
        console.error(error);
        process.exit(1);
    }
}

runTest();
