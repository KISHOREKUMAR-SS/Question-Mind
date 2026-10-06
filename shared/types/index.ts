// Subject Types
export enum SubjectType {
  PRBL = 'PRBL',   // Project Based Learning (No exams)
  PBML = 'PBML',   // Problem Based Learning (Part A, B, C)
  THEORY = 'THEORY', // Theory (Part A, B)
  TCPR = 'TCPR',   // Theory Cum Project Report (Part A, B)
}

// User Roles
export enum UserRole {
  HOD = 'HOD',
  FACULTY = 'FACULTY',
}

// Bloom's Taxonomy Levels
export enum BloomLevel {
  REMEMBER = 'REMEMBER',
  UNDERSTAND = 'UNDERSTAND',
  APPLY = 'APPLY',
  ANALYZE = 'ANALYZE',
  EVALUATE = 'EVALUATE',
  CREATE = 'CREATE',
}

// Question Part
export enum QuestionPart {
  PART_A = 'PART_A',
  PART_B = 'PART_B',
  PART_C = 'PART_C',
}

// Question Bank Status
export enum QuestionBankStatus {
  DRAFT = 'DRAFT',
  PENDING_APPROVAL = 'PENDING_APPROVAL',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
}

// Interfaces
export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  department: string;
  createdAt: Date;
}

export interface Subject {
  id: string;
  name: string;
  code: string;
  type: SubjectType;
  department: string;
  semester: number;
  hodId: string;
}

export interface SyllabusUnit {
  unitNumber: number;
  title: string;
  topics: string[];
  coMapping?: string[];
}

export interface Syllabus {
  id: string;
  subjectId: string;
  units: SyllabusUnit[];
  academicYear: string;
}

export interface QuestionPatternPart {
  part: QuestionPart;
  marks: number;
  questionCount: number;
  bloomLevels: BloomLevel[];
  description: string;
}

export interface QuestionPattern {
  id: string;
  subjectId: string;
  parts: QuestionPatternPart[];
  isActive: boolean;
}

export interface Question {
  id: string;
  part: QuestionPart;
  marks: number;
  bloomLevel: BloomLevel;
  topic: string;
  unit: number;
  questionText: string;
  expectedAnswer?: string;
  coMapping?: string;
}

export interface QuestionBank {
  id: string;
  subjectId: string;
  syllabusId: string;
  generatedBy: string;
  questions: Question[];
  excelPath?: string;
  status: QuestionBankStatus;
  createdAt: Date;
  updatedAt: Date;
}

// API DTOs
export interface LoginDto {
  email: string;
  password: string;
}

export interface RegisterDto {
  email: string;
  password: string;
  name: string;
  role: UserRole;
  department: string;
}

export interface GenerateQuestionsDto {
  subjectId: string;
  syllabusId: string;
  patternId: string;
}

export interface AuthResponse {
  accessToken: string;
  user: User;
}

// Subject Type Configuration
export const SUBJECT_TYPE_CONFIG: Record<SubjectType, {
  hasExam: boolean;
  parts: QuestionPart[];
  description: string;
}> = {
  [SubjectType.PRBL]: {
    hasExam: false,
    parts: [],
    description: 'Project Based Learning - No Exams',
  },
  [SubjectType.PBML]: {
    hasExam: true,
    parts: [QuestionPart.PART_A, QuestionPart.PART_B, QuestionPart.PART_C],
    description: 'Problem Based Learning - Part A, B, C',
  },
  [SubjectType.THEORY]: {
    hasExam: true,
    parts: [QuestionPart.PART_A, QuestionPart.PART_B],
    description: 'Theory - Part A, B',
  },
  [SubjectType.TCPR]: {
    hasExam: true,
    parts: [QuestionPart.PART_A, QuestionPart.PART_B],
    description: 'Theory Cum Project Report - Part A, B',
  },
};

// Default Bloom Level Mapping
export const BLOOM_LEVEL_MAPPING: Record<QuestionPart, BloomLevel[]> = {
  [QuestionPart.PART_A]: [BloomLevel.REMEMBER, BloomLevel.UNDERSTAND],
  [QuestionPart.PART_B]: [BloomLevel.UNDERSTAND, BloomLevel.APPLY, BloomLevel.ANALYZE],
  [QuestionPart.PART_C]: [BloomLevel.ANALYZE, BloomLevel.EVALUATE, BloomLevel.CREATE],
};

// Default Marks Configuration
export const DEFAULT_MARKS: Record<QuestionPart, number> = {
  [QuestionPart.PART_A]: 2,
  [QuestionPart.PART_B]: 13,
  [QuestionPart.PART_C]: 15,
};
