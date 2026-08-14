import { getOpenAIClient, OPENAI_MODEL, isOpenAIConfigured } from "@/lib/openai";
import { generateQuizQuestions } from "@/lib/portal/ai-quiz-generator";

type ArticleLessonContent = {
  body: string;
  summary: string;
};

type ExerciseLessonContent = {
  instructions: string;
  starter_code?: string;
};

type QuizQuestion = Awaited<ReturnType<typeof generateQuizQuestions>>[number];

type QuizLessonContent = {
  description: string;
  questions: QuizQuestion[];
};

type GeneratedArticleLesson = {
  title: string;
  content: ArticleLessonContent;
  estimated_minutes: number;
};

type GenerateLessonParams = {
  trackTitle: string;
  category: string;
  lessonTitle: string;
  targetSkill?: string | null;
  focusSkills?: string[] | null;
  jobTitle?: string | null;
  company?: string | null;
  jobDescription?: string | null;
  skills?: string[] | null;
  seniority?: string | null;
};

type GenerateTrackLessonsParams = {
  trackTitle: string;
  category: string;
  lessonCount: number;
  creationMode?: string | null;
  targetSkill?: string | null;
  focusSkills?: string[] | null;
  jobTitle?: string | null;
  company?: string | null;
  jobDescription?: string | null;
  skills?: string[] | null;
  seniority?: string | null;
};

type GeneratedLesson = {
  title: string;
  content: ArticleLessonContent | ExerciseLessonContent | QuizLessonContent;
  content_type: "article" | "exercise" | "quiz";
  estimated_minutes: number;
  skill_slug: string | null;
  learning_objective: string | null;
  difficulty: "easy" | "medium" | "hard";
};

type Topic = {
  label: string;
  slug: string | null;
};

const ADAPTIVE_CREATION_MODES = new Set([
  "job_gap_refresh",
  "manual_skill_refresh",
]);

function normalizeSkill(value: string | null | undefined) {
  return value?.trim() || null;
}

function slugifySkill(value: string | null | undefined) {
  const normalized = normalizeSkill(value);
  if (!normalized) {
    return null;
  }

  return normalized
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || null;
}

function isAdaptiveTrack(params: GenerateTrackLessonsParams) {
  return (
    ADAPTIVE_CREATION_MODES.has(params.creationMode ?? "") ||
    Boolean(normalizeSkill(params.targetSkill)) ||
    Boolean(params.focusSkills?.some((skill) => normalizeSkill(skill)))
  );
}

function buildAdaptiveTopics(
  params: GenerateTrackLessonsParams,
  desiredCount: number
): Topic[] {
  const seen = new Set<string>();
  const topics: Topic[] = [];

  for (const candidate of [
    params.targetSkill,
    ...(params.focusSkills ?? []),
    params.trackTitle,
  ]) {
    const label = normalizeSkill(candidate);
    if (!label) {
      continue;
    }

    const key = label.toLowerCase();
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    topics.push({ label, slug: slugifySkill(label) });

    if (topics.length >= desiredCount) {
      return topics;
    }
  }

  if (topics.length === 0) {
    topics.push({
      label: "Core Skill Refresh",
      slug: "core-skill-refresh",
    });
  }

  const seedTopics = [...topics];

  while (topics.length < desiredCount) {
    topics.push(seedTopics[topics.length % seedTopics.length] ?? seedTopics[0]);
  }

  return topics;
}

function getDifficulty(
  index: number,
  total: number
): "easy" | "medium" | "hard" {
  if (index === 0) {
    return "easy";
  }

  if (index >= total - 1) {
    return "hard";
  }

  return "medium";
}

function buildLearningObjective(
  lessonType: GeneratedLesson["content_type"],
  topic: string,
  category: string
) {
  switch (lessonType) {
    case "article":
      return `Refresh the core ${category} concepts for ${topic} and connect them to job-ready use cases.`;
    case "exercise":
      return `Apply ${topic} in a short practice task so the learner can move from recall to execution.`;
    case "quiz":
      return `Check active recall for ${topic} and record a mastery baseline for spaced review.`;
    default:
      return `Strengthen working knowledge for ${topic}.`;
  }
}

function mapTrackCategoryToQuizType(category: string) {
  switch (category) {
    case "technical":
    case "tools":
      return "technical";
    case "behavioral":
      return "behavioral";
    default:
      return "general";
  }
}

function buildExerciseContent(
  category: string,
  topic: string,
  jobTitle?: string | null
): ExerciseLessonContent {
  const roleContext = jobTitle ? ` for a ${jobTitle} role` : "";

  if (category === "technical" || category === "tools") {
    return {
      instructions: [
        `Use ${topic} to solve a short practical scenario${roleContext}.`,
        "",
        "1. Write down the problem in your own words.",
        `2. List the key steps, commands, or components you would use with ${topic}.`,
        "3. Explain one tradeoff or risk you would watch for.",
        "4. Summarize the result you would expect from a strong solution.",
      ].join("\n"),
      starter_code: `// Practice outline for ${topic}\n// 1. Define the goal\n// 2. List the key inputs\n// 3. Sketch the implementation steps\n// 4. Note one validation or debugging step\n`,
    };
  }

  return {
    instructions: [
      `Apply ${topic} in a realistic work scenario${roleContext}.`,
      "",
      "1. Describe the situation briefly.",
      "2. Explain how you would approach it.",
      "3. Note the decision you would make and why.",
      "4. Capture the outcome you would aim to deliver.",
    ].join("\n"),
  };
}

function buildFallbackLesson(title: string, category: string): ArticleLessonContent {
  return {
    body: `# ${title}\n\nThis lesson covers key concepts in ${category}.\n\n## Key Takeaways\n\n- Review the fundamentals\n- Practice with real-world examples\n- Apply what you learn\n\n## Exercise\n\nReflect on how this topic applies to your target role.`,
    summary: `An introduction to ${title} in the context of ${category}.`,
  };
}

function buildFallbackArticleLessons(
  params: GenerateTrackLessonsParams,
  count: number
): GeneratedArticleLesson[] {
  const topics = buildAdaptiveTopics(params, Math.max(count, 1));

  return Array.from({ length: count }, (_, index) => {
    const topic = topics[index] ?? topics[topics.length - 1];
    const title =
      count === 1
        ? `Refresh: ${topic.label}`
        : `Lesson ${index + 1}: ${topic.label}`;

    return {
      title,
      content: buildFallbackLesson(topic.label, params.category),
      estimated_minutes: 10,
    };
  });
}

async function generateArticleLessons(
  params: GenerateTrackLessonsParams,
  count: number
): Promise<GeneratedArticleLesson[]> {
  if (!isOpenAIConfigured()) {
    return buildFallbackArticleLessons(params, count);
  }

  try {
    const client = getOpenAIClient();

    const contextParts = [
      `Track title: ${params.trackTitle}`,
      `Category: ${params.category}`,
      `Number of lessons: ${count}`,
      params.targetSkill ? `Primary refresh skill: ${params.targetSkill}` : null,
      params.focusSkills?.length ? `Focus skills: ${params.focusSkills.join(", ")}` : null,
      params.jobTitle ? `Job target: ${params.jobTitle}` : null,
      params.company ? `Company: ${params.company}` : null,
      params.jobDescription
        ? `Job description: ${params.jobDescription.slice(0, 1500)}`
        : null,
      params.skills?.length ? `Seeker skills: ${params.skills.join(", ")}` : null,
      params.seniority ? `Seniority: ${params.seniority}` : null,
    ]
      .filter(Boolean)
      .join("\n");

    const response = await client.chat.completions.create({
      model: OPENAI_MODEL,
      temperature: 0.5,
      max_tokens: 4000,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `You are an expert career skills instructor. Generate a series of learning lessons for a structured learning track.

Return a JSON object with:
- "lessons": array of objects, each with:
  - "title": string - Lesson title
  - "body": string (markdown, 500-1000 words) - Practical content with examples, key takeaways, and one exercise
  - "summary": string - 1-2 sentence summary
  - "estimated_minutes": number - Estimated reading time (5-20 minutes)

Lessons should build on each other progressively and stay tightly focused on forgotten or weak skills.`,
        },
        {
          role: "user",
          content: contextParts,
        },
      ],
    });

    const text = response.choices[0]?.message?.content;
    if (!text) {
      return buildFallbackArticleLessons(params, count);
    }

    const parsed = JSON.parse(text);
    if (!Array.isArray(parsed.lessons)) {
      return buildFallbackArticleLessons(params, count);
    }

    return parsed.lessons.slice(0, count).map(
      (lesson: {
        title?: string;
        body?: string;
        summary?: string;
        estimated_minutes?: number;
      }) => ({
        title: typeof lesson.title === "string" ? lesson.title : "Untitled Lesson",
        content: {
          body: typeof lesson.body === "string" ? lesson.body : "Content coming soon.",
          summary: typeof lesson.summary === "string" ? lesson.summary : "",
        },
        estimated_minutes:
          typeof lesson.estimated_minutes === "number"
            ? lesson.estimated_minutes
            : 10,
      })
    );
  } catch {
    return buildFallbackArticleLessons(params, count);
  }
}

async function buildQuizLesson(
  params: GenerateTrackLessonsParams,
  topic: Topic
): Promise<GeneratedLesson> {
  const jobTitle =
    normalizeSkill(params.jobTitle) ||
    normalizeSkill(params.targetSkill) ||
    params.trackTitle ||
    "Skill Refresh";
  const prepContentSummary = [
    normalizeSkill(params.targetSkill),
    ...(params.focusSkills ?? []).map((skill) => normalizeSkill(skill)),
    params.jobDescription?.slice(0, 300),
    params.trackTitle,
  ]
    .filter((value): value is string => Boolean(value))
    .join(". ");

  const questions = await generateQuizQuestions({
    jobTitle,
    companyName: params.company ?? null,
    descriptionText: params.jobDescription ?? null,
    quizType: mapTrackCategoryToQuizType(params.category),
    prepContentSummary: prepContentSummary || null,
    count: Math.min(Math.max(5, Math.ceil(params.lessonCount / 2)), 8),
  });

  return {
    title: `Recall Check: ${topic.label}`,
    content_type: "quiz",
    estimated_minutes: 8,
    skill_slug: topic.slug,
    learning_objective: buildLearningObjective("quiz", topic.label, params.category),
    difficulty: "hard",
    content: {
      description:
        "Answer each question to measure what you still remember and update review scheduling.",
      questions,
    },
  };
}

export async function generateLessonContent(
  params: GenerateLessonParams
): Promise<ArticleLessonContent> {
  if (!isOpenAIConfigured()) {
    return buildFallbackLesson(params.lessonTitle, params.category);
  }

  try {
    const client = getOpenAIClient();

    const contextParts = [
      `Track title: ${params.trackTitle}`,
      `Category: ${params.category}`,
      params.targetSkill ? `Primary refresh skill: ${params.targetSkill}` : null,
      params.focusSkills?.length ? `Focus skills: ${params.focusSkills.join(", ")}` : null,
      params.jobTitle ? `Job target: ${params.jobTitle}` : null,
      params.company ? `Company: ${params.company}` : null,
      params.jobDescription
        ? `Job description: ${params.jobDescription.slice(0, 1000)}`
        : null,
      params.skills?.length ? `Seeker skills: ${params.skills.join(", ")}` : null,
      params.seniority ? `Seniority: ${params.seniority}` : null,
    ]
      .filter(Boolean)
      .join("\n");

    const response = await client.chat.completions.create({
      model: OPENAI_MODEL,
      temperature: 0.5,
      max_tokens: 2000,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `You are an expert career skills instructor. Generate a learning lesson for a job seeker preparing for a career transition or skill development.

Return a JSON object with:
- "body": string (markdown, 500-1000 words) - A clear, practical explanation with real-world examples, key takeaways as bullet points, and one exercise or reflection question.
- "summary": string - A 1-2 sentence summary of the lesson.`,
        },
        {
          role: "user",
          content: `Context:\n${contextParts}\n\nGenerate a lesson titled "${params.lessonTitle}".`,
        },
      ],
    });

    const text = response.choices[0]?.message?.content;
    if (!text) {
      return buildFallbackLesson(params.lessonTitle, params.category);
    }

    const parsed = JSON.parse(text);
    return {
      body:
        typeof parsed.body === "string"
          ? parsed.body
          : `# ${params.lessonTitle}\n\nContent coming soon.`,
      summary:
        typeof parsed.summary === "string"
          ? parsed.summary
          : params.lessonTitle,
    };
  } catch {
    return buildFallbackLesson(params.lessonTitle, params.category);
  }
}

export async function generateTrackLessons(
  params: GenerateTrackLessonsParams
): Promise<GeneratedLesson[]> {
  const adaptive = isAdaptiveTrack(params);
  const includesExercise = adaptive && params.lessonCount >= 3;
  const includesQuiz = adaptive && params.lessonCount >= 2;
  const articleCount = Math.max(
    1,
    params.lessonCount - Number(includesExercise) - Number(includesQuiz)
  );
  const topics = buildAdaptiveTopics(params, Math.max(articleCount, 1));

  const articleLessons = await generateArticleLessons(params, articleCount);
  const generatedLessons: GeneratedLesson[] = articleLessons.map((lesson, index) => {
    const topic = topics[index] ?? topics[topics.length - 1];
    return {
      title: lesson.title,
      content_type: "article",
      estimated_minutes: lesson.estimated_minutes,
      skill_slug: topic?.slug ?? null,
      learning_objective: buildLearningObjective(
        "article",
        topic?.label ?? params.trackTitle,
        params.category
      ),
      difficulty: adaptive
        ? getDifficulty(index, articleCount + Number(includesExercise) + Number(includesQuiz))
        : getDifficulty(index, articleCount),
      content: lesson.content,
    };
  });

  if (!adaptive) {
    return generatedLessons.slice(0, params.lessonCount);
  }

  const primaryTopic = topics[0] ?? {
    label: params.targetSkill || params.trackTitle,
    slug: slugifySkill(params.targetSkill || params.trackTitle),
  };

  if (includesExercise) {
    generatedLessons.push({
      title: `Practice Task: ${primaryTopic.label}`,
      content_type: "exercise",
      estimated_minutes: 12,
      skill_slug: primaryTopic.slug,
      learning_objective: buildLearningObjective(
        "exercise",
        primaryTopic.label,
        params.category
      ),
      difficulty: "medium",
      content: buildExerciseContent(
        params.category,
        primaryTopic.label,
        params.jobTitle
      ),
    });
  }

  if (includesQuiz) {
    generatedLessons.push(await buildQuizLesson(params, primaryTopic));
  }

  return generatedLessons.slice(0, params.lessonCount);
}
