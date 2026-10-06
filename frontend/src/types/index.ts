// User Types
export type UserRole = 'HOD' | 'FACULTY' | 'ADMIN';

export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  department?: string;
}

// Subject Nature Types
export type SubjectNature = 'THEORY' | 'PRBL' | 'PMBL' | 'TCPR';

export const SUBJECT_NATURE_LABELS: Record<SubjectNature, string> = {
  THEORY: 'Theory',
  PRBL: 'Project Based Learning',
  PMBL: 'Problem Based Learning',
  TCPR: 'Theory Cum Project',
};

// Bloom's Taxonomy
export type BloomLevel = 'BTL1' | 'BTL2' | 'BTL3' | 'BTL4' | 'BTL5' | 'BTL6';

export const BTL_LABELS: Record<BloomLevel, string> = {
  BTL1: 'Remember',
  BTL2: 'Understand',
  BTL3: 'Apply',
  BTL4: 'Analyze',
  BTL5: 'Evaluate',
  BTL6: 'Create',
};

export const ALL_BTL_LEVELS: BloomLevel[] = ['BTL1', 'BTL2', 'BTL3', 'BTL4', 'BTL5', 'BTL6'];

// K-Levels (Knowledge Levels — K1=BTL1, K2=BTL2, … K6=BTL6)
export type KLevel = 'K1' | 'K2' | 'K3' | 'K4' | 'K5' | 'K6';

export const K_LABELS: Record<KLevel, string> = {
  K1: 'Remember',
  K2: 'Understand',
  K3: 'Apply',
  K4: 'Analyze',
  K5: 'Evaluate',
  K6: 'Create',
};

export const ALL_K_LEVELS: KLevel[] = ['K1', 'K2', 'K3', 'K4', 'K5', 'K6'];

// Maps BTL level to its K-level equivalent
export const BTL_TO_K: Record<BloomLevel, KLevel> = {
  BTL1: 'K1', BTL2: 'K2', BTL3: 'K3', BTL4: 'K4', BTL5: 'K5', BTL6: 'K6',
};

// Part Configuration
export interface PartConfiguration {
  partName: string;
  questionCount: number;
  marksPerQuestion: number;
  totalMarks: number;
  allowedBTLLevels: BloomLevel[];
  defaultBTL?: BloomLevel;
  description?: string;
  mcqCount?: number;
  /** Optional: exact question count per BTL/K level. If all zero/absent → AI distributes automatically. */
  btlDistribution?: Partial<Record<BloomLevel, number>>;
}

// Default patterns for each subject nature
export const DEFAULT_PATTERNS: Record<SubjectNature, PartConfiguration[]> = {
  THEORY: [
    { partName: 'Part A', questionCount: 10, marksPerQuestion: 2, totalMarks: 20, allowedBTLLevels: ['BTL1', 'BTL2'], mcqCount: 10, description: 'MCQ / Short Answer' },
    { partName: 'Part B', questionCount: 5, marksPerQuestion: 13, totalMarks: 65, allowedBTLLevels: ['BTL2', 'BTL3', 'BTL4'], description: 'Descriptive Questions' },
    { partName: 'Part C', questionCount: 1, marksPerQuestion: 15, totalMarks: 15, allowedBTLLevels: ['BTL4', 'BTL5', 'BTL6'], description: 'Case Study / Problem Solving' },
  ],
  PRBL: [], // No exam for Project Based Learning
  PMBL: [
    { partName: 'Part A', questionCount: 10, marksPerQuestion: 2, totalMarks: 20, allowedBTLLevels: ['BTL1', 'BTL2'], mcqCount: 10, description: 'MCQ / Short Answer' },
    { partName: 'Part B', questionCount: 5, marksPerQuestion: 10, totalMarks: 50, allowedBTLLevels: ['BTL3', 'BTL4'], description: 'Problem Solving' },
    { partName: 'Part C', questionCount: 2, marksPerQuestion: 15, totalMarks: 30, allowedBTLLevels: ['BTL4', 'BTL5', 'BTL6'], description: 'Complex Problem / Case Study' },
  ],
  TCPR: [
    { partName: 'Part A', questionCount: 10, marksPerQuestion: 2, totalMarks: 20, allowedBTLLevels: ['BTL1', 'BTL2'], mcqCount: 10, description: 'MCQ / Short Answer' },
    { partName: 'Part B', questionCount: 5, marksPerQuestion: 16, totalMarks: 80, allowedBTLLevels: ['BTL2', 'BTL3', 'BTL4', 'BTL5'], description: 'Theory + Practical Questions' },
  ],
};

// Subject
export interface SubjectConfiguration {
  hasExam: boolean;
  parts: PartConfiguration[];
  totalMarks: number;
  duration?: number;
  specialInstructions?: string;
}

export interface Subject {
  id: string;
  code: string;
  name: string;
  semester: number;
  department?: string;
  credits: number;
  nature: SubjectNature;
  configuration?: SubjectConfiguration;
}

// Syllabus
export interface TopicConfiguration {
  topicName: string;
  partMapping?: string[];
  hours?: number;
}

export interface SyllabusUnit {
  unitNumber: number;
  title: string;
  topics: TopicConfiguration[] | string[];
  courseOutcome?: number;
  coMapping?: string[];
}

export interface Syllabus {
  id: string;
  subject_id: string;
  units: SyllabusUnit[];
  academic_year?: string;
  regulation?: string;
  source_file?: string;
  parsed_at?: string;
  created_at?: string;
}

// CDAP (Course Delivery and Assessment Plan)
export interface CDAPUnit {
  unit_number: number;
  unit_name: string;
  part1_topics: string[];
  part2_topics: string[];
}

export interface CDAP {
  id: string;
  subject_id: string;
  units: CDAPUnit[];
  source_file?: string;
  parsed_at?: string;
  created_at?: string;
}

// Question Bank
export type QuestionBankStatus = 'DRAFT' | 'PENDING_APPROVAL' | 'APPROVED' | 'REJECTED';

export interface Question {
  question: string;
  unit: number;
  btl: BloomLevel;
  marks: number;
  answer?: string;
  isMCQ?: boolean;
  options?: { A: string; B: string; C: string; D: string };
  correctOption?: 'A' | 'B' | 'C' | 'D';
  imageData?: string; // base64 data URL: "data:image/png;base64,..."
}

export interface QuestionPattern {
  id: string;
  subject_id: string;
  parts: PartConfiguration[];
  is_active: boolean;
  notes?: string;
  unit_question_counts?: Record<string, Record<number, number>>;
  unit_configs?: Record<string, PartConfiguration[]>;
}

export interface QuestionBank {
  id: string;
  subject_id: string;
  syllabus_id?: string;
  pattern_id?: string;
  title?: string;
  questions?: { parts: Record<string, Question[]> };
  status: QuestionBankStatus;
  rejection_reason?: string;
  excel_path?: string;
  generated_by?: string;
  generated_by_name?: string;
  created_at: string;
}

// Staff Assignment
export interface StaffAssignment {
  id: string;
  subject_id: string;
  staff_email: string;
  staff_name?: string;
  can_edit_pattern: boolean;
  can_generate_questions: boolean;
  can_approve: boolean;
  is_active: boolean;
}

export interface MySubjectAssignment {
  subjectId: string;
  subjectName: string;
  subjectCode: string;
  subjectNature?: SubjectNature;
  subjectConfiguration?: SubjectConfiguration;
  canEditPattern: boolean;
  canGenerateQuestions: boolean;
  canApprove: boolean;
}

export interface FacultyMember {
  id: string;
  email: string;
  name: string;
  department?: string;
}

// Helper functions
export const createDefaultPart = (index: number): PartConfiguration => ({
  partName: `Part ${String.fromCharCode(65 + index)}`,
  questionCount: 5,
  marksPerQuestion: 2,
  totalMarks: 10,
  allowedBTLLevels: ['BTL1', 'BTL2'],
  mcqCount: 0,
});

export const calculateTotalMarks = (parts: PartConfiguration[]): number => {
  return parts.reduce((sum, p) => sum + p.totalMarks, 0);
};

