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

    // --- Fast Mode Logic ---
    const isFastMode = process.argv.includes('--fast') || process.env.FAST;

    const ocr = new VllmOcr({
        apiKey: apiKey,
        models: models,
        fastMode: isFastMode
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

    if (isFastMode) {
        const limit = 10;
        console.log(`\n⚡ FAST MODE ENABLED: Limiting to first ${limit} images & using Race-to-Consensus.`);
        files = files.slice(0, limit);
    }

    console.log(`\n🚀 Starting tests with ${files.length} images using models: ${ocr.models.join(', ')}\n`);

    // Track stats for each model
    const modelStats = {};
    ocr.models.forEach(m => {
        modelStats[m] = { correct: 0, total: 0 };
    });
    // Track stats for the Voting System itself
    const VOTED_KEY = '🔥 VOTED (System)';
    modelStats[VOTED_KEY] = { correct: 0, total: 0 };

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

                // Update Voted Stats
                modelStats[VOTED_KEY].total++;
                if (isMatch) {
                    modelStats[VOTED_KEY].correct++;
                }

                console.log(`${statusIcon} [${filename}] Expected: ${expectedNorm} | Voted: ${actualNorm || 'NULL'}`);
                
                // Detailed breakdown & Stats update
                console.log(`   Details:`);
                result.details.forEach(r => {
                    const modelId = r.model;
                    
                    // Update stats for individual models
                    if (modelStats[modelId]) {
                        modelStats[modelId].total++;
                        
                        if (!r.error && r.text === expectedNorm) {
                            modelStats[modelId].correct++;
                        }
                    }
                    
                    const modelName = modelId.split('/').pop(); // Shorten name for display
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

    // --- Model Accuracy Leaderboard ---
    console.log('\n🏆 Model Accuracy Leaderboard 🏆');
    console.log('---------------------------------------------------------------');
    console.log('| Rank | Model Name                         | Accuracy | Score  |');
    console.log('---------------------------------------------------------------');

    const leaderboard = Object.entries(modelStats)
        .map(([model, stats]) => {
            const accuracy = stats.total > 0 ? (stats.correct / stats.total) * 100 : 0;
            return { model, accuracy, ...stats };
        })
        .sort((a, b) => b.accuracy - a.accuracy);

    leaderboard.forEach((entry, index) => {
        const rank = index + 1;
        // Clean up the display name
        let displayModelName = entry.model;
        if (displayModelName !== VOTED_KEY) {
            displayModelName = displayModelName.split('/').pop();
        }
        
        const modelName = displayModelName.padEnd(30);
        const accuracy = entry.accuracy.toFixed(2).padStart(6);
        const score = `${entry.correct}/${entry.total}`.padStart(6);
        console.log(`| ${rank.toString().padEnd(4)} | ${modelName} | ${accuracy}% | ${score} |`);
    });
    console.log('---------------------------------------------------------------\n');
});