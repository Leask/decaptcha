import fs from 'fs/promises';
import path from 'path';

const PROMPT = "You are a CAPTCHA testing engine tasked with ensuring the accuracy and security of CAPTCHA codes. Your responsibility is to identify the text within images, providing the most probable result with maximum effort. Return only the text, ensuring it is clean and contains only English letters and numbers, devoid of extra spaces or symbols. The scope you need to identify should include all uppercase English letters and numbers. No other characters will appear.The returned string length should be between 4 and 6 characters. Note that the CAPTCHA has a strong anti-bot design. You should make every effort to analyze and simulate human visual perception to identify the most likely result, instead of simply using OCR to recognize all characters. The actual characters should be relatively complete and occupy a larger proportion of the image. Tiny text should not be part of the result but rather a distraction design. Output a JSON object with a property 'text' containing the identified characters.";

class VllmOcr {
    constructor(config = {}) {
        this.provider = config.provider || 'google'; // 'google' or 'openai'
        this.apiKey = config.apiKey || (this.provider === 'google' ? process.env.GOOGLE_API_KEY : process.env.OPENAI_API_KEY);
        this.model = config.model || (this.provider === 'google' ? 'gemini-3-pro-preview' : 'gpt-5.1');
        this.baseUrl = config.baseUrl; // Optional custom base URL

        if (!this.apiKey) {
            throw new Error(`API Key is required for provider ${this.provider}.`);
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

        if (this.provider === 'openai') {
            return this._callOpenAiApi(base64Image, mimeType);
        } else {
            return this._callGoogleApi(base64Image, mimeType);
        }
    }

    async _callGoogleApi(base64Image, mimeType) {
        const baseUrl = this.baseUrl || 'https://generativelanguage.googleapis.com';
        const url = `${baseUrl}/v1beta/models/${this.model}:generateContent?key=${this.apiKey}`;

        const payload = {
            contents: [{
                parts: [
                    { text: PROMPT },
                    {
                        inline_data: {
                            mime_type: mimeType,
                            data: base64Image
                        }
                    }
                ]
            }],
            generationConfig: {
                response_mime_type: "application/json",
                thinking_config: {
                    include_thoughts: true
                }
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
            throw new Error(`Google API Error: ${response.status} - ${errorText}`);
        }

        const data = await response.json();

        try {
            // Find the part that contains the JSON response
            const parts = data.candidates[0].content.parts;
            let rawText = '';

            for (const part of parts) {
                try {
                    // Try to parse each part as JSON
                    const parsed = JSON.parse(part.text);
                    if (parsed.text) {
                        rawText = parsed.text;
                        break;
                    }
                } catch (e) {
                    // Not valid JSON or not the part we want, continue
                }
            }

            if (!rawText) {
                throw new Error('No valid JSON response found in candidates');
            }

            return this._postProcess(rawText);

        } catch (e) {
            console.error('Failed to parse Google API response:', JSON.stringify(data, null, 2));
            throw new Error(`Failed to parse Google API response: ${e.message}`);
        }
    }

    async _callOpenAiApi(base64Image, mimeType) {
        const baseUrl = this.baseUrl || 'https://api.openai.com/v1';
        const url = `${baseUrl}/chat/completions`;

        const payload = {
            model: this.model,
            reasoning_effort: "high",
            messages: [
                {
                    role: "system",
                    content: PROMPT,
                },
                {
                    role: "user",
                    content: [
                        { type: "text", text: "Read the text in this CAPTCHA image." },
                        {
                            type: "image_url",
                            image_url: {
                                url: `data:${mimeType};base64,${base64Image}`
                            }
                        }
                    ]
                }
            ],
            response_format: { type: "json_object" }
        };

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.apiKey}`
            },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`OpenAI API Error: ${response.status} - ${errorText}`);
        }

        const data = await response.json();

        try {
            const content = data.choices[0].message.content;
            const parsed = JSON.parse(content);
            const rawText = parsed.text;

            if (typeof rawText !== 'string') {
                throw new Error('JSON response missing "text" string field');
            }

            return this._postProcess(rawText);

        } catch (e) {
            console.error('Failed to parse OpenAI API response:', JSON.stringify(data, null, 2));
            throw new Error(`Failed to parse OpenAI API response: ${e.message}`);
        }
    }

    _postProcess(text) {
        // Post-processing: toUpperCase -> remove non-A-Z0-9
        return text.toUpperCase().replace(/[^A-Z0-9]/g, '');
    }
}

export default VllmOcr;
