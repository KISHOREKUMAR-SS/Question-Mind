# 📱 Question Mind Mobile — Comprehensive Developer, Deployment, and QA Manual

Welcome to the master technical manual and deployment guide for **Question Mind Mobile**. This application is an advanced, offline-first mobile package designed for educators and administrators. Unlike typical mobile wrappers that connect to remote servers for computation, Question Mind Mobile implements a **Local Client-Server Loop**. It compiles and bundles the entire Python FastAPI backend directly inside the Android executable using **Chaquopy**, connects securely to cloud-hosted databases (Aiven/Neon) using pure-python drivers, and offers offline compatibility using local machine learning inference (Gemma) and native platform APIs.

---

## 🗺️ System Architecture Deep Dive

```mermaid
graph TD
    %% Frontend Subsystem
    subgraph Frontend [Mobile Frontend - React + Capacitor]
        UI[React UI Components] -->|Zustand State| Store[settingsStore / authStore]
        UI -->|API Requests| BridgeJS[chaquopyBridge.ts]
    end

    %% Java Native Interface
    subgraph Native [Capacitor Java Layer]
        BridgeJS -->|Capacitor JavaScript Bridge| BridgeJava[PythonBridgePlugin.java]
        BridgeJava -->|Chaquopy JNI Interface| PythonBridge[PythonBridge.java]
        PythonBridge -->|Starts Runtime| PythonRunner[Chaquopy Python Runtime]
    end

    %% Python Local Subsystem
    subgraph PythonBackend [Local Python Backend - FastAPI Runtime]
        PythonRunner -->|Dispatches Call| FastAPIViaClient[FastAPI TestClient]
        FastAPIViaClient -->|Routes Request| RouterAuth[routers/auth.py]
        FastAPIViaClient -->|Routes Request| RouterQB[routers/question_bank.py]
        FastAPIViaClient -->|Routes Request| RouterSettings[routers/ai_settings.py]
        
        RouterQB -->|Inference Chain| AIService[services/ai_service.py]
        RouterQB -->|Generates Spreadsheets| ExcelService[services/excel_service.py]
        
        AIService -->|Option 1: API Keys| WebAPIs[Groq / Cerebras / NVIDIA / OpenRouter]
        AIService -->|Option 2: Offline| LocalModel[services/local_model_service.py]
        LocalModel -->|Chaquopy Bridge| AndroidServiceJava[Android Service Local Inference]
    end

    %% External Networks and Databases
    subgraph DatabaseStorage [Cloud Infrastructure]
        FastAPIViaClient -->|PostgreSQL Protocol SSL / pg8000| PostgresDB[(Aiven / Neon Database)]
        FastAPIViaClient -->|Brevo HTTP API| EmailService[Brevo Server]
        FastAPIViaClient -->|Google Drive OAuth API| DriveStorage[Google Drive Storage]
    end

    %% Styles
    classDef frontend fill:#fce7f3,stroke:#db2777,stroke-width:2px;
    classDef native fill:#f5f3ff,stroke:#7c3aed,stroke-width:2px;
    classDef backend fill:#fff7ed,stroke:#ea580c,stroke-width:2px;
    classDef external fill:#ecfdf5,stroke:#059669,stroke-width:2px;

    class UI,Store,BridgeJS frontend;
    class BridgeJava,PythonBridge,PythonRunner native;
    class FastAPIViaClient,RouterAuth,RouterQB,RouterSettings,AIService,ExcelService,LocalModel backend;
    class PostgresDB,EmailService,DriveStorage,WebAPIs external;
```

### 1. Architectural Components

The Question Mind Mobile application consists of three primary execution environments layered within a single Android executable package:

*   **HTML5/CSS3/TSX Web Container (Frontend)**: Serves a React single-page application inside the native Google WebView. It manages layout states, navigation drawers, page renders, user forms, and visual rendering through vanilla styling and CSS tokens.
*   **Java Native Host (Capacitor/Chaquopy Host)**: The native Android layer acts as the coordinator. It initializes the native filesystem directories, schedules notifications, requests runtime device permissions, starts the JNI (Java Native Interface) bridge, and boots the Python interpreter inside the main application thread.
*   **Embedded Python Interpreter (Chaquopy Backend)**: A sandboxed, localized Python environment executing FastAPI endpoints. It handles business logic, CDAP/Syllabus PDF file parsing, Excel spreadsheet styling via `openpyxl`, network communication with cloud endpoints (PostgreSQL Neon/Aiven, Google Drive API, LLM API services), and local AI model management.

---

## 🛠️ Workstation Prerequisites & Local Setup

Building, compiling, and deploying a hybrid Capacitor app that includes custom C-extensions and a Python virtual environment requires strict adherence to toolchain versions.

### 1. Developer Workstation Requirements

Verify that the following utilities are installed on your workstation and mapped to your system's global `PATH` environment variables:

| Utility | Required Version | Verification Command | Purpose |
| :--- | :--- | :--- | :--- |
| **Node.js** | `v18.x` or `v20.x` (LTS) | `node -v` | Javascript bundling, dev server hosting, and Capacitor CLI execution |
| **npm** | `v9.x` or `v10.x` | `npm -v` | Frontend dependency installation and node modules tree management |
| **Java JDK** | `JDK 17` (Strict Requirement) | `java -version` | Gradle builds compiling and Kotlin compiler compatibility |
| **Android Studio** | `Ladybug (2024.1.3)` or newer | *(Launch application)* | SDK manager, AVD emulator configuration, and ADB Logcat debugging |
| **Android SDK API** | `API Level 34` (Android 14) | `sdkmanager --list` | Native target and compilation framework |
| **Android NDK** | `v25.x.x` (Side-by-side) | `sdkmanager "ndk;25.x.x"` | NDK compiler required by Chaquopy to build Python packages |
| **Python** | `v3.10.x` or `v3.11.x` | `python --version` | Workstation script testing and local configuration checking |

---

### 2. Multi-OS Environment Configuration

#### A. Windows Workstation Configuration
1. Install **OpenJDK 17** (Temurin is recommended) using the MSI installer.
2. Open **System Properties** > **Environment Variables**.
3. Under System Variables, click **New** and add:
   * Variable Name: `JAVA_HOME`
   * Variable Value: `C:\Program Files\Eclipse Adoptium\jdk-17.0.11.9-hotspot\` (Adjust matching your version)
4. Select `Path` under System Variables, click **Edit**, and add:
   * `%JAVA_HOME%\bin`
5. Download and install **Android Studio**.
6. Set the `ANDROID_HOME` Environment Variable:
   * Variable Name: `ANDROID_HOME`
   * Variable Value: `C:\Users\<YOUR_USERNAME>\AppData\Local\Android\Sdk`
7. Edit the `Path` variable to include:
   * `%ANDROID_HOME%\platform-tools`
   * `%ANDROID_HOME%\emulator`
   * `%ANDROID_HOME%\cmdline-tools\latest\bin`
8. Restart your terminal emulator and verify installation:
   ```powershell
   where java
   java -version
   adb --version
   ```

#### B. macOS Workstation Configuration
1. Install Homebrew if it is not already installed on your system:
   ```bash
   /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
   ```
2. Install OpenJDK 17:
   ```bash
   brew install openjdk@17
   ```
3. Link the OpenJDK installation to your system Java wrapper:
   ```bash
   sudo ln -sfn /opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk /Library/Java/JavaVirtualMachines/openjdk-17.jdk
   ```
4. Configure paths in your shell profile file (e.g., `~/.zshrc` or `~/.bash_profile`):
   ```bash
   export JAVA_HOME="/Library/Java/JavaVirtualMachines/openjdk-17.jdk/Contents/Home"
   export ANDROID_HOME="$HOME/Library/Android/sdk"
   export PATH="$PATH:$JAVA_HOME/bin:$ANDROID_HOME/platform-tools:$ANDROID_HOME/emulator"
   ```
5. Apply the profile modifications:
   ```bash
   source ~/.zshrc
   ```

#### C. Linux Workstation Configuration (Debian/Ubuntu)
1. Install the OpenJDK 17 package:
   ```bash
   sudo apt-get update
   sudo apt-get install -y openjdk-17-jdk openjdk-17-jre
   ```
2. Configure shell environment variables in your active shell configuration (`~/.bashrc`):
   ```bash
   export JAVA_HOME="/usr/lib/jvm/java-17-openjdk-amd64"
   export ANDROID_HOME="$HOME/Android/Sdk"
   export PATH="$PATH:$JAVA_HOME/bin:$ANDROID_HOME/platform-tools:$ANDROID_HOME/emulator"
   ```
3. Apply changes and verify compiler utilities:
   ```bash
   source ~/.bashrc
   java -version
   ```

---

### 3. Native Android Toolchain Setup inside Android Studio

To compile the application, you must install the specific target SDK Platforms, Build Tools, and Native NDK compilers:
1. Start **Android Studio**.
2. Open settings: **Tools > SDK Manager** (or **Settings > Appearance & Behavior > System Settings > Android SDK**).
3. Under the **SDK Platforms** tab:
   * Locate and select **Android 14.0 (UpsideDownCake)** (API Level 34).
   * Click Apply to download the binaries.
4. Under the **SDK Tools** tab:
   * Select **Android SDK Build-Tools** and expand it. Check `34.0.0`.
   * Check **Android SDK Command-line Tools (latest)**.
   * Check **Android SDK Platform-Tools**.
   * Check **Android NDK (Side by side)**. Look for version `25.x.x` (or the latest LTS 25 release) and check it.
   * Check **CMake**.
5. Click **OK** to begin downloading and compiling the required utilities.

---

### 4. Physical Android Mobile Setup (USB Debugging)

To execute live-reload debugging or deploy raw development binaries directly onto a physical test phone, prepare the mobile operating system configuration:
1. Open the system **Settings** menu on your Android device.
2. Locate **About Phone** (or **System > About Phone**).
3. Scroll down to find the **Build Number** and tap it continuously exactly **7 times**. A toast notification will flash: *"You are now a developer!"*
4. Go back to the main Settings menu, find and open the newly unlocked **Developer Options** submenu.
5. Scroll down to the debugging section, locate and toggle **USB Debugging** to **On**.
6. Connect the phone to your developer workstation using a high-quality USB data transfer cable.
7. A prompt will display on the screen: *"Allow USB debugging?"*. Check the box that says *"Always allow from this computer"* and tap **Allow**.
8. Verify that your device is registered on the system by executing the ADB command line:
   ```bash
   adb devices
   ```
   *Expected console output:*
   ```text
   List of devices attached
   9a8b7c6d5e4f3g2h    device
   ```

---

## 🚀 Running the Application in Development Mode

The mobile version supports a **Live Reload** developer lifecycle. The Capacitor container running on the phone loads its web assets directly from the development server running on your workstation. When you modify styles, stores, or components, changes reflect on the mobile screen instantly.

### Live Reload Process Sequence

```mermaid
sequenceDiagram
    autonumber
    participant Dev as Workstation (Vite Dev Server)
    participant PhoneApp as Mobile Device (Capacitor Container)
    participant PhonePy as Local Python (Chaquopy Backend)

    Note over Dev,PhoneApp: App runs in Developer mode with Live Reload
    Dev->>PhoneApp: Serves updated JS/CSS assets over Wi-Fi
    PhoneApp->>PhoneApp: Re-renders UI inside the Native WebView
    
    Note over PhoneApp,PhonePy: User makes an API Request (e.g. generate questions)
    PhoneApp->>PhoneApp: Intercepts endpoint call in chaquopyBridge.ts
    PhoneApp->>PhoneApp: Invokes Java Bridge method
    PhoneApp->>PhonePy: Forwards JSON parameters to python TestClient
    PhonePy->>PhonePy: Runs local FastAPIRouter logic
    PhonePy-->>PhoneApp: Returns response JSON envelope
    PhoneApp-->>Dev: Logs JS errors and console logs over WebSockets
```

### Step-by-Step Execution Sequence

#### 1. Setup Dependencies
From the root workspace directory, navigate to the mobile project folder and download the packages:
```bash
cd mobile-app
npm install
```

#### 2. Configure Python Backend Local Environment
The embedded Python FastAPI server reads database connections, API configurations, and folder targets from a localized env file.
Copy the configuration template to create the actual local configuration file:
```bash
# On Windows Command Prompt/PowerShell
copy android\app\src\main\python\.env.example android\app\src\main\python\.env

# On macOS / Linux Terminal
cp android/app/src/main/python/.env.example android/app/src/main/python/.env
```

Open `android/app/src/main/python/.env` and update the properties to point to your cloud Aiven/Neon postgres instances:
```ini
DATABASE_URL=postgresql+pg8000://avnadmin:credentials@pg-instance.aivencloud.com:port/defaultdb?ssl=true
GOOGLE_DRIVE_CREDENTIALS={"type": "service_account", "project_id": ...}
```

> [!IMPORTANT]
> Because mobile phones do not packages native PostgreSQL shared client drivers (`libpq`), the mobile backend utilizes the pure-python **`pg8000`** driver via SQLAlchemy. The `DATABASE_URL` protocol MUST be explicitly configured as **`postgresql+pg8000://`**. Ensure you append the `?ssl=true` parameter at the end to guarantee encrypted handshakes.

#### 3. Establish Live Reload Session
1. Connect your physical test phone to your workstation via USB.
2. Ensure both your workstation and the phone are connected to the **same Wi-Fi router network**. If they reside on separate networks, the Capacitor wrapper on the phone will fail to fetch the Vite server.
3. Run the live-reload compilation command:
   ```bash
   npx cap run android --livereload
   ```
4. The Capacitor CLI will scan your active network cards and ask you to select an IP address:
   ```text
   ? Select an IP address to use for live reload:
   > 192.168.1.15 (Wi-Fi)
     172.18.96.1 (Virtual Adapter)
   ```
   Select the IP address belonging to your primary Wi-Fi adapter.
5. The CLI builds the frontend bundle, packs the Android container, compiles the native Java files, installs the APK package to the connected device, and launches the app.
6. The workstation console logs all console outputs and errors generated by the phone's WebView.

---

## 🏗️ Technical Details: The Chaquopy Bridge

The mobile application utilizes the **Chaquopy JavaScript-to-Java-to-Python Bridge** to process requests without running a battery-draining local web server on port 8000. It intercept all typical frontend requests and proxies them directly into native memory space.

### 1. TypeScript Call Dispatcher File Link

The frontend intercepts standard REST patterns and dispatches them to Java:
See: [chaquopyBridge.ts](file:///d:/QUESTION%20MIND/mobile-app/src/lib/chaquopyBridge.ts)

```typescript
import { registerPlugin, Capacitor } from '@capacitor/core';

export interface PythonBridgePlugin {
  generateQuestions(options: { subjectId: string, syllabusCoverage: string, partConfigs: string }): Promise<{ value: string }>;
  exportToExcel(options: { questions: string, fileName: string }): Promise<{ value: string }>;
  parseCdapDocument(options: { filePath: string }): Promise<{ value: string }>;
  parseSyllabusDocument(options: { filePath: string }): Promise<{ value: string }>;
  executeSqliteQuery(options: { query: string, params: string }): Promise<{ value: string }>;
  dispatchApiRequest(options: { method: string, path: string, body?: any }): Promise<{ value: string }>;
}

const PythonBridge = registerPlugin<PythonBridgePlugin>('PythonBridge');

export const chaquopyBridge = {
  async dispatchApiRequest(method: string, path: string, body?: any) {
    if (!Capacitor.isNativePlatform()) {
      // Browser Fallback logic
      const response = await fetch(`http://localhost:8000/api${path}`, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined
      });
      return response.json();
    }
    const res = await PythonBridge.dispatchApiRequest({
      method,
      path,
      body: body ? JSON.stringify(body) : undefined
    });
    return JSON.parse(res.value);
  }
};
```

---

### 2. Capacitor Android Java Plugin Wrapper

The Java layer intercept the Capacitor plugin calls, loads the JVM Chaquopy environment, and dispatches tasks to separate execution worker threads:
See: [PythonBridgePlugin.java](file:///d:/QUESTION%20MIND/mobile-app/android/app/src/main/java/com/krishacademia/questionmind/PythonBridgePlugin.java)

```java
package com.krishacademia.questionmind;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import org.json.JSONException;

@CapacitorPlugin(name = "PythonBridge")
public class PythonBridgePlugin extends Plugin {
    private PythonBridge pythonBridge;

    @Override
    public void load() {
        super.load();
        pythonBridge = PythonBridge.getInstance(getContext());
    }

    @PluginMethod
    public void dispatchApiRequest(PluginCall call) {
        String method = call.getString("method");
        String path = call.getString("path");
        JSObject bodyObj = call.getObject("body", null);

        try {
            org.json.JSONObject body = bodyObj != null ? new org.json.JSONObject(bodyObj.toString()) : null;
            pythonBridge.dispatchApiRequest(method, path, body, resultJson -> {
                JSObject ret = new JSObject();
                ret.put("value", resultJson);
                call.resolve(ret);
            });
        } catch (JSONException e) {
            call.reject("Invalid JSON body provided", e);
        }
    }
}
```

---

### 3. Native JNI Bridge Invoker

The class handles initialization of the Python runtime thread and processes data parsing:
See: [PythonBridge.java](file:///d:/QUESTION%20MIND/mobile-app/android/app/src/main/java/com/krishacademia/questionmind/PythonBridge.java)

```java
package com.krishacademia.questionmind;

import android.content.Context;
import android.util.Log;
import com.chaquo.python.PyObject;
import com.chaquo.python.Python;
import com.chaquo.python.android.AndroidPlatform;
import org.json.JSONObject;
import java.util.HashMap;
import java.util.Map;

public class PythonBridge {
    private static PythonBridge instance;
    private final Context context;
    private boolean pythonReady = false;

    private PythonBridge(Context context) {
        this.context = context.getApplicationContext();
        initializePython();
    }

    public static synchronized PythonBridge getInstance(Context context) {
        if (instance == null) {
            instance = new PythonBridge(context);
        }
        return instance;
    }

    private void initializePython() {
        if (!Python.isStarted()) {
            Python.start(new AndroidPlatform(context));
            pythonReady = true;
        } else {
            pythonReady = true;
        }
    }

    public void dispatchApiRequest(String method, String path, JSONObject body, Callback callback) {
        new Thread(() -> {
            try {
                if (!pythonReady) throw new RuntimeException("Python runtime not initialized");
                Python py = Python.getInstance();
                PyObject pyObject = py.getModule("mobile_bridge");
                Map<String, Object> bodyMap = body != null ? parseJSONObject(body) : null;

                PyObject result = pyObject.callAttr("dispatch_request", method, path, bodyMap);
                callback.onResult(result.toString());
            } catch (Exception e) {
                callback.onResult("{\"success\":false,\"error\":\"" + e.getMessage() + "\"}");
            }
        }).start();
    }

    public interface Callback {
        void onResult(String jsonString);
    }
}
```

---

### 4. Embedded Python Dispatch Router

The Python entry module invokes the FastAPI app programmatically using the `fastapi.testclient.TestClient` class:
See: [mobile_bridge.py](file:///d:/QUESTION%20MIND/mobile-app/android/app/src/main/python/mobile_bridge.py)

```python
import json
import base64
from fastapi.testclient import TestClient
from main import app

client = TestClient(app)

def dispatch_request(method, path, body):
    try:
        headers = {}
        data = None
        if body and isinstance(body, dict):
            if "__bridge_headers" in body:
                headers = body.get("__bridge_headers", {})
                data = body.get("data")
            else:
                data = body

        req_kwargs = {"headers": headers}
        
        # Check if the payload is a PDF or other file upload
        files = None
        if data and isinstance(data, dict) and data.get("__is_file_upload"):
            filename = data.get("filename")
            base64_content = data.get("content")
            file_bytes = base64.b64decode(base64_content)
            files = {"file": (filename, file_bytes)}
            data = None

        if files:
            req_kwargs["files"] = files
        elif method.upper() in ["GET", "DELETE"]:
            req_kwargs["params"] = data
        else:
            req_kwargs["json"] = data
            
        full_path = "/api" + path if not path.startswith("/api") else path
            
        if method.upper() == "GET":
            response = client.get(full_path, **req_kwargs)
        elif method.upper() == "POST":
            response = client.post(full_path, **req_kwargs)
        elif method.upper() == "PUT":
            response = client.put(full_path, **req_kwargs)
        elif method.upper() == "DELETE":
            response = client.delete(full_path, **req_kwargs)
            
        if response.status_code >= 400:
            return json.dumps({"success": False, "error": response.text})
            
        content_type = response.headers.get("content-type", "")
        if "application/json" not in content_type:
            b64_content = base64.b64encode(response.content).decode("utf-8")
            return json.dumps({
                "success": True,
                "data": {
                    "__is_binary": True,
                    "content": b64_content,
                    "content_type": content_type
                }
            })
            
        return json.dumps({"success": True, "data": response.json()})
    except Exception as e:
        return json.dumps({"success": False, "error": str(e)})
```

---

## 🛠️ Build Gradle Configurations & NDK Architecture

Chaquopy uses the Android Native Development Kit (NDK) to compile compiled Python libraries (`.so` executables) on native platforms.

### 1. Application Build Script
See: [build.gradle](file:///d:/QUESTION%20MIND/mobile-app/android/app/build.gradle)

```groovy
apply plugin: 'com.android.application'
apply plugin: 'com.chaquo.python'

android {
    compileSdkVersion 34

    defaultConfig {
        applicationId "com.krishacademia.questionmind"
        minSdkVersion 22
        targetSdkVersion 34
        versionCode 1
        versionName "2.0.0"

        testInstrumentationRunner "androidx.test.runner.AndroidJUnitRunner"
        
        ndk {
            abiFilters "armeabi-v7a", "arm64-v8a", "x86", "x86_64"
        }

        python {
            version "3.11"
            
            pip {
                install "pydantic==2.5.3"
                install "email-validator==2.1.0"
                install "pg8000==1.30.3"
                install "httpx==0.26.0"
                install "json_repair==0.25.0"
                install "psutil==5.9.8"
                install "openpyxl==3.1.2"
                install "sqlalchemy==2.0.23"
            }
        }
    }
}
```

---

## 🔒 Custom API Key & Model Selection Architecture

The **AI Settings** feature allows administrators to input custom API keys, fetch their supported model lists, select a primary model, and run inferences using the custom credentials.

```mermaid
sequenceDiagram
    autonumber
    participant UI as Settings.tsx
    participant Store as settingsStore.ts
    participant API as aiSettingsApi.ts
    participant PythonRouter as ai_settings.py
    participant LLMApi as LLM Endpoint (Groq/Cerebras/NIM)

    UI->>UI: User enters API Key and clicks "Test Key"
    UI->>API: Calls testAPIKey(provider, key)
    API->>PythonRouter: Posts key payload to /api/ai-settings/test-key
    PythonRouter->>LLMApi: GET /v1/models (with Auth header)
    LLMApi-->>PythonRouter: Returns HTTP 200 + List of Models
    PythonRouter-->>API: Returns success=True + Model IDs Array
    API-->>UI: Forwards success response + Models List
    UI->>UI: Renders "Select Model" dropdown
    UI->>Store: User selects model -> calls setCustomModel(provider, model)
    Store->>Store: Persists settings in localStorage
```

### 1. Payload Mapping inside generate Endpoint

When a generation is initiated, the selected preferences are extracted from the local store and passed in the payload request:
See: [QuestionBanks.tsx](file:///d:/QUESTION%20MIND/mobile-app/src/pages/QuestionBanks.tsx)

```typescript
const buildGeneratePayload = (syllabus: Syllabus) => {
  const { preferredProvider, customKeys, customModels, useLocalModels } = useAISettingsStore.getState();
  
  return {
    subject_id: selectedSubjectId,
    syllabus_id: syllabus.id,
    custom_parts: localParts,
    selected_unit_ids: selectedUnitIds,
    include_answers: includeAnswers,
    
    // Custom AI Configurations
    preferred_provider: preferredProvider, // "backend" | "custom" | "local"
    custom_keys: customKeys,               // { "groq": "...", "cerebras": "..." }
    custom_models: customModels,           // { "groq": "llama-3.3-70b-versatile", ... }
    use_local_models: useLocalModels       // boolean flag
  };
};
```

### 2. Request Handling and Dynamic Instantiation

In `question_bank.py` Router, the FastAPI handler intercepts this custom configuration and instantiates a request-scoped `AIService`:
See: [question_bank.py](file:///d:/QUESTION%20MIND/mobile-app/android/app/src/main/python/routers/question_bank.py)

```python
# Inside routers/question_bank.py
@router.post("/generate")
async def generate_questions(data: GenerateQuestionsRequest, db: Session = Depends(get_db)):
    request_ai_service = AIService(
        preferred_provider=data.preferred_provider,
        custom_keys=data.custom_keys,
        custom_models=data.custom_models,
        use_local_models=bool(data.use_local_models)
    )
    
    questions = await request_ai_service.generate_full_question_bank(
        syllabus_units=selected_units,
        parts=parts_data,
        subject_name=subject.name,
        cdap_units=cdap_units,
        include_answers=data.include_answers,
    )
```

---

## 📴 Offline Local Gemma Model Inference Guide

For generating questions without an internet connection, the system utilizes local **Gemma 2B** weights packed into a quantized formats (`.gguf` or similar mobile-optimized framework) running locally on the device hardware.

### 1. Requirements Matrix

| Parameter | Minimum Requirement | Recommended | Details |
| :--- | :--- | :--- | :--- |
| **Available RAM** | `3 GB` Free RAM | `4.5+ GB` | Allocates ~1.8GB for the weights buffer. Low RAM triggers OOM crashes. |
| **Storage Space** | `2.5 GB` Free Storage | `5 GB` | Downloads and extracts the 2.2GB model weights archive. |
| **CPU Architecture** | `ARM64-v8a` (64-bit) | `ARM64-v8a` with NEON | Quantized operators require 64-bit register support. |

### 2. Handling Models inside local_model_service.py
See: [local_model_service.py](file:///d:/QUESTION%20MIND/mobile-app/android/app/src/main/python/services/local_model_service.py)

```python
class LocalModelService:
    SUPPORTED_MODELS = {
        "gemma2b": {
            "name": "Gemma 2B",
            "memory_required_mb": 2048,
            "storage_required_mb": 2048,
            "supported_platforms": ["android", "web"],
            "description": "Lightweight, optimized for local offline educational Q&A"
        }
    }

    async def is_available(self) -> bool:
        if self.platform != "android":
            return False

        try:
            from android_service import check_model_downloaded
            return await check_model_downloaded(self.model_name)
        except ImportError:
            return False

    async def generate(self, prompt: str) -> Dict[str, Any]:
        """Runs offline quantized compilation using native C/C++ libraries wrapper via Java"""
        if self.platform == "android":
            from android_service import generate_with_local_model
            result = await generate_with_local_model(self.model_name, prompt)
            return result
        else:
            raise Exception("Local model runtime only available on Android platform")
```

---

## 💾 Native Downloader & Interceptor Flow

Standard web file browsers trigger downloads using temporary `Blob` URLs (`blob:http://...`). Because native web containers (WebView) cannot process Blob protocols natively, the application uses an anchor-click interceptor pattern.

```mermaid
sequenceDiagram
    autonumber
    participant UI as React UI Component
    participant Interceptor as HTMLAnchorElement.click()
    participant API as api.ts (downloadExcel)
    participant FS as Capacitor Filesystem
    participant Notification as Capacitor Local Notifications
    participant Opener as FileOpener Plugin

    UI->>Interceptor: User clicks "Download Question Bank"
    Note over Interceptor: Intercepts blob: URL
    Interceptor->>API: Extracts Blob data & calls downloadExcel(blob, filename)
    API->>API: Converts Blob stream to Base64 data string
    API->>FS: Writes file to Directory.Documents
    FS-->>API: Returns file URI (e.g. file:///...)
    API->>Notification: Schedules Notification (with filePath extra)
    Note over UI: User taps the push notification
    Notification->>Opener: Invokes openFile(filePath, mimeType)
    Opener->>Opener: Launches Excel viewer application
```

---

## 📂 Detailed Code Directory Mappings

```text
QUESTION MIND/
├── MOBILE_APP_GUIDE.md               # Quick execution instructions
├── README.md                          # Global web/system configuration index
├── mobile-app/                        # Primary mobile app workspace root
│   ├── capacitor.config.ts            # Capacitor native shell configurations
│   ├── package.json                   # JS scripts and dependency declarations
│   ├── vite.config.ts                 # React assembly toolchains configs
│   ├── tailwind.config.js             # Layout styles tokens configs
│   ├── index.html                     # WebView index landing shell
│   │
│   ├── src/                           # Mobile Frontend Source Code
│   │   ├── App.tsx                    # Routes list and downloader intercepts
│   │   ├── main.tsx                   # Mounting framework bootstrap entry
│   │   ├── index.css                  # Global styles sheets and components
│   │   │
│   │   ├── assets/                    # Graphic media assets directories
│   │   │   └── Saraswathi Devi .mp3   # Devotional welcome media track
│   │   │
│   │   ├── components/                # Modular UI components
│   │   │   ├── Layout.tsx             # Navigation drawer and header wrapper
│   │   │   ├── ProviderSelector.tsx   # AI generation settings radio targets
│   │   │   └── SaraswathiIntro.tsx    # Devotional intro video landing screen
│   │   │
│   │   ├── lib/                       # JavaScript utility and API layers
│   │   │   ├── api.ts                 # Native dispatch mock mapping Axios
│   │   │   ├── chaquopyBridge.ts      # Native Capacitor bridge wrapper
│   │   │   ├── settingsStore.ts       # Zustand store managing custom key configurations
│   │   │   └── aiSettingsApi.ts       # API wrapper targeting AI settings routers
│   │   │
│   │   └── pages/                     # Page routes components
│   │       ├── Login.tsx              # Authentication entry
│   │       ├── Dashboard.tsx          # Non-admin main workspace
│   │       ├── Settings.tsx           # AI Settings interface page
│   │       └── QuestionBanks.tsx      # Main blueprints and generator workspace
│   │
│   └── android/                       # Native Android Project
│       ├── build.gradle               # Global compiler parameters
│       ├── app/
│       │   ├── build.gradle           # Application compilation configurations
│       │   └── src/main/
│       │       ├── AndroidManifest.xml # Permissions configurations declarations
│       │       │
│       │       ├── java/              # Java Native Plugins Bridge wrappers
│       │       │   └── com/...
│       │       │       └── PythonBridge.java # Maps JS requests to Python
│       │       │
│       │       └── python/            # Embedded Python API Backend
│       │           ├── .env           # Key configurations and database links
│       │           ├── main.py        # Local FastAPI application entry point
│       │           ├── database.py    # Local database engines using pg8000
│       │           │
│       │           ├── routers/       # API routers list
│       │           │   ├── auth.py    # Login validation endpoints
│       │           │   ├── ai_settings.py # Key validation and capabilities
│       │           │   └── question_bank.py # Generates and processes blueprints
│       │           │
│       │           └── services/      # Python core processing logic
│       │               ├── ai_service.py # Prompt building and LLM fallback handling
│       │               ├── local_model_service.py # Offline Gemma inference pipeline
│       │               └── excel_service.py # Compiles raw lists to spreadsheet cells
```

---

## 🧪 Comprehensive QA Verification Suite

Follow these copy-pasteable test cases to verify the mobile deployment features.

### Test Case 1: Interface Routing & Settings Access
*   **Objective**: Verify that the AI Settings link renders correctly in the layout sidebar drawer and navigates to the Settings page.
*   **Setup**: Launch the application either on an emulator or a connected physical phone. Log in using standard credentials.
*   **Execution Steps**:
    1. Once the dashboard loads, tap the **Menu** icon on the top left of the header bar to open the sidebar.
    2. Verify that **AI Settings** is visible right above the **Logout** button, styled with a pink-to-purple gradient.
    3. Tap **AI Settings**.
    4. Verify that the screen transitions to the settings interface.
*   **Expected Outcome**: The AI Settings page loads immediately, displaying the **Question Generation Provider** configurations.

---

### Test Case 2: Custom Key Validation & Model Selection
*   **Objective**: Verify that inputting a custom API key triggers model validation on the backend and displays the selected model.
*   **Setup**: Open the AI Settings page. Locate the **Use Custom API Key** option in the radio list.
*   **Execution Steps**:
    1. Select the **Use Custom API Key** radio option.
    2. Locate the **Key Source** selection next to Groq, and change the source from *System Key* to **Custom API Key**.
    3. Enter a valid Groq API key in the input box.
    4. Tap the **Test Key** button.
    5. Wait for the loading status to clear.
*   **Expected Outcome**:
    *   The status message displays "Key Validated" in a green layout.
    *   A dropdown named "Select Model for Groq" appears containing a list of Groq models (e.g., `llama-3.3-70b-versatile`, `mixtral-8x7b-32768`).
    *   Selecting a model updates the value in the dropdown, which is persisted.

---

### Test Case 3: Quantized Gemma Offline Verification
*   **Objective**: Verify that the system detects local device resources and lists Gemma compatibility.
*   **Setup**: Open the Settings page, navigate to the **Advanced** tab.
*   **Execution Steps**:
    1. Verify the status displays *Device Supports Local Models* alongside your device's available memory.
    2. Under the *Local Models* card, toggle the **Enable** checkbox.
    3. Under the list of available models, verify **Gemma 2B (Google)** is listed with its memory and storage requirements.
    4. Tap **Download**.
*   **Expected Outcome**: The interface initiates downloading, showing progress. If offline, the generation fallback automatically defaults to the downloaded model.

---

### Test Case 4: Native Download Interception & Excel Creation
*   **Objective**: Verify that generating a question bank intercepts the Blob URL and triggers local filesystem save.
*   **Setup**: Select a subject and generate a new Question Bank.
*   **Execution Steps**:
    1. Once generated, tap the **Download** option next to the Question Bank.
    2. Watch the status bar of your phone.
    3. Wait for the push notification: *Question Bank Exported - Successfully exported to Documents*.
    4. Tap the notification.
*   **Expected Outcome**: The device triggers the system viewer, launching a viewer app (like Microsoft Excel or Google Sheets) displaying the compiled question sheet.

---

### Test Case 5: Devotional Video Playback Check
*   **Objective**: Verify that the introductory devotional screen correctly loads and plays back the media assets bundled within the app workspace.
*   **Setup**: Force close the application on the mobile phone, then launch it from a clean state.
*   **Execution Steps**:
    1. Verify that upon application boot, the landing layout launches the devotional video player.
    2. Tap the video screen to verify pause, play, and forward controls function.
    3. Verify that the video playback triggers the Saraswathi Devi devotional background audio track.
    4. Allow the video to play to completion, or click the **Skip** button in the layout header.
*   **Expected Outcome**: Completion of video playback or clicking skip smoothly redirects the user to the default application Login screen layout.

---

### Test Case 6: Document Parsing Integration (CDAP & Syllabus)
*   **Objective**: Verify that uploading syllabus and CDAP files transfers them correctly over the base64 JNI bridge to the Python backend services.
*   **Setup**: Navigate to the **Syllabus** or **CDAP** mapping configuration page. Ensure a test PDF file exists on the mobile device's storage.
*   **Execution Steps**:
    1. Tap the **Upload Document** target area.
    2. Select the system file picker and choose the target PDF document.
    3. Tap **Upload and Parse**.
    4. Monitor the console logs in the local CLI for file transfer progress.
*   **Expected Outcome**: The progress status displays successful file extraction. Parsed items (such as units, chapters, and hours allocation metrics) populate in the UI tables.

---

### Test Case 7: Network Loss State Transition
*   **Objective**: Verify that loss of network connectivity is detected by the application and restricts actions to offline capabilities.
*   **Setup**: Connect the phone, open the dashboard, then toggle the device **Airplane Mode** to **On**.
*   **Execution Steps**:
    1. Trigger a network-dependent action (e.g. database search or syllabus sync).
    2. Observe the interface reaction.
    3. Toggle the network connection back to **On** (disable Airplane Mode).
*   **Expected Outcome**:
    *   Toggling offline triggers a header alert: *"No Internet Connection - Offline mode enabled"*.
    *   Attempts to invoke remote calls fail gracefully without freezing the UI.
    *   Restoring connectivity automatically hides the warning alert.

---

### Test Case 8: Custom Provider API Key Fallback
*   **Objective**: Verify that when a custom provider (e.g. Cerebras) has a key defined but the remote endpoint fails, the system cascades fallback calls correctly.
*   **Setup**: Input an invalid custom API key for the selected provider inside the Settings page and select that provider.
*   **Execution Steps**:
    1. Navigate to the **Question Banks** page.
    2. Select a Subject and Unit, and click **Generate**.
    3. Monitor the background logs for error tracking.
*   **Expected Outcome**: The backend captures the authorization failure from the invalid custom key, reports the error code, and falls back gracefully, preserving UI stability.

---

### Test Case 9: Persistence of Client Preferences
*   **Objective**: Verify that chosen configurations are saved across application sessions.
*   **Setup**: Open the Settings page, select **Groq** with a custom API key, and set a specific model.
*   **Execution Steps**:
    1. Close the app entirely using the mobile device's active task switcher.
    2. Relaunch the application.
    3. Navigate to **AI Settings** and inspect the inputs.
*   **Expected Outcome**: All preferences, including selected providers, custom API keys, model selections, and local settings, are loaded from the persisted store.

---

### Test Case 10: Multi-Part Blueprint Configuration Generation
*   **Objective**: Verify that question bank requests requesting multi-part blueprints (Part A, Part B, Part C) with differing marks are parsed correctly.
*   **Setup**: Navigate to the generation options under **Question Banks**.
*   **Execution Steps**:
    1. Click **Add Part** to configure three distinct question groups:
       * Part A: 5 Questions (2 Marks each)
       * Part B: 3 Questions (5 Marks each)
       * Part C: 1 Question (10 Marks each)
    2. Tap **Generate**.
*   **Expected Outcome**: The local Python generator compiles separate request structures, structures Q&A items, and formats the output into separate tabs within the resulting Excel workbook.

---

## 🛠️ Troubleshooting & Build Errors FAQ

### Q1: Chaquopy fails to sync with error: `Chaquopy requires Python to be installed on your build machine`
*   **Cause**: The Android compiler Gradle daemon cannot find your workstation's local Python executable path.
*   **Resolution**: Specify the exact location of your Python binary inside the project's native properties definition. Create or edit `mobile-app/android/local.properties` and add:
    ```properties
    # In Windows environment:
    chaquopy.python=C:/Users/<YOUR_USERNAME>/AppData/Local/Programs/Python/Python311/python.exe

    # In macOS environment:
    chaquopy.python=/opt/homebrew/bin/python3
    ```
    *Note: Always use forward slashes (`/`) for paths inside properties files, even on Windows.*

---

### Q2: Android Gradle compilation fails with: `Minimum SDK mismatch: Plugin requires 22, compile target is 21`
*   **Cause**: The native Android application configures a minimum SDK target lower than what is required by Capacitor or Chaquopy.
*   **Resolution**: Open `mobile-app/android/app/build.gradle` and verify that the target properties match:
    ```groovy
    defaultConfig {
        minSdkVersion 22
        targetSdkVersion 34
    }
    ```

---

### Q3: The application launches with a blank white screen and freezes
*   **Cause**: The local Python FastAPI backend failed to initialize, blocking the WebView bundle from executing.
*   **Resolution**: Inspect the native application output stream using Android Studio Logcat. Add this search filter to isolate python logs:
    ```text
    Tag: "python.stdout" or "python.stderr"
    ```
    Common root causes include:
    *   Syntax errors in python files modified on the workstation.
    *   Missing `.env` configuration file inside `android/app/src/main/python/`.
    *   Missing required pip packages inside `android/app/build.gradle`.

---

### Q4: Database queries fail with: `Database Connection Timeout`
*   **Cause**: The mobile phone is blocked from communicating with the cloud PostgreSQL server.
*   **Resolution**:
    1. Ensure the phone has active Wi-Fi or mobile data access.
    2. Confirm that the cloud database host (Neon or Aiven) does not have IP white-listing policies that exclude your current connection.
    3. Ensure the connection protocol starts with `postgresql+pg8000://` and ends with `?ssl=true`.

---

### Q5: Running local quantized ML models throws `Out Of Memory (OOM)` crashes
*   **Cause**: The hardware does not have enough free RAM to allocate the model weights.
*   **Resolution**:
    1. Close all resource-heavy background applications running on the mobile phone.
    2. Ensure that the selected quantized weights do not exceed 2.2GB.
    3. Increase the virtual memory heap constraints inside the Android configuration if necessary.

---

### Q6: Gradle sync fails with: `Unable to find method 'org.gradle.api.tasks.TaskInputs.property'`
*   **Cause**: Version mismatch between the Android Gradle plugin and the installed Gradle wrapper version.
*   **Resolution**: Check `mobile-app/android/build.gradle` and make sure your Gradle version matches your compiler platform. Update `gradle-wrapper.properties` to use a supported version (e.g. `gradle-8.2-all.zip`).

---

### Q7: Android Studio Gradle build fails with a connection timeout downloading pip packages
*   **Cause**: The workstation has proxy configurations or local security software blocking the PyPI repository download channels.
*   **Resolution**: Set the pip index option inside `android/app/build.gradle` or pass proxy configurations to the pip installer inside the python build block:
    ```groovy
    python {
        pip {
            options "--index-url", "https://pypi.org/simple"
            options "--trusted-host", "pypi.org"
        }
    }
    ```

---

### Q8: Custom API Key validation returns: `HTTP 401 Unauthorized` or `Invalid API Key`
*   **Cause**: The custom token entered has expired, or is missing permissions to list models from the provider's endpoint.
*   **Resolution**: Validate the API key using a terminal tool (curl) on your workstation:
    ```bash
    # Groq API Validation check
    curl -X GET "https://api.groq.com/openai/v1/models" \
         -H "Authorization: Bearer <YOUR_API_KEY>"
    ```

---

### Q9: Capacitor run command returns: `No device or emulator discovered`
*   **Cause**: The workstation's ADB utility cannot find the phone or simulator instance.
*   **Resolution**:
    1. Unplug and reconnect the USB connection.
    2. Toggle Developer Options > USB Debugging off and then back on.
    3. Change the USB connection mode from *Charging Only* to *File Transfer / Android Auto*.

---

### Q10: Excel document download fails to open with: `File corrupt or unsupported format`
*   **Cause**: Base64 serialization or write operations failed during JNI data transfer.
*   **Resolution**: Review `excel_service.py` to ensure the openpyxl compiler writes a complete, uncorrupted byte stream. Check memory footprint allocations during execution.

---

### Q11: Changes to React components do not reflect on screen when using Live Reload
*   **Cause**: The web WebView container cached historical file states, or lost socket connectivity to the host Vite server.
*   **Resolution**: Press the **R** key twice inside your workstation CLI terminal to force a hard reload of the container assets, or restart the run command.

---

### Q12: File upload of Syllabus returns: `Maximum payload limit exceeded`
*   **Cause**: The base64 file data string exceeds the memory limit of the Capacitor plugin communication channel.
*   **Resolution**: Optimize the PDF file sizes before upload. Compress heavy images contained in the document.

---

### Q13: Excel generation fails with error: `module 'openpyxl' has no attribute 'Workbook'`
*   **Cause**: The openpyxl library did not install correctly inside the Python container.
*   **Resolution**: Perform a clean build. In your terminal:
    ```bash
    cd mobile-app/android
    ./gradlew clean
    ```
    Then, rerun compilation to trigger dependency checks.

---

### Q14: Mobile app crashes upon calling `os.environ` or environment variables
*   **Cause**: Key configurations were not read because of path issues.
*   **Resolution**: Always load configuration files using directory-safe path references relative to the python entry point:
    ```python
    import os
    BASE_DIR = os.path.dirname(os.path.abspath(__file__))
    ENV_PATH = os.path.join(BASE_DIR, ".env")
    ```

---

### Q15: Download push notification is clicked but nothing happens
*   **Cause**: The mobile phone is missing an application associated with Excel format extensions (`.xlsx`).
*   **Resolution**: Install Microsoft Excel, Google Sheets, or a PDF reader app on your test device.

---

### Q16: Local model downloads fail with network timeout errors
*   **Cause**: Downloading large models (~2GB) over slow connections can trigger timeout limits.
*   **Resolution**: Connect the device to a fast Wi-Fi network and keep the application active in the foreground while downloading to prevent the OS from suspending the download thread.

---

### Q17: Background Python services are killed by the OS
*   **Cause**: Aggressive battery saver software on Chinese Android interfaces (MIUI, HyperOS, ColorOS) kills long-running threads.
*   **Resolution**: Open system App Info > Battery settings, and set battery optimization for "Question Mind" to **No Restrictions**.

---

### Q18: Changes made inside python scripts do not update during live reload
*   **Cause**: Live Reload syncs JS/CSS files, but Python assets are built directly into the APK.
*   **Resolution**: Recompile the native assets by executing:
    ```bash
    npx cap sync android
    npx cap run android
    ```

---

### Q19: SSL errors when connecting to the database: `SSL validation failed`
*   **Cause**: The pg8000 driver cannot find the CA root certificate store on the phone.
*   **Resolution**: Set the SSL parameter to connect without checking local certificates if using a safe cloud connection, or bundle your certificate.

---

### Q20: SQLite operations return: `database is locked`
*   **Cause**: Multiple threads attempting write actions on the local SQLite DB simultaneously.
*   **Resolution**: Configure write timeouts and enable WAL mode (Write-Ahead Logging) inside your SQLite initialization files:
    ```python
    engine = create_engine("sqlite:///local.db", connect_args={"timeout": 15})
    ```

---

## 📊 Appendix: Performance Optimization & Best Practices

To ensure high performance and a smooth user experience, keep the following guidelines in mind:

### 1. Battery Consumption and Port Safety
*   **No Active HTTP Listening Ports**: The app does not bind to ports like 8000 on the device. All data is passed directly through JNI bridge functions, which eliminates ports vulnerabilities and saves battery.
*   **Close Database Sessions**: Ensure all SQLAlchemy sessions are closed after a request finishes by using context managers or dependency injection helpers.
*   **Quantized Inferences**: Run heavy AI inference (Gemma) inside worker threads, avoiding blocking the main user interface loop.

### 2. Memory Footprint Management
*   **Garbage Collection**: Python objects compiled in Chaquopy should be cleared from memory when no longer needed. Use standard python variables management to prevent leaks.
*   **Vite Chunk Sizes**: Keep chunk sizes low by using dynamic loading and code-splitting patterns on heavy React pages (like `Patterns.tsx`).
*   **Asset Compression**: Compress UI media assets to keep the final APK size under 60MB (excluding local model files).

---

Thank you for developing and maintaining the **Question Mind Mobile** environment. For further assistance or codebase questions, refer to the comments in the source files.
