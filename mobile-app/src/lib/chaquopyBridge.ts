import { registerPlugin } from '@capacitor/core';

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
  async generateQuestions(subjectId: string, syllabusCoverage: any[], partConfigs: any[]) {
    const res = await PythonBridge.generateQuestions({
      subjectId,
      syllabusCoverage: JSON.stringify(syllabusCoverage),
      partConfigs: JSON.stringify(partConfigs)
    });
    return JSON.parse(res.value);
  },

  async exportToExcel(questions: any[], fileName: string) {
    const res = await PythonBridge.exportToExcel({
      questions: JSON.stringify(questions),
      fileName
    });
    return JSON.parse(res.value);
  },

  async parseCdapDocument(filePath: string) {
    const res = await PythonBridge.parseCdapDocument({ filePath });
    return JSON.parse(res.value);
  },

  async parseSyllabusDocument(filePath: string) {
    const res = await PythonBridge.parseSyllabusDocument({ filePath });
    return JSON.parse(res.value);
  },

  async executeSqliteQuery(query: string, params: any[]) {
    const res = await PythonBridge.executeSqliteQuery({
      query,
      params: JSON.stringify(params)
    });
    return JSON.parse(res.value);
  },

  async dispatchApiRequest(method: string, path: string, body?: any) {
    const res = await PythonBridge.dispatchApiRequest({
      method,
      path,
      body: body ? JSON.stringify(body) : undefined
    });
    return JSON.parse(res.value);
  }
};
