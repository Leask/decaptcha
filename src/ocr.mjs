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
            // Basic detection or default to jpeg if buffer provided directly without type hint
            // In a real lib, you might want magic number detection
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
                    { text: "Read the text in this CAPTCHA image. Output ONLY the text characters found, no spaces, no explanation." },
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
            // console.error('Unexpected API response structure:', JSON.stringify(data, null, 2));
            throw new Error('Failed to parse API response');
        }
    }
}

export default GeminiOCR;
