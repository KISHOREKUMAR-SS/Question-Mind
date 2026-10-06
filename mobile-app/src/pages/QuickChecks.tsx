import { useState, useCallback } from 'react';
import {
  Copy,
  ClipboardCheck,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  BookOpenCheck,
  Layers,
  Target,
  BarChart2,
  Search,
  ShieldCheck,
  Shuffle,
  Star,
  Lightbulb,
} from 'lucide-react';
import AILogosBackground from '../components/AILogosBackground';
import chatGptLogo from '../assets/AI LOGOS/chat_gpt.png';
import geminiLogo from '../assets/AI LOGOS/gemini.png';
import claudeLogo from '../assets/AI LOGOS/claude.png';
import deepseekLogo from '../assets/AI LOGOS/DeepSeek.png';
import grokLogo from '../assets/AI LOGOS/Grok.png';
import kimiLogo from '../assets/AI LOGOS/KIMI.png';
import qwenLogo from '../assets/AI LOGOS/qwen.png';

// ─── AI options ───────────────────────────────────────────────────────────────
const AI_OPTIONS = [
  { name: 'ChatGPT', logo: chatGptLogo, url: 'https://chatgpt.com/' },
  { name: 'Gemini', logo: geminiLogo, url: 'https://gemini.google.com/app' },
  { name: 'Claude', logo: claudeLogo, url: 'https://claude.ai/new' },
  { name: 'DeepSeek', logo: deepseekLogo, url: 'https://chat.deepseek.com/' },
  { name: 'Grok', logo: grokLogo, url: 'https://x.com/i/grok' },
  { name: 'KIMI', logo: kimiLogo, url: 'https://kimi.moonshot.cn/' },
  { name: 'Qwen', logo: qwenLogo, url: 'https://chat.qwenlm.ai/' },
];

// ─── Prompt definitions ───────────────────────────────────────────────────────
interface PromptCard {
  id: string;
  title: string;
  description: string;
  icon: React.ElementType;
  color: string; // tailwind gradient classes
  prompt: string;
}

const QUICK_CHECK_PROMPTS: PromptCard[] = [
  {
    id: 'redundancy',
    title: 'Redundancy Check',
    description: 'Detect duplicate or near-duplicate questions across the bank.',
    icon: RefreshCw,
    color: 'from-rose-500 to-pink-600',
    prompt: `You are an expert question bank auditor. I will provide you with a set of exam questions. Your task is to identify ALL redundant, duplicate, or near-duplicate questions.

For each group of redundant questions:
1. List all question numbers involved.
2. Briefly explain why they are considered redundant (same concept, same wording, same scenario etc.).
3. Recommend which question to keep and why.
4. Suggest an improved replacement question if applicable.

Finally, provide a summary:
- Total questions reviewed
- Total redundancy groups found
- Percentage of unique questions

Please format your response clearly with headings for each redundancy group.

[PASTE YOUR QUESTION BANK CONTENT BELOW THIS LINE]`,
  },
  {
    id: 'bloom',
    title: "Bloom's Taxonomy Audit",
    description: "Verify BTL distribution across all cognitive levels in the question bank.",
    icon: BarChart2,
    color: 'from-violet-500 to-purple-600',
    prompt: `You are a curriculum design expert. Analyse the following question bank for Bloom's Taxonomy Level (BTL) distribution.

For each question:
1. Identify its cognitive level: Remember (L1), Understand (L2), Apply (L3), Analyse (L4), Evaluate (L5), Create (L6).
2. Justify your classification briefly.

Then provide:
- A summary table: BTL Level | Count | Percentage
- Missing or under-represented levels
- Recommendations to improve balance

Guidelines:
- A healthy distribution targets ≥10% at L3 and above.
- Flag any questions misclassified in their intended level.

[PASTE YOUR QUESTION BANK CONTENT BELOW THIS LINE]`,
  },
  {
    id: 'coverage',
    title: 'Syllabus Coverage Check',
    description: 'Ensure all syllabus topics are proportionately covered in the bank.',
    icon: BookOpenCheck,
    color: 'from-emerald-500 to-teal-600',
    prompt: `You are a senior academic reviewer. I will give you a syllabus and a question bank. Check whether the question bank covers all topics adequately.

For each syllabus topic:
1. Count how many questions address it.
2. Flag topics with zero or insufficient coverage (less than 2 questions per major topic).
3. Flag topics that are over-represented (more than 30% of all questions).

Provide:
- A coverage matrix: Topic | # Questions | Coverage Status (Good / Low / Excessive)
- Gaps that need additional questions
- Concrete suggestions for new questions on under-covered topics

[PASTE SYLLABUS FIRST, THEN QUESTION BANK BELOW]`,
  },
  {
    id: 'quality',
    title: 'Question Quality Review',
    description: 'Assess clarity, correctness, and pedagogical quality of each question.',
    icon: ShieldCheck,
    color: 'from-blue-500 to-indigo-600',
    prompt: `You are an expert educational assessment specialist. Review the following questions for overall quality.

For each question evaluate:
1. **Clarity** – Is the question clear and unambiguous? (Rate: Clear / Needs Revision / Unclear)
2. **Correctness** – Is there a definitive correct answer? Are distractors plausible?
3. **Difficulty Alignment** – Does the question match its intended Bloom's level?
4. **Language** – Is it free from spelling errors, grammar issues, or biased language?
5. **Improvement** – Suggest an improved version if quality is below standard.

Provide a final Quality Score for the entire bank:
- Excellent (≥90% questions clear and correct)
- Good (70–89%)
- Needs Improvement (<70%)

[PASTE YOUR QUESTION BANK CONTENT BELOW THIS LINE]`,
  },
  {
    id: 'difficulty',
    title: 'Difficulty Distribution',
    description: 'Analyse the spread of easy, medium, and hard questions in the bank.',
    icon: Target,
    color: 'from-orange-500 to-amber-600',
    prompt: `You are an assessment design expert. Analyse the difficulty distribution of the following question bank.

For each question:
1. Rate its difficulty: Easy | Medium | Hard
2. Briefly explain your rating.

Then provide:
- Distribution summary: Easy | Medium | Hard (count + percentage)
- Ideal benchmark: 30% Easy, 50% Medium, 20% Hard
- Whether this bank is too easy, too hard, or well-balanced
- Specific recommendations to rebalance if needed

[PASTE YOUR QUESTION BANK CONTENT BELOW THIS LINE]`,
  },
  {
    id: 'part-balance',
    title: 'Part-wise Balance Check',
    description: 'Verify question count and marks match the exam pattern for each part.',
    icon: Layers,
    color: 'from-cyan-500 to-sky-600',
    prompt: `You are an exam coordinator. Review the following question bank parts against the declared exam pattern.

For each Part (A, B, C etc.):
1. Check: Does the number of questions match the pattern specification?
2. Check: Do the marks per question align with the pattern?
3. Check: Are there enough questions to support multiple exam sets without repetition (minimum 3× the required count)?

Provide:
- A Part-wise status table: Part | Required Qs | Available Qs | Marks Match? | Status
- Flagged parts that are deficient
- Recommendation: how many more questions are needed per part

[PASTE EXAM PATTERN FIRST, THEN QUESTION BANK BELOW]`,
  },
  {
    id: 'language',
    title: 'Language & Grammar Check',
    description: 'Scan for spelling mistakes, grammar errors, and ambiguous phrasing.',
    icon: Search,
    color: 'from-pink-500 to-fuchsia-600',
    prompt: `You are a professional editor and academic language specialist. Proofread the following question bank.

For each question with issues:
1. Quote the problematic text.
2. Categorise the issue: Spelling | Grammar | Ambiguity | Technical Terminology | Formatting
3. Provide a corrected version.

Additionally, flag:
- Questions with multiple possible interpretations
- Questions using vague words like "discuss", "explain briefly" without length guidance
- Inconsistent terminology for the same concept

Provide a final Language Score:
- Excellent (≤5% questions with issues)
- Acceptable (6–15%)
- Needs Revision (>15%)

[PASTE YOUR QUESTION BANK CONTENT BELOW THIS LINE]`,
  },
  {
    id: 'shuffle',
    title: 'Answer Key Verification',
    description: 'Verify MCQ answer keys and check for pattern bias in option placement.',
    icon: Shuffle,
    color: 'from-yellow-500 to-orange-500',
    prompt: `You are a psychometrician specialising in MCQ design. Analyse the following MCQ question bank.

Check for:
1. **Answer Key Accuracy** – Verify that the correct answer provided is actually correct.
2. **Distractor Quality** – Are wrong options plausible and non-trivially distinguishable?
3. **Option Placement Bias** – Is the correct answer disproportionately in one position (e.g., always option C)?
4. **Option Length Clues** – Is the correct answer consistently longer or more detailed than distractors?

Provide:
- List of questions with incorrect answer keys
- Answer option distribution: A | B | C | D (count)
- Bias assessment and recommendation to shuffle options
- Questions with poor distractors and suggested replacements

[PASTE YOUR MCQ QUESTION BANK WITH ANSWER KEY BELOW]`,
  },
  {
    id: 'unit-wise',
    title: 'Unit-wise Question Spread',
    description: 'Check that questions are evenly distributed across all syllabus units.',
    icon: Star,
    color: 'from-purple-500 to-pink-500',
    prompt: `You are an academic quality assurance officer. Analyse the distribution of the following question bank across units.

For each unit:
1. Count the questions assigned to it.
2. Check if the distribution is proportional to the unit's weightage in the syllabus.
3. Flag any unit with significantly fewer questions than its share (below 80% of expected).

Provide:
- Unit distribution table: Unit | Topic | # Questions | Expected | Status
- Overall balance score: Well Distributed / Moderately Uneven / Highly Skewed
- Recommendations: which units need more questions and suggested topics to cover

[PASTE SYLLABUS WITH UNIT WEIGHTAGE FIRST, THEN QUESTION BANK BELOW]`,
  },
  {
    id: 'full-audit',
    title: 'Complete Bank Audit',
    description: 'Run a comprehensive audit covering all quality dimensions in one go.',
    icon: Lightbulb,
    color: 'from-gradient-to-br from-pink-500 via-purple-500 to-indigo-500',
    prompt: `You are a senior academic quality auditor. Conduct a FULL comprehensive audit of the following question bank.

Your report must include ALL of the following sections:

## 1. Redundancy Report
- Identify all duplicate/near-duplicate questions and group them.

## 2. Bloom's Taxonomy Distribution
- Classify each question by BTL level.
- Provide counts and percentages per level.
- Highlight imbalances.

## 3. Difficulty Distribution
- Classify questions as Easy / Medium / Hard.
- Compare against ideal 30/50/20 benchmark.

## 4. Syllabus Coverage
- Map questions to syllabus topics.
- Flag gaps and over-represented areas.

## 5. Language & Clarity
- List questions with grammar, spelling, or ambiguity issues.

## 6. Part-wise Balance
- Verify each part meets the exam pattern requirements.

## 7. Overall Quality Score
- Score the bank out of 100 with breakdown per dimension.
- Give a clear PASS / NEEDS REVISION / FAIL verdict.

## 8. Action Plan
- Prioritised list of improvements needed before the bank is exam-ready.

[PASTE SYLLABUS AND EXAM PATTERN FIRST, THEN QUESTION BANK BELOW]`,
  },
];

// ─── Component ─────────────────────────────────────────────────────────────────
export default function QuickChecks() {
  const [selectedPromptId, setSelectedPromptId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [aiCopiedName, setAiCopiedName] = useState<string | null>(null);

  const selectedPrompt = QUICK_CHECK_PROMPTS.find(p => p.id === selectedPromptId);

  const handleCopyPrompt = useCallback(async (prompt: PromptCard) => {
    try {
      await navigator.clipboard.writeText(prompt.prompt);
      setCopiedId(prompt.id);
      setSelectedPromptId(prompt.id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      // fallback
      const ta = document.createElement('textarea');
      ta.value = prompt.prompt;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      setCopiedId(prompt.id);
      setSelectedPromptId(prompt.id);
      setTimeout(() => setCopiedId(null), 2000);
    }
  }, []);

  const handleOpenAI = useCallback(async (ai: typeof AI_OPTIONS[0]) => {
    if (!selectedPrompt) return;
    try {
      await navigator.clipboard.writeText(selectedPrompt.prompt);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = selectedPrompt.prompt;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
    setAiCopiedName(ai.name);
    setTimeout(() => setAiCopiedName(null), 2500);
    window.open(ai.url, '_blank', 'noopener,noreferrer');
  }, [selectedPrompt]);

  return (
    <div className="flex gap-0 min-h-[calc(100vh-5rem)] relative">

      {/* ── Main Content ─────────────────────────────────────────── */}
      <div className="flex-1 pr-0 lg:pr-[165px] pb-24 lg:pb-0 space-y-6">

        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold text-pink-600 dark:text-pink-400">
            ⚡ Quick Checks
          </h1>
          <p className="text-purple-700 dark:text-purple-300 mt-1 font-medium">
            Ready-made AI prompts to validate, audit, and improve your question banks
          </p>
        </div>

        {/* How-to hint banner */}
        <div className="flex items-start gap-3 px-5 py-4 rounded-2xl bg-gradient-to-r from-pink-50 via-purple-50 to-indigo-50 dark:from-pink-900/20 dark:via-purple-900/20 dark:to-indigo-900/20 border-2 border-pink-200 dark:border-pink-800 shadow-sm">
          <Sparkles className="w-5 h-5 text-pink-500 dark:text-pink-400 flex-shrink-0 mt-0.5 animate-pulse" />
          <div className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
            <span className="font-bold text-pink-600 dark:text-pink-400">How to use: </span>
            <span>Click any prompt card below to <strong>select</strong> it, then click an AI logo in the right panel to <strong>copy &amp; open</strong> that AI with the prompt ready. You can also click the </span>
            <Copy className="inline w-3.5 h-3.5 mx-0.5 text-purple-500" />
            <span> button on any card to copy it directly to your clipboard.</span>
          </div>
        </div>

        {/* Prompt Cards Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          {QUICK_CHECK_PROMPTS.map((p) => {
            const Icon = p.icon;
            const isSelected = selectedPromptId === p.id;
            const isCopied = copiedId === p.id;

            return (
              <button
                key={p.id}
                onClick={() => {
                  setSelectedPromptId(p.id);
                  handleCopyPrompt(p);
                }}
                className={`group relative flex flex-col text-left rounded-2xl border-2 p-5 transition-all duration-300 overflow-hidden focus:outline-none
                  ${isSelected
                    ? 'border-pink-500 dark:border-pink-400 shadow-xl shadow-pink-300/40 dark:shadow-pink-900/50 scale-[1.02]'
                    : 'border-pink-200 dark:border-slate-700 hover:border-pink-400 dark:hover:border-pink-600 hover:shadow-lg hover:scale-[1.01]'
                  }
                  bg-white dark:bg-slate-900`}
                style={{ minHeight: '170px' }}
              >

                {/* Subtle card background gradient */}
                <div className={`absolute top-0 right-0 w-28 h-28 bg-gradient-to-br ${p.color} opacity-[0.07] rounded-full translate-x-8 -translate-y-8 pointer-events-none transition-opacity duration-300 group-hover:opacity-[0.14]`} />

                {/* Header row */}
                <div className="flex items-start justify-between gap-3 mb-3 relative z-10">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${p.color} flex items-center justify-center flex-shrink-0 shadow-md`}>
                      <Icon className="w-5 h-5 text-white" />
                    </div>
                    <h3 className="font-bold text-slate-900 dark:text-white text-base leading-tight">
                      {p.title}
                    </h3>
                  </div>

                  {/* Copy button */}
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={(e) => { e.stopPropagation(); handleCopyPrompt(p); }}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); handleCopyPrompt(p); } }}
                    className={`flex-shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all duration-200 border
                      ${isCopied
                        ? 'bg-gradient-to-r from-pink-500 to-purple-600 text-white border-pink-400 shadow-md shadow-pink-300/40'
                        : 'bg-white dark:bg-slate-800 text-pink-600 dark:text-pink-300 border-pink-300 dark:border-pink-700 hover:bg-pink-50 dark:hover:bg-pink-900/20'
                      }`}
                  >
                    {isCopied
                      ? <><ClipboardCheck className="w-3.5 h-3.5" /> Copied!</>
                      : <><Copy className="w-3.5 h-3.5" /> Copy</>
                    }
                  </div>
                </div>

                {/* Description */}
                <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed relative z-10 flex-1">
                  {p.description}
                </p>

                {/* Selected badge */}
                {isSelected && (
                  <div className="mt-3 flex items-center gap-1.5 relative z-10">
                    <CheckCircle2 className="w-4 h-4 text-pink-500 dark:text-pink-400" />
                    <span className="text-xs font-bold text-pink-600 dark:text-pink-400">
                      Selected — click an AI logo to open with this prompt
                    </span>
                  </div>
                )}
              </button>
            );
          })}
        </div>

        {/* No selection nudge */}
        {!selectedPromptId && (
          <div className="flex items-center gap-2 text-sm text-slate-400 dark:text-slate-500 italic px-1">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            Select a prompt card above, then use the AI logos on the right to open it instantly.
          </div>
        )}

      </div>

      {/* ── Fixed Right Sidebar: AI Logos ────────────────────────── */}
      <div className="hidden lg:flex flex-col items-center fixed right-5 top-1/2 -translate-y-1/2 z-30">
        <div className="relative rounded-2xl overflow-hidden border-2 border-pink-200 dark:border-pink-900 shadow-2xl shadow-pink-300/30 dark:shadow-pink-900/40 w-[135px]">

          {/* Animated background canvas */}
          <div className="absolute inset-0 z-0 pointer-events-none">
            <AILogosBackground />
          </div>

          {/* Top sparkle strip */}
          <div className="relative z-10 flex items-center justify-center pt-4 pb-1">
            <Sparkles className="w-4 h-4 text-white/90 animate-pulse" />
          </div>

          {/* Logo buttons */}
          <div className="relative z-10 flex flex-col items-center gap-2.5 px-3 pb-3 pt-1">
            {AI_OPTIONS.map((ai) => {
              const isAiCopied = aiCopiedName === ai.name;
              return (
                <button
                  key={ai.name}
                  type="button"
                  onClick={() => handleOpenAI(ai)}
                  disabled={!selectedPromptId}
                  title={selectedPromptId
                    ? `Copy & open ${ai.name}`
                    : 'Select a prompt card first'
                  }
                  className={`ai-logo-btn group relative flex items-center justify-center w-full py-1.5 rounded-xl transition-all duration-500 focus:outline-none focus:ring-2 focus:ring-pink-500 focus:ring-offset-1 focus:ring-offset-white dark:focus:ring-offset-slate-900
                    ${selectedPromptId
                      ? 'hover:scale-[1.12] cursor-pointer hover:bg-white/20'
                      : 'opacity-40 cursor-not-allowed grayscale'
                    }`}
                >
                  {/* Hover glow */}
                  {selectedPromptId && (
                    <>
                      <div className="absolute inset-[-6%] opacity-0 group-hover:opacity-100 transition-opacity duration-500 blur-xl rounded-full bg-white/60 dark:bg-white/30 pointer-events-none" />
                      <div className="absolute inset-[-3%] opacity-0 group-hover:opacity-100 transition-opacity duration-500 blur-md rounded-xl bg-white/50 dark:bg-white/40 pointer-events-none" />
                    </>
                  )}

                  {/* Copied ring */}
                  {isAiCopied && (
                    <div className="absolute inset-0 rounded-xl border-2 border-pink-400 animate-ping pointer-events-none" />
                  )}

                  <img
                    src={ai.logo}
                    alt={ai.name}
                    className={`h-12 w-auto object-contain relative z-10 transition-all duration-500
                      ${selectedPromptId
                        ? 'drop-shadow-sm group-hover:drop-shadow-[0_0_16px_rgba(255,255,255,0.95)]'
                        : ''
                      }`}
                  />
                </button>
              );
            })}
          </div>
        </div>

        {/* Tooltip label below sidebar */}
        <p className="text-center text-[10px] text-slate-400 dark:text-slate-500 mt-2 font-medium">
          {selectedPromptId ? '✨ Click to open' : 'Select a prompt'}
        </p>
      </div>

      {/* ── Mobile AI Bar (bottom, horizontal) ───────────────────── */}
      <div className="lg:hidden fixed bottom-0 left-0 right-0 z-30">
        <div className="relative overflow-hidden border-t-2 border-pink-200 dark:border-pink-900 shadow-2xl">
          {/* Animated BG */}
          <div className="absolute inset-0 z-0 pointer-events-none">
            <AILogosBackground />
          </div>

          <div className="relative z-10 flex flex-wrap items-center justify-center gap-3 sm:gap-5 px-4 py-3">
            <Sparkles className="w-4 h-4 text-white/80 animate-pulse flex-shrink-0" />
            {AI_OPTIONS.map((ai) => (
              <button
                key={ai.name}
                type="button"
                onClick={() => handleOpenAI(ai)}
                disabled={!selectedPromptId}
                title={selectedPromptId ? `Copy & open ${ai.name}` : 'Select a prompt first'}
                className={`ai-logo-btn group relative flex items-center justify-center transition-all duration-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-pink-500 focus:ring-offset-1 focus:ring-offset-white dark:focus:ring-offset-slate-900
                  ${selectedPromptId ? 'hover:scale-[1.15] cursor-pointer' : 'opacity-40 cursor-not-allowed grayscale'}`}
              >
                <div className="absolute inset-[-8%] opacity-0 group-hover:opacity-100 transition-opacity duration-400 blur-lg rounded-full bg-white/60 pointer-events-none" />
                <img
                  src={ai.logo}
                  alt={ai.name}
                  className={`h-7 w-auto object-contain relative z-10 transition-all duration-300
                    ${selectedPromptId ? 'group-hover:drop-shadow-[0_0_10px_rgba(255,255,255,0.9)]' : ''}`}
                />
              </button>
            ))}
          </div>
        </div>
      </div>

    </div>
  );
}
