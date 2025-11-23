# Decaptcha

An automated CAPTCHA recognition tool powered by Google's **Gemini 3.0 Pro** model. This project demonstrates how to leverage advanced multimodal AI for high-accuracy text extraction from CAPTCHA images.

```
npm run test

> decaptcha@1.0.0 test
> node --test tests/*.mjs

[5UU33.jpg] Expected: 5UU33, Actual: 5UU133
▶ CAPTCHA Recognition Accuracy Test
  ✖ Recognize 5UU33.jpg (31499.653958ms)
[65WEBN.jpg] Expected: 65WEBN, Actual: 65WEBN
  ✔ Recognize 65WEBN.jpg (24890.874583ms)
[6AURBV.jpg] Expected: 6AURBV, Actual: 6AURBV
  ✔ Recognize 6AURBV.jpg (27499.57775ms)
[8SUN.jpg] Expected: 8SUN, Actual: 8SUN
  ✔ Recognize 8SUN.jpg (7427.731041ms)
[CN3JV.jpg] Expected: CN3JV, Actual: CN3JV
  ✔ Recognize CN3JV.jpg (10530.508583ms)
[EHHB8U.jpg] Expected: EHHB8U, Actual: EFHB8U
  ✖ Recognize EHHB8U.jpg (7940.028833ms)
[HWTUV.jpg] Expected: HWTUV, Actual: HWTUV
  ✔ Recognize HWTUV.jpg (21948.761791ms)
[JKYB.jpg] Expected: JKYB, Actual: JKYB
  ✔ Recognize JKYB.jpg (32942.866792ms)
[K9WVC.jpeg] Expected: K9WVC, Actual: K9WVC
  ✔ Recognize K9WVC.jpeg (58849.337333ms)
[MKMY.jpg] Expected: MKMY, Actual: MKMY
  ✔ Recognize MKMY.jpg (7921.167417ms)
[MM6C.jpg] Expected: MM6C, Actual: MM6C
  ✔ Recognize MM6C.jpg (9680.749792ms)
[NKUA8.jpg] Expected: NKUA8, Actual: NRULA8
  ✖ Recognize NKUA8.jpg (36362.194583ms)
[U96V.jpg] Expected: U96V, Actual: U96V
  ✔ Recognize U96V.jpg (9076.395625ms)
[UE5R.jpg] Expected: UE5R, Actual: UE5K
  ✖ Recognize UE5R.jpg (7229.931333ms)
[UEVN9.jpg] Expected: UEVN9, Actual: UEVN9
  ✔ Recognize UEVN9.jpg (25429.356625ms)
[V4JYWY.jpg] Expected: V4JYWY, Actual: V4JYWY
  ✔ Recognize V4JYWY.jpg (6018.573791ms)
[VVCMN5.jpg] Expected: VVCMN5, Actual: VVCMN5
  ✔ Recognize VVCMN5.jpg (37365.789333ms)
[WRP6A.jpg] Expected: WRP6A, Actual: WRP6A
  ✔ Recognize WRP6A.jpg (34868.774958ms)
[WVY9YC.jpg] Expected: WVY9YC, Actual: WVY9YC
  ✔ Recognize WVY9YC.jpg (19756.459ms)
[XPXUS.jpeg] Expected: XPXUS, Actual: XPXUS
  ✔ Recognize XPXUS.jpeg (8447.152583ms)
[YNKJJ.jpg] Expected: YNKJJ, Actual: YNKJJ
  ✔ Recognize YNKJJ.jpg (9419.761792ms)
✖ CAPTCHA Recognition Accuracy Test (435114.753375ms)
ℹ tests 22
ℹ suites 0
ℹ pass 17
ℹ fail 5
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 435173.524083
```

## Features

- **Advanced AI Model**: Uses `gemini-3-pro-preview` with **Thinking Mode** enabled for maximum reasoning and accuracy.
- **Automated Testing**: Includes a test suite to verify recognition accuracy against a set of local test cases.
- **Robust Parsing**: Handles complex API responses (including "thoughts") and extracts structured JSON data.
- **Easy Configuration**: Simple JSON-based configuration for API keys.

## Prerequisites

- Node.js (v18 or higher recommended)
- A Google Cloud API Key with access to the Generative Language API (Gemini).

## Installation

1.  **Clone the repository:**
    ```bash
    git clone <repository-url>
    cd decaptcha
    ```

2.  **Install dependencies:**
    ```bash
    npm install
    ```

3.  **Configure API Key:**
    - Copy the sample config file:
      ```bash
      cp config.sample.json config.json
      ```
    - Edit `config.json` and paste your Google API Key:
      ```json
      {
        "google_api_key": "YOUR_ACTUAL_API_KEY"
      }
      ```

## Usage

### Run Tests

To run the automated recognition test suite on the images in `tests/cases/`:

```bash
npm start
```
Or directly:
```bash
npm test
```

This will:
1.  Iterate through all images in `tests/cases/`.
2.  Send each image to the Gemini API.
3.  Compare the recognized text with the expected text (derived from the filename).
4.  Output a pass/fail report to the console.

### Project Structure

-   **`index.mjs`**: The core library file containing the `GeminiOCR` class.
-   **`tests/`**: Contains the test runner (`ocr.test.mjs`) and test images (`cases/`).
-   **`config.json`**: Configuration file for your API key (ignored by Git).

## License

MIT
