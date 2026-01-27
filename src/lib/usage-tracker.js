import fs from 'fs';
import path from 'path';
import os from 'os';

const CONFIG_DIR = path.join(os.homedir(), '.scribe-center');
const USAGE_FILE = path.join(CONFIG_DIR, 'usage.json');
const MAX_DAILY_SECONDS = 21600; // 6 hours

function ensureConfigDir() {
    if (!fs.existsSync(CONFIG_DIR)) {
        fs.mkdirSync(CONFIG_DIR, { recursive: true });
    }
}

function getUsageData() {
    ensureConfigDir();
    const today = new Date().toISOString().split('T')[0];
    let data = { date: today, keys: {} };

    if (fs.existsSync(USAGE_FILE)) {
        try {
            const raw = fs.readFileSync(USAGE_FILE, 'utf8');
            if (raw && raw.trim() !== '') {
                const parsed = JSON.parse(raw);
                // Only keep data if it's from today and has correct structure
                if (parsed && typeof parsed === 'object' && parsed.date === today) {
                    data.date = parsed.date;
                    // Ensure keys exists and is an object
                    if (parsed.keys && typeof parsed.keys === 'object') {
                        data.keys = parsed.keys;
                    }
                }
            }
        } catch (error) {
            console.error('Error reading usage file:', error);
        }
    }
    return data;
}

function saveUsageData(data) {
    ensureConfigDir();
    fs.writeFileSync(USAGE_FILE, JSON.stringify(data, null, 2));
}

function maskKey(key) {
    if (!key || key.length <= 12) return '******';
    return `${key.substring(0, 6)}...${key.substring(key.length - 6)}`;
}

export function checkAndIncrementUsage(apiKey, additionalSeconds) {
    const key = apiKey || 'default_key';
    const usage = getUsageData();

    if (!usage.keys[key]) {
        usage.keys[key] = 0;
    }

    if (usage.keys[key] + additionalSeconds > MAX_DAILY_SECONDS) {
        const error = new Error('超过每日配额，请修改配额或联系管理员');
        error.status = 403;
        throw error;
    }

    usage.keys[key] += additionalSeconds;
    saveUsageData(usage);

    return usage.keys[key];
}

export function getMaskedUsage() {
    const usage = getUsageData();
    const maskedKeys = {};

    for (const key in usage.keys) {
        maskedKeys[maskKey(key)] = usage.keys[key];
    }

    return {
        date: usage.date,
        limit: MAX_DAILY_SECONDS,
        usage: maskedKeys
    };
}
