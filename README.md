# Manimate Uni

Manimate Uni is an agentic Next.js-based application that translates educational topics into high-fidelity, narrated, dynamic Manim videos. The entire pipeline—from web research and lecture planning to Python code generation, rendering, local text-to-speech (TTS), and video stitching—is orchestrated directly within Next.js.

---

## 🚀 Key Features

* **Multi-LLM Provider Engine (Vercel AI SDK)**: Supports OpenAI, Anthropic, Google Gemini, and Mistral AI. Includes dynamic model presets, custom `provider/model` overrides, and round-robin key rotation per provider.
* **Local Subprocess Pipeline**: Executes the local Python compiler to run Manim CLI renders and FFMPEG to mux voiceovers and stitch scenes.
* **Self-Correcting Rendering Loop**: If the LLM generates Manim code that fails to compile, the pipeline captures the traceback, invokes the corrector LLM, and repairs the script on-the-fly (up to 3 retries).
* **Dynamic Scene Pacing**: Calculates scene durations dynamically based on the length of the voiceover transcript ($\text{duration} = \lceil\text{chars} / 15\rceil + 3$ seconds) to avoid silent pauses or frozen video tracks during scene transitions.
* **Mastery Assessment Quizzes**: Generates 5-question multiple-choice quizzes using a separate LLM call based on the generated lecture's content. Offers instant correct/incorrect feedback, skip commands, and the ability to generate harder questions incrementally.
* **Local Voiceover Synthesis**: Local high-fidelity speech synthesis using the Kokoro-82M ONNX model.

---

## ⚙️ Architectural Quirks & Design Patterns

### 1. File-Based Data Storage (No Database)
To keep deployment simple and self-contained, **the project does not use a traditional SQL or NoSQL database**. 
* Every generation request creates a directory under `generations/{jobId}/`.
* All state, progress metrics, and error logs are saved in `generations/{jobId}/metadata.json`.
* The structured lesson plan is stored in `generations/{jobId}/lecture_plan.json`, generated Python files are stored in `scene_code/`, audio files in `tts/`, and final videos in the root of the job folder.
* Quiz assessments are stored and tracked in `generations/{jobId}/quiz.json`.
* Deleting a build recursively wipes the folder from the file system.

### 2. Multi-Key Rotation
For high-throughput execution without rate-limiting issues, you can provide comma-separated keys (e.g., `OPENAI_API_KEYS="key1,key2,key3"`). The server splits them and performs a round-robin rotation for each API request.

---

## 🛠️ Prerequisites & Setup Guide

### 1. System Dependencies
* **Node.js**: Active LTS version (Node 18+).
* **FFMPEG & FFProbe**: Must be installed and available on your system `PATH`. Alternatively, you can override the path in your `.env.local` file.
* **LaTeX (Optional but Recommended)**: Required by Manim if you want to render complex mathematical equations (MathTex). Use **MiKTeX** (Windows) or **TeX Live** (macOS/Linux).

### 2. Python Virtual Environment (`venv`) Setup
Manim requires Python 3.8+ and its own library environment. We recommend setting up a virtual environment inside the project directory:

```bash
# 1. Create a virtual environment named "manim-env"
python -m venv manim-env

# 2. Activate the virtual environment
# On Windows (PowerShell):
.\manim-env\Scripts\Activate.ps1
# On Windows (CMD):
.\manim-env\Scripts\activate.bat
# On macOS/Linux:
source manim-env/bin/activate

# 3. Install Manim and its dependencies
pip install manim
```

Verify that Manim is installed correctly by running `manim --version` in your terminal inside the activated environment.

### 3. Application Setup & Run
Configure the project credentials and paths:

1. **Install Node dependencies**:
   ```bash
   npm install
   ```

2. **Configure Environment Variables**:
   Copy `.env.example` to `.env.local`:
   ```bash
   cp .env.example .env.local
   ```
   Open `.env.local` and configure the following keys:
   
   * **API Keys**: Provide credentials for at least one provider (Mistral, OpenAI, Anthropic, or Google Gemini). Both single API keys (`_API_KEY`) and list rotations (`_API_KEYS`) are supported:
     ```ini
     OPENAI_API_KEY="sk-proj-..."
     MISTRAL_API_KEYS="key_one,key_two"
     ```
   * **Python Executable**: Set the absolute path of the Python interpreter inside the virtual environment you created:
     ```ini
     MANIM_PYTHON="E:\\programming\\manimate-uni\\manim-env\\Scripts\\python.exe"
     ```
   * **FFMPEG Executable**: If FFMPEG is not on your global PATH, provide the path directly:
     ```ini
     FFMPEG_PATH="C:\\path\\to\\ffmpeg.exe"
     ```

3. **Start the Development Server**:
   ```bash
   npm run dev
   ```
   Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 📝 Quiz Assessment Details
Once a video completes building, you can select the **Take Mastery Quiz** button on the Studio screen. 
* This launches the quiz view (`/studio/{jobId}/quiz`).
* The system evaluates your input instantly and displays educational analysis of the selected, incorrect, and skipped options.
* On completing the quiz, clicking **Generate Harder Questions** triggers the API, increments the difficulty level, and dynamically appends 5 more complex, calculations-based, or proof-oriented questions to your assessment.
