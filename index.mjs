import fs from 'fs/promises';
import path from 'path';

const CONFIG_FILE = './config.json';
const TEST_CASES_DIR = './test_cases';

async function main() {
    // 1. Read Config
    let config;
    try {
        const configFile = await fs.readFile(CONFIG_FILE, 'utf8');
        config = JSON.parse(configFile);
    } catch (error) {
        console.error(`Error reading ${CONFIG_FILE}:`, error.message);
        process.exit(1);
    }

    const apiKey = config.google_api_key;
    if (!apiKey) {
        console.error('Error: google_api_key is missing in config.json');
        process.exit(1);
    }

    // 2. Read Test Cases
    let files;
    try {
        files = await fs.readdir(TEST_CASES_DIR);
        // Filter for images
        files = files.filter(f => /\.(jpg|jpeg|png)$/i.test(f));
    } catch (error) {
        console.error(`Error reading ${TEST_CASES_DIR}:`, error.message);
        process.exit(1);
    }

    if (files.length === 0) {
        console.log('No images found in test_cases directory.');
        return;
    }

    console.log(`Found ${files.length} images. Starting automated test...`);
    const startTime = Date.now();

    const results = [];

    // Process sequentially
    for (const [index, filename] of files.entries()) {
        const result = await processTestCase(filename, apiKey);
        results.push(result);

        // Wait 1 second between requests, but not after the last one
        if (index < files.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
    }

    const endTime = Date.now();
    const duration = ((endTime - startTime) / 1000).toFixed(2);

    // 3. Generate Report
    const passed = results.filter(r => r.success).length;
    const failed = results.length - passed;
    const accuracy = ((passed / results.length) * 100).toFixed(2);

    console.log('\n--- Test Summary ---');
    console.log(`Total:    ${results.length}`);
    console.log(`Passed:   ${passed}`);
    console.log(`Failed:   ${failed}`);
    console.log(`Accuracy: ${accuracy}%`);
    console.log(`Time:     ${duration}s`);
}

async function processTestCase(filename, apiKey) {
    const filePath = path.join(TEST_CASES_DIR, filename);
    const expected = path.parse(filename).name; // Filename without extension is the truth

    try {
        const imageBuffer = await fs.readFile(filePath);
        const base64Image = imageBuffer.toString('base64');
        const mimeType = filename.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg';

        process.stdout.write(`Processing ${filename}...
`);
        const actual = await solveCaptcha(apiKey, base64Image, mimeType);

        // Normalize for comparison (trim whitespace, uppercase)
        const isMatch = actual.toUpperCase().trim() === expected.toUpperCase().trim();

        const result = {
            filename,
            expected,
            actual,
            success: isMatch
        };

        if (isMatch) {
            console.log(`✅ ${filename}: PASS`);
        } else {
            console.log(`❌ ${filename}: FAIL (Expected: ${expected}, Got: ${actual})`);
        }

        return result;

    } catch (error) {
        console.error(`⚠️ ${filename}: ERROR (${error.message})`);
        return {
            filename,
            expected,
            actual: `Error: ${error.message}`,
            success: false
        };
    }
}

async function solveCaptcha(apiKey, base64Image, mimeType) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-pro-preview:generateContent?key=${apiKey}`;

    const payload = {
        contents: [{
            parts: [
                { text: "You are a CAPTCHA testing engine tasked with ensuring the accuracy and security of CAPTCHA codes. Your responsibility is to identify the text within images, providing the most probable result with maximum effort. Return only the text, ensuring it is clean and contains only English letters and numbers, devoid of extra spaces or symbols." },
                {
                    inline_data: {
                        mime_type: mimeType,
                        data: base64Image
                    }
                }
            ]
        }]
    };

    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`API Error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();

    try {
        return data.candidates[0].content.parts[0].text.trim();
    } catch (e) {
        console.error('Unexpected API response structure:', JSON.stringify(data, null, 2));
        throw new Error('Failed to parse API response');
    }
}

main();
