package com.krishacademia.questionmind;

import android.content.Context;
import android.util.Log;

import com.chaquo.python.PyObject;
import com.chaquo.python.Python;
import com.chaquo.python.android.AndroidPlatform;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.Iterator;
import java.util.List;
import java.util.Map;

public class PythonBridge {
    private static final String TAG = "PythonBridge";
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
            try {
                Log.d(TAG, "Starting Python runtime with Chaquopy...");
                Python.start(new AndroidPlatform(context));
                pythonReady = true;
                Log.d(TAG, "Python runtime initialized successfully");
            } catch (Exception e) {
                Log.e(TAG, "Failed to initialize Python: " + e.getMessage(), e);
                pythonReady = false;
            }
        } else {
            pythonReady = true;
            Log.d(TAG, "Python runtime already started");
        }
    }

    private void ensurePythonReady() {
        if (!pythonReady) {
            throw new RuntimeException("Python runtime not initialized");
        }
    }

    public interface Callback {
        void onResult(String jsonString);
    }

    public void generateQuestions(String subjectId, JSONArray syllabusCoverage, JSONArray partConfigs, Callback callback) {
        new Thread(() -> {
            try {
                ensurePythonReady();
                Python py = Python.getInstance();
                PyObject pyObject = py.getModule("mobile_bridge");

                List<Object> coverage = parseJSONArray(syllabusCoverage);
                List<Object> configs = parseJSONArray(partConfigs);

                PyObject result = pyObject.callAttr("generate_questions", subjectId, coverage, configs);
                callback.onResult(result.toString());
            } catch (Exception e) {
                Log.e(TAG, "Error in generateQuestions", e);
                callback.onResult(createErrorJson(e));
            }
        }).start();
    }

    public void exportToExcel(JSONArray questions, String fileName, Callback callback) {
        new Thread(() -> {
            try {
                ensurePythonReady();
                Python py = Python.getInstance();
                PyObject pyObject = py.getModule("mobile_bridge");

                String cacheDir = context.getCacheDir().getAbsolutePath();
                String outputPath = cacheDir + "/" + fileName + ".xlsx";

                List<Object> questionsList = parseJSONArray(questions);

                PyObject result = pyObject.callAttr("export_questions_excel", questionsList, outputPath);
                callback.onResult(result.toString());
            } catch (Exception e) {
                Log.e(TAG, "Error in exportToExcel", e);
                callback.onResult(createErrorJson(e));
            }
        }).start();
    }

    public void parseCdapDocument(String filePath, Callback callback) {
        new Thread(() -> {
            try {
                ensurePythonReady();
                Python py = Python.getInstance();
                PyObject pyObject = py.getModule("mobile_bridge");

                PyObject result = pyObject.callAttr("parse_cdap_file", filePath);
                callback.onResult(result.toString());
            } catch (Exception e) {
                Log.e(TAG, "Error in parseCdapDocument", e);
                callback.onResult(createErrorJson(e));
            }
        }).start();
    }

    public void parseSyllabusDocument(String filePath, Callback callback) {
        new Thread(() -> {
            try {
                ensurePythonReady();
                Python py = Python.getInstance();
                PyObject pyObject = py.getModule("mobile_bridge");

                PyObject result = pyObject.callAttr("parse_syllabus_file", filePath);
                callback.onResult(result.toString());
            } catch (Exception e) {
                Log.e(TAG, "Error in parseSyllabusDocument", e);
                callback.onResult(createErrorJson(e));
            }
        }).start();
    }

    public void executeSqliteQuery(String query, JSONArray params, Callback callback) {
        new Thread(() -> {
            try {
                ensurePythonReady();
                Python py = Python.getInstance();
                PyObject pyObject = py.getModule("mobile_bridge");

                List<Object> paramsList = parseJSONArray(params);
                PyObject result = pyObject.callAttr("execute_sqlite_query", query, paramsList);
                callback.onResult(result.toString());
            } catch (Exception e) {
                Log.e(TAG, "Error in executeSqliteQuery", e);
                callback.onResult(createErrorJson(e));
            }
        }).start();
    }

    public void dispatchApiRequest(String method, String path, JSONObject body, Callback callback) {
        new Thread(() -> {
            try {
                ensurePythonReady();
                Python py = Python.getInstance();
                PyObject pyObject = py.getModule("mobile_bridge");

                Map<String, Object> bodyMap = body != null ? parseJSONObject(body) : null;

                PyObject result = pyObject.callAttr("dispatch_request", method, path, bodyMap);
                callback.onResult(result.toString());
            } catch (Exception e) {
                Log.e(TAG, "Error in dispatchApiRequest", e);
                callback.onResult(createErrorJson(e));
            }
        }).start();
    }

    private String createErrorJson(Exception e) {
        try {
            JSONObject obj = new JSONObject();
            obj.put("success", false);
            obj.put("error", e.getMessage() != null ? e.getMessage() : "Unknown error");
            return obj.toString();
        } catch (JSONException ex) {
            return "{\"success\":false,\"error\":\"JSON Error\"}";
        }
    }

    private List<Object> parseJSONArray(JSONArray arr) throws JSONException {
        List<Object> list = new ArrayList<>();
        for (int i = 0; i < arr.length(); i++) {
            Object value = arr.get(i);
            if (value instanceof JSONObject) {
                list.add(parseJSONObject((JSONObject) value));
            } else if (value instanceof JSONArray) {
                list.add(parseJSONArray((JSONArray) value));
            } else {
                list.add(value);
            }
        }
        return list;
    }

    private Map<String, Object> parseJSONObject(JSONObject obj) throws JSONException {
        Map<String, Object> map = new HashMap<>();
        Iterator<String> keys = obj.keys();
        while (keys.hasNext()) {
            String key = keys.next();
            Object value = obj.get(key);
            if (value instanceof JSONObject) {
                map.put(key, parseJSONObject((JSONObject) value));
            } else if (value instanceof JSONArray) {
                map.put(key, parseJSONArray((JSONArray) value));
            } else {
                map.put(key, value);
            }
        }
        return map;
    }



    public static class Companion {
        public static PythonBridge getInstance(Context context) {
            return PythonBridge.getInstance(context);
        }
    }
}
