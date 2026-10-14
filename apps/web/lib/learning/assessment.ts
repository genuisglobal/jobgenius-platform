export type AssessmentQuestion = {
  question: string;
  options: string[];
  correct_index: number;
  explanation: string;
  user_answer: number | null;
  is_correct: boolean | null;
};

export type AssessmentAnswer = {
  user_answer: number | null;
  is_correct: boolean | null;
  answered_at: string | null;
};

export type AssessmentResult = {
  questions: AssessmentQuestion[];
  answers: AssessmentAnswer[];
  correctCount: number;
  totalQuestions: number;
  score: number;
  completed: boolean;
};

const REVIEW_INTERVAL_DAYS = [1, 3, 7, 14, 30, 60];

function clampIndex(value: number, max: number) {
  return Math.max(0, Math.min(max, value));
}

export function normalizeAssessmentQuestions(raw: unknown): AssessmentQuestion[] {
  if (!Array.isArray(raw)) {
    return [];
  }

  return raw
    .map((entry) => {
      if (!entry || typeof entry !== "object") {
        return null;
      }

      const value = entry as Record<string, unknown>;
      const options = Array.isArray(value.options)
        ? value.options.filter((option): option is string => typeof option === "string").slice(0, 4)
        : [];

      return {
        question: typeof value.question === "string" ? value.question : "Question",
        options,
        correct_index:
          typeof value.correct_index === "number" &&
          Number.isInteger(value.correct_index) &&
          value.correct_index >= 0 &&
          value.correct_index < options.length
            ? value.correct_index
            : 0,
        explanation: typeof value.explanation === "string" ? value.explanation : "",
        user_answer:
          typeof value.user_answer === "number" && Number.isInteger(value.user_answer)
            ? value.user_answer
            : null,
        is_correct: typeof value.is_correct === "boolean" ? value.is_correct : null,
      };
    })
    .filter((question): question is AssessmentQuestion => Boolean(question));
}

export function buildEmptyAssessmentAnswers(
  questions: AssessmentQuestion[]
): AssessmentAnswer[] {
  return questions.map(() => ({
    user_answer: null,
    is_correct: null,
    answered_at: null,
  }));
}

export function mergeAssessmentState(
  rawQuestions: unknown,
  rawAnswers: unknown
): AssessmentQuestion[] {
  const questions = normalizeAssessmentQuestions(rawQuestions);
  const answers = Array.isArray(rawAnswers) ? rawAnswers : [];

  return questions.map((question, index) => {
    const answer = answers[index];
    if (!answer || typeof answer !== "object") {
      return question;
    }

    const value = answer as Record<string, unknown>;
    const userAnswer =
      typeof value.user_answer === "number" && Number.isInteger(value.user_answer)
        ? value.user_answer
        : question.user_answer;
    const isCorrect =
      typeof value.is_correct === "boolean" ? value.is_correct : question.is_correct;

    return {
      ...question,
      user_answer: userAnswer,
      is_correct: isCorrect,
    };
  });
}

export function scoreAssessment(
  rawQuestions: unknown,
  submittedAnswers: Array<number | null | undefined>,
  answeredAt = new Date().toISOString()
): AssessmentResult {
  const questions = normalizeAssessmentQuestions(rawQuestions);
  const answers = buildEmptyAssessmentAnswers(questions);

  let correctCount = 0;

  for (let index = 0; index < questions.length; index += 1) {
    const question = questions[index];
    const userAnswer = submittedAnswers[index] ?? null;
    const boundedAnswer =
      typeof userAnswer === "number" && Number.isInteger(userAnswer)
        ? clampIndex(userAnswer, Math.max(question.options.length - 1, 0))
        : null;
    const isCorrect =
      boundedAnswer !== null ? boundedAnswer === question.correct_index : null;

    questions[index] = {
      ...question,
      user_answer: boundedAnswer,
      is_correct: isCorrect,
    };
    answers[index] = {
      user_answer: boundedAnswer,
      is_correct: isCorrect,
      answered_at: boundedAnswer !== null ? answeredAt : null,
    };

    if (isCorrect) {
      correctCount += 1;
    }
  }

  const totalQuestions = questions.length;
  const answeredCount = answers.filter((answer) => answer.user_answer !== null).length;
  const score =
    totalQuestions > 0 ? Math.round((correctCount / totalQuestions) * 100) : 0;

  return {
    questions,
    answers,
    correctCount,
    totalQuestions,
    score,
    completed: totalQuestions > 0 && answeredCount === totalQuestions,
  };
}

export function computeReviewSchedule(
  score: number,
  currentStage = 0,
  now = new Date()
) {
  const safeScore = Math.max(0, Math.min(100, Math.round(score)));
  let reviewStage = 0;

  if (safeScore >= 90) {
    reviewStage = Math.min(currentStage + 1, REVIEW_INTERVAL_DAYS.length);
  } else if (safeScore >= 75) {
    reviewStage = Math.max(1, Math.min(currentStage || 1, REVIEW_INTERVAL_DAYS.length));
  }

  const intervalDays =
    reviewStage === 0
      ? 1
      : REVIEW_INTERVAL_DAYS[Math.max(0, reviewStage - 1)] ?? REVIEW_INTERVAL_DAYS[REVIEW_INTERVAL_DAYS.length - 1];
  const nextReviewAt = new Date(now);
  nextReviewAt.setDate(nextReviewAt.getDate() + intervalDays);

  return {
    masteryScore: safeScore,
    reviewStage,
    nextReviewAt: nextReviewAt.toISOString(),
  };
}
