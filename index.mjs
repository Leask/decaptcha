import fs from 'fs/promises';
import path from 'path';

class GeminiOCR {
    constructor(config = {}) {
        this.apiKey = config.apiKey || process.env.GOOGLE_API_KEY;
        this.model = config.model || 'gemini-3-pro-preview';

        if (!this.apiKey) {
            throw new Error('API Key is required. Provide it in config or set GOOGLE_API_KEY env var.');
        }
    }

    async recognize(imagePathOrBuffer) {
        let base64Image;
        let mimeType;

        if (Buffer.isBuffer(imagePathOrBuffer)) {
            base64Image = imagePathOrBuffer.toString('base64');
            mimeType = 'image/jpeg';
        } else if (typeof imagePathOrBuffer === 'string') {
            const buffer = await fs.readFile(imagePathOrBuffer);
            base64Image = buffer.toString('base64');
            mimeType = imagePathOrBuffer.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg';
        } else {
            throw new Error('Invalid input. Expected file path string or Buffer.');
        }

        return this._callApi(base64Image, mimeType);
    }

    async _callApi(base64Image, mimeType) {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=${this.apiKey}`;

        const payload = {
            contents: [{
                parts: [
                    { text: "You are a CAPTCHA testing engine tasked with ensuring the accuracy and security of CAPTCHA codes. Your responsibility is to identify the text within images, providing the most probable result with maximum effort. Return only the text, ensuring it is clean and contains only English letters and numbers, devoid of extra spaces or symbols. The scope you need to identify should include all uppercase English letters and numbers. No other characters will appear. Output a JSON object with a property 'text' containing the identified characters." },
                    {
                        inline_data: {
                            mime_type: mimeType,
                            data: base64Image
                        }
                    }
                ]
            }],
            generationConfig: {
                response_mime_type: "application/json"
            }
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
            // In JSON mode, the text part contains the JSON string
            const rawJsonString = data.candidates[0].content.parts[0].text;
            const parsedJson = JSON.parse(rawJsonString);
            const rawText = parsedJson.text; // Extract 'text' field

            if (typeof rawText !== 'string') {
                throw new Error('JSON response missing "text" string field');
            }

            // Post-processing: toUpperCase -> remove non-A-Z0-9
            const processedText = rawText.toUpperCase().replace(/[^A-Z0-9]/g, '');
            return processedText;

        } catch (e) {
            console.error('Failed to parse API response:', JSON.stringify(data, null, 2));
            throw new Error(`Failed to parse API response: ${e.message}`);
        }
    }
}

export default GeminiOCR;
