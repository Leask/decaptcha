import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'fs/promises';
import path from 'path';
import VllmOcr from '../index.mjs';

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

test('CAPTCHA Recognition Accuracy Test (Multi-Model Voting)', async (t) => {
    const config = await loadConfig();
    const apiKey = config.openrouter_api_key || config.api_key;
    const models = config.models;

    if (!apiKey) {
        console.warn('⚠️  Skipping tests: No API key found in config.json');
        return;
    }

    const ocr = new VllmOcr({
        apiKey: apiKey,
        models: models 
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

    console.log(`\n🚀 Starting tests with ${files.length} images using models: ${ocr.models.join(', ')}\n`);

    for (const filename of files) {
        await t.test(`Recognize ${filename}`, async () => {
            const filePath = path.join(TEST_CASES_DIR, filename);
            const expected = path.parse(filename).name;
            const expectedNorm = expected.toUpperCase().trim();

            try {
                const result = await ocr.recognize(filePath);
                const actualNorm = result.final_text;

                const isMatch = actualNorm === expectedNorm;
                const statusIcon = isMatch ? '✅' : '❌';

                console.log(`${statusIcon} [${filename}] Expected: ${expectedNorm} | Voted: ${actualNorm || 'NULL'}`);
                
                // Detailed breakdown
                console.log(`   Details:`);
                result.details.forEach(r => {
                    const modelName = r.model.split('/').pop(); // Shorten name for display
                    let modelStatus = '⚠️ Error';
                    let output = r.error;

                    if (!r.error) {
                        const rText = r.text;
                        modelStatus = (rText === expectedNorm) ? '✅' : '❌';
                        output = rText;
                    }
                    
                    console.log(`     - ${modelStatus} ${modelName}: ${output} (${r.duration}ms)`);
                });
                console.log(''); // Empty line separator

                assert.strictEqual(actualNorm, expectedNorm, `Expected ${expectedNorm}, got ${actualNorm}`);
            } catch (error) {
                 assert.fail(`Error processing ${filename}: ${error.message}`);
            }
        });
    }
});