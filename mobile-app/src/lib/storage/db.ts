/**
 * IndexedDB Storage Layer for Question Mind Mobile App
 * Stores: Question Banks, Subjects, Syllabuses, Questions, Uploads, Staff Assignments
 */

const DB_NAME = "QuestionMindDB";
const DB_VERSION = 1;

interface Subject {
  id: string;
  code: string;
  name: string;
  semester: number;
  department: string;
  createdAt: number;
}

interface Syllabus {
  id: string;
  subjectId: string;
  content: string;
  units: any[];
  uploadedAt: number;
}

interface Question {
  id: string;
  questionBankId: string;
  question: string;
  answer: string;
  unit: number;
  btl: string;
  marks: number;
  isMCQ?: boolean;
  options?: Record<string, string>;
  correctOption?: string;
  cdap_part?: number;
}

interface QuestionBank {
  id: string;
  subjectId: string;
  title: string;
  status: "DRAFT" | "PENDING_APPROVAL" | "APPROVED" | "PUBLISHED";
  createdAt: number;
  updatedAt: number;
  parts: Record<string, Question[]>;
  metadata?: Record<string, any>;
}

interface Upload {
  id: string;
  subjectId: string;
  type: "SYLLABUS" | "CDAP" | "QUESTION_BANK";
  fileName: string;
  fileData: Blob;
  uploadedAt: number;
  processedData?: any;
}

export class QuestionMindDB {
  private db: IDBDatabase | null = null;

  async init(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => {
        reject(new Error("Failed to open IndexedDB"));
      };

      request.onsuccess = (event: Event) => {
        this.db = (event.target as IDBOpenDBRequest).result;
        console.log("[DB] IndexedDB initialized successfully");
        resolve();
      };

      request.onupgradeneeded = (event: IDBVersionChangeEvent) => {
        const db = (event.target as IDBOpenDBRequest).result;

        // Subjects
        if (!db.objectStoreNames.contains("subjects")) {
          const store = db.createObjectStore("subjects", { keyPath: "id" });
          store.createIndex("code", "code", { unique: true });
          store.createIndex("semester", "semester", { unique: false });
        }

        // Syllabuses
        if (!db.objectStoreNames.contains("syllabuses")) {
          const store = db.createObjectStore("syllabuses", { keyPath: "id" });
          store.createIndex("subjectId", "subjectId", { unique: false });
        }

        // Question Banks
        if (!db.objectStoreNames.contains("questionBanks")) {
          const store = db.createObjectStore("questionBanks", { keyPath: "id" });
          store.createIndex("subjectId", "subjectId", { unique: false });
          store.createIndex("status", "status", { unique: false });
        }

        // Questions
        if (!db.objectStoreNames.contains("questions")) {
          const store = db.createObjectStore("questions", { keyPath: "id" });
          store.createIndex("questionBankId", "questionBankId", { unique: false });
          store.createIndex("btl", "btl", { unique: false });
        }

        // Uploads
        if (!db.objectStoreNames.contains("uploads")) {
          const store = db.createObjectStore("uploads", { keyPath: "id" });
          store.createIndex("subjectId", "subjectId", { unique: false });
          store.createIndex("type", "type", { unique: false });
        }

        console.log("[DB] Object stores created");
      };
    });
  }

  // ── Subjects ──

  async addSubject(subject: Subject): Promise<string> {
    const store = this.getStore("subjects", "readwrite");
    return new Promise((resolve, reject) => {
      const request = store.add(subject);
      request.onsuccess = () => resolve(subject.id);
      request.onerror = () => reject(new Error("Failed to add subject"));
    });
  }

  async getSubject(id: string): Promise<Subject | null> {
    const store = this.getStore("subjects", "readonly");
    return new Promise((resolve, reject) => {
      const request = store.get(id);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(new Error("Failed to get subject"));
    });
  }

  async getAllSubjects(): Promise<Subject[]> {
    const store = this.getStore("subjects", "readonly");
    return new Promise((resolve, reject) => {
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(new Error("Failed to get all subjects"));
    });
  }

  async updateSubject(subject: Subject): Promise<void> {
    const store = this.getStore("subjects", "readwrite");
    return new Promise((resolve, reject) => {
      const request = store.put(subject);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(new Error("Failed to update subject"));
    });
  }

  async deleteSubject(id: string): Promise<void> {
    const store = this.getStore("subjects", "readwrite");
    return new Promise((resolve, reject) => {
      const request = store.delete(id);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(new Error("Failed to delete subject"));
    });
  }

  // ── Syllabuses ──

  async addSyllabus(syllabus: Syllabus): Promise<string> {
    const store = this.getStore("syllabuses", "readwrite");
    return new Promise((resolve, reject) => {
      const request = store.add(syllabus);
      request.onsuccess = () => resolve(syllabus.id);
      request.onerror = () => reject(new Error("Failed to add syllabus"));
    });
  }

  async getSyllabusForSubject(subjectId: string): Promise<Syllabus | null> {
    const store = this.getStore("syllabuses", "readonly");
    const index = store.index("subjectId");
    return new Promise((resolve, reject) => {
      const request = index.getAll(subjectId);
      request.onsuccess = () => {
        const results = request.result;
        resolve(results.length > 0 ? results[0] : null);
      };
      request.onerror = () => reject(new Error("Failed to get syllabus"));
    });
  }

  async updateSyllabus(syllabus: Syllabus): Promise<void> {
    const store = this.getStore("syllabuses", "readwrite");
    return new Promise((resolve, reject) => {
      const request = store.put(syllabus);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(new Error("Failed to update syllabus"));
    });
  }

  // ── Question Banks ──

  async addQuestionBank(bank: QuestionBank): Promise<string> {
    const store = this.getStore("questionBanks", "readwrite");
    return new Promise((resolve, reject) => {
      const request = store.add(bank);
      request.onsuccess = () => resolve(bank.id);
      request.onerror = () => reject(new Error("Failed to add question bank"));
    });
  }

  async getQuestionBank(id: string): Promise<QuestionBank | null> {
    const store = this.getStore("questionBanks", "readonly");
    return new Promise((resolve, reject) => {
      const request = store.get(id);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(new Error("Failed to get question bank"));
    });
  }

  async getQuestionBanksForSubject(subjectId: string): Promise<QuestionBank[]> {
    const store = this.getStore("questionBanks", "readonly");
    const index = store.index("subjectId");
    return new Promise((resolve, reject) => {
      const request = index.getAll(subjectId);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(new Error("Failed to get question banks"));
    });
  }

  async getQuestionBanksByStatus(status: string): Promise<QuestionBank[]> {
    const store = this.getStore("questionBanks", "readonly");
    const index = store.index("status");
    return new Promise((resolve, reject) => {
      const request = index.getAll(status);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(new Error("Failed to get question banks by status"));
    });
  }

  async updateQuestionBank(bank: QuestionBank): Promise<void> {
    const store = this.getStore("questionBanks", "readwrite");
    return new Promise((resolve, reject) => {
      const request = store.put(bank);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(new Error("Failed to update question bank"));
    });
  }

  async deleteQuestionBank(id: string): Promise<void> {
    const store = this.getStore("questionBanks", "readwrite");
    return new Promise((resolve, reject) => {
      const request = store.delete(id);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(new Error("Failed to delete question bank"));
    });
  }

  // ── Questions ──

  async addQuestion(question: Question): Promise<string> {
    const store = this.getStore("questions", "readwrite");
    return new Promise((resolve, reject) => {
      const request = store.add(question);
      request.onsuccess = () => resolve(question.id);
      request.onerror = () => reject(new Error("Failed to add question"));
    });
  }

  async getQuestionsForBank(bankId: string): Promise<Question[]> {
    const store = this.getStore("questions", "readonly");
    const index = store.index("questionBankId");
    return new Promise((resolve, reject) => {
      const request = index.getAll(bankId);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(new Error("Failed to get questions"));
    });
  }

  async getQuestionsByBTL(btl: string): Promise<Question[]> {
    const store = this.getStore("questions", "readonly");
    const index = store.index("btl");
    return new Promise((resolve, reject) => {
      const request = index.getAll(btl);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(new Error("Failed to get questions by BTL"));
    });
  }

  async updateQuestion(question: Question): Promise<void> {
    const store = this.getStore("questions", "readwrite");
    return new Promise((resolve, reject) => {
      const request = store.put(question);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(new Error("Failed to update question"));
    });
  }

  async deleteQuestion(id: string): Promise<void> {
    const store = this.getStore("questions", "readwrite");
    return new Promise((resolve, reject) => {
      const request = store.delete(id);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(new Error("Failed to delete question"));
    });
  }

  // ── Uploads ──

  async addUpload(upload: Upload): Promise<string> {
    const store = this.getStore("uploads", "readwrite");
    return new Promise((resolve, reject) => {
      const request = store.add(upload);
      request.onsuccess = () => resolve(upload.id);
      request.onerror = () => reject(new Error("Failed to add upload"));
    });
  }

  async getUploadsForSubject(subjectId: string, type?: string): Promise<Upload[]> {
    const store = this.getStore("uploads", "readonly");
    let request: IDBRequest<Upload[]>;

    if (type) {
      // Get by subjectId and type (using compound filter)
      const index = store.index("subjectId");
      const allUploads = await new Promise<Upload[]>((resolve, reject) => {
        const req = index.getAll(subjectId);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject();
      });
      return allUploads.filter((u) => u.type === type);
    }

    return new Promise((resolve, reject) => {
      const index = store.index("subjectId");
      request = index.getAll(subjectId);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(new Error("Failed to get uploads"));
    });
  }

  async deleteUpload(id: string): Promise<void> {
    const store = this.getStore("uploads", "readwrite");
    return new Promise((resolve, reject) => {
      const request = store.delete(id);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(new Error("Failed to delete upload"));
    });
  }

  // ── Utilities ──

  private getStore(
    storeName: string,
    mode: "readonly" | "readwrite"
  ): IDBObjectStore {
    if (!this.db) {
      throw new Error("Database not initialized");
    }
    const transaction = this.db.transaction(storeName, mode);
    return transaction.objectStore(storeName);
  }

  async clearAll(): Promise<void> {
    const stores = ["subjects", "syllabuses", "questionBanks", "questions", "uploads"];
    for (const storeName of stores) {
      const store = this.getStore(storeName, "readwrite");
      await new Promise<void>((resolve, reject) => {
        const request = store.clear();
        request.onsuccess = () => resolve();
        request.onerror = () => reject(new Error(`Failed to clear ${storeName}`));
      });
    }
    console.log("[DB] All stores cleared");
  }

  async getStorageStats(): Promise<{ used: number; available: number }> {
    if (!navigator.storage) {
      return { used: 0, available: 0 };
    }
    try {
      const estimate = await navigator.storage.estimate();
      return {
        used: estimate.usage || 0,
        available: estimate.quota || 0,
      };
    } catch {
      return { used: 0, available: 0 };
    }
  }
}

// Export singleton instance
export const db = new QuestionMindDB();
