import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'fs/promises';
import path from 'path';
import GeminiOCR from '../index.mjs';

const CONFIG_FILE = './config.json';
const TEST_CASES_DIR = './tests/cases';

// Helper to load config
async function loadConfig() {
    try {
        const configFile = await fs.readFile(CONFIG_FILE, 'utf8');
        return JSON.parse(configFile);
    } catch (e) {
        return {};
    }
}

test('CAPTCHA Recognition Accuracy Test', async (t) => {
    const config = await loadConfig();
    const apiKey = config.google_api_key;

    if (!apiKey) {
        console.warn('⚠️  Skipping tests: No API key found in config.json');
        return;
    }

    const ocr = new GeminiOCR({
        apiKey: apiKey,
        model: 'gemini-3-pro-preview' // Or configurable
    });

    let files;
    try {
        files = await fs.readdir(TEST_CASES_DIR);
        files = files.filter(f => /\.(jpg|jpeg|png)$/i.test(f));
    } catch (error) {
        console.error(`Error reading ${TEST_CASES_DIR}:`, error.message);
        return;
    }

    if (files.length === 0) {
        console.log('No images found in test_cases directory.');
        return;
    }

    // Use a subtest for each file to get nice reporting
    for (const [index, filename] of files.entries()) {
        await t.test(`Recognize ${filename}`, async () => {
            const filePath = path.join(TEST_CASES_DIR, filename);
            const expected = path.parse(filename).name;

            try {
                const actual = await ocr.recognize(filePath);
                
                // Normalize
                const expectedNorm = expected.toUpperCase().trim();
                const actualNorm = actual.toUpperCase().trim();
                
                console.log(`[${filename}] Expected: ${expectedNorm}, Actual: ${actualNorm}`);

                assert.strictEqual(actualNorm, expectedNorm, `Expected ${expectedNorm}, got ${actualNorm}`);
            } catch (error) {
                 assert.fail(`Error processing ${filename}: ${error.message}`);
            }

        });
    }
});
