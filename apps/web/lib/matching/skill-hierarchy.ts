/**
 * Skill Hierarchy & Semantic Matching
 *
 * Defines relationships between skills for smarter matching:
 * - Parent/child: React → JavaScript → Programming
 * - Aliases: K8s = Kubernetes, Postgres = PostgreSQL
 * - Related: Docker ~ Kubernetes (70% credit), React ~ Vue (50% credit)
 */

// Skill node in the hierarchy
interface SkillNode {
  name: string;
  aliases: string[];
  parents: string[];    // implies knowledge of these
  children: string[];   // specializations of this skill
  related: Array<{ skill: string; weight: number }>; // partial credit (0-1)
}

// The skill graph — keys are normalized lowercase
const SKILL_GRAPH: Record<string, SkillNode> = {
  // ── Programming Languages ──
  'javascript': {
    name: 'JavaScript',
    aliases: ['js', 'ecmascript', 'es6', 'es2015'],
    parents: ['programming'],
    children: ['typescript', 'react', 'vue', 'angular', 'node.js', 'next.js', 'svelte'],
    related: [{ skill: 'typescript', weight: 0.8 }],
  },
  'typescript': {
    name: 'TypeScript',
    aliases: ['ts'],
    parents: ['javascript'],
    children: [],
    related: [{ skill: 'javascript', weight: 0.9 }],
  },
  'python': {
    name: 'Python',
    aliases: ['py', 'python3'],
    parents: ['programming'],
    children: ['django', 'flask', 'fastapi', 'pandas', 'numpy', 'pytorch', 'tensorflow'],
    related: [{ skill: 'ruby', weight: 0.3 }],
  },
  'java': {
    name: 'Java',
    aliases: ['jdk', 'jvm'],
    parents: ['programming'],
    children: ['spring', 'spring boot', 'kotlin'],
    related: [{ skill: 'kotlin', weight: 0.6 }, { skill: 'c#', weight: 0.5 }],
  },
  'c#': {
    name: 'C#',
    aliases: ['csharp', 'c sharp', 'dotnet', '.net'],
    parents: ['programming'],
    children: ['.net', 'asp.net', 'unity'],
    related: [{ skill: 'java', weight: 0.5 }],
  },
  'go': {
    name: 'Go',
    aliases: ['golang'],
    parents: ['programming'],
    children: [],
    related: [{ skill: 'rust', weight: 0.3 }],
  },
  'rust': {
    name: 'Rust',
    aliases: [],
    parents: ['programming'],
    children: [],
    related: [{ skill: 'c++', weight: 0.4 }, { skill: 'go', weight: 0.3 }],
  },
  'c++': {
    name: 'C++',
    aliases: ['cpp'],
    parents: ['programming'],
    children: [],
    related: [{ skill: 'c', weight: 0.7 }, { skill: 'rust', weight: 0.4 }],
  },
  'ruby': {
    name: 'Ruby',
    aliases: [],
    parents: ['programming'],
    children: ['rails'],
    related: [{ skill: 'python', weight: 0.3 }],
  },
  'php': {
    name: 'PHP',
    aliases: [],
    parents: ['programming'],
    children: ['laravel'],
    related: [],
  },
  'swift': {
    name: 'Swift',
    aliases: [],
    parents: ['programming'],
    children: ['swiftui', 'ios'],
    related: [{ skill: 'kotlin', weight: 0.3 }],
  },
  'kotlin': {
    name: 'Kotlin',
    aliases: [],
    parents: ['java'],
    children: ['android'],
    related: [{ skill: 'java', weight: 0.7 }, { skill: 'swift', weight: 0.3 }],
  },
  'scala': {
    name: 'Scala',
    aliases: [],
    parents: ['jvm', 'programming'],
    children: ['spark'],
    related: [{ skill: 'java', weight: 0.4 }],
  },

  // ── Frontend Frameworks ──
  'react': {
    name: 'React',
    aliases: ['reactjs', 'react.js'],
    parents: ['javascript'],
    children: ['next.js', 'react native'],
    related: [{ skill: 'vue', weight: 0.5 }, { skill: 'angular', weight: 0.4 }, { skill: 'svelte', weight: 0.4 }],
  },
  'vue': {
    name: 'Vue',
    aliases: ['vuejs', 'vue.js'],
    parents: ['javascript'],
    children: ['nuxt'],
    related: [{ skill: 'react', weight: 0.5 }, { skill: 'angular', weight: 0.4 }],
  },
  'angular': {
    name: 'Angular',
    aliases: ['angularjs'],
    parents: ['typescript', 'javascript'],
    children: [],
    related: [{ skill: 'react', weight: 0.4 }, { skill: 'vue', weight: 0.4 }],
  },
  'svelte': {
    name: 'Svelte',
    aliases: ['sveltekit'],
    parents: ['javascript'],
    children: [],
    related: [{ skill: 'react', weight: 0.4 }, { skill: 'vue', weight: 0.5 }],
  },
  'next.js': {
    name: 'Next.js',
    aliases: ['nextjs'],
    parents: ['react'],
    children: [],
    related: [{ skill: 'nuxt', weight: 0.5 }, { skill: 'remix', weight: 0.6 }],
  },

  // ── Backend Frameworks ──
  'node.js': {
    name: 'Node.js',
    aliases: ['nodejs', 'node'],
    parents: ['javascript'],
    children: ['express', 'fastify', 'nest.js'],
    related: [{ skill: 'deno', weight: 0.6 }],
  },
  'django': {
    name: 'Django',
    aliases: [],
    parents: ['python'],
    children: [],
    related: [{ skill: 'flask', weight: 0.6 }, { skill: 'fastapi', weight: 0.5 }, { skill: 'rails', weight: 0.4 }],
  },
  'flask': {
    name: 'Flask',
    aliases: [],
    parents: ['python'],
    children: [],
    related: [{ skill: 'django', weight: 0.6 }, { skill: 'fastapi', weight: 0.7 }],
  },
  'fastapi': {
    name: 'FastAPI',
    aliases: [],
    parents: ['python'],
    children: [],
    related: [{ skill: 'flask', weight: 0.7 }, { skill: 'django', weight: 0.5 }],
  },
  'spring': {
    name: 'Spring',
    aliases: ['spring framework'],
    parents: ['java'],
    children: ['spring boot'],
    related: [],
  },
  'spring boot': {
    name: 'Spring Boot',
    aliases: ['springboot'],
    parents: ['spring', 'java'],
    children: [],
    related: [{ skill: '.net', weight: 0.3 }],
  },
  'rails': {
    name: 'Rails',
    aliases: ['ruby on rails', 'ror'],
    parents: ['ruby'],
    children: [],
    related: [{ skill: 'django', weight: 0.4 }, { skill: 'laravel', weight: 0.4 }],
  },
  'laravel': {
    name: 'Laravel',
    aliases: [],
    parents: ['php'],
    children: [],
    related: [{ skill: 'rails', weight: 0.4 }, { skill: 'django', weight: 0.3 }],
  },
  'express': {
    name: 'Express',
    aliases: ['expressjs', 'express.js'],
    parents: ['node.js'],
    children: [],
    related: [{ skill: 'fastify', weight: 0.7 }, { skill: 'nest.js', weight: 0.5 }],
  },

  // ── Databases ──
  'postgresql': {
    name: 'PostgreSQL',
    aliases: ['postgres', 'psql', 'pg'],
    parents: ['sql', 'databases'],
    children: [],
    related: [{ skill: 'mysql', weight: 0.7 }, { skill: 'sql', weight: 0.9 }],
  },
  'mysql': {
    name: 'MySQL',
    aliases: ['mariadb'],
    parents: ['sql', 'databases'],
    children: [],
    related: [{ skill: 'postgresql', weight: 0.7 }, { skill: 'sql', weight: 0.9 }],
  },
  'mongodb': {
    name: 'MongoDB',
    aliases: ['mongo'],
    parents: ['nosql', 'databases'],
    children: [],
    related: [{ skill: 'dynamodb', weight: 0.4 }, { skill: 'couchdb', weight: 0.5 }],
  },
  'redis': {
    name: 'Redis',
    aliases: [],
    parents: ['databases'],
    children: [],
    related: [{ skill: 'memcached', weight: 0.6 }],
  },
  'sql': {
    name: 'SQL',
    aliases: [],
    parents: ['databases'],
    children: ['postgresql', 'mysql', 'oracle', 'sql server'],
    related: [],
  },
  'elasticsearch': {
    name: 'Elasticsearch',
    aliases: ['elastic', 'es'],
    parents: ['databases'],
    children: [],
    related: [{ skill: 'opensearch', weight: 0.8 }, { skill: 'solr', weight: 0.6 }],
  },

  // ── Cloud Platforms ──
  'aws': {
    name: 'AWS',
    aliases: ['amazon web services'],
    parents: ['cloud'],
    children: ['s3', 'ec2', 'lambda', 'ecs', 'eks', 'dynamodb', 'sqs', 'sns'],
    related: [{ skill: 'gcp', weight: 0.6 }, { skill: 'azure', weight: 0.6 }],
  },
  'gcp': {
    name: 'GCP',
    aliases: ['google cloud', 'google cloud platform'],
    parents: ['cloud'],
    children: [],
    related: [{ skill: 'aws', weight: 0.6 }, { skill: 'azure', weight: 0.6 }],
  },
  'azure': {
    name: 'Azure',
    aliases: ['microsoft azure'],
    parents: ['cloud'],
    children: [],
    related: [{ skill: 'aws', weight: 0.6 }, { skill: 'gcp', weight: 0.6 }],
  },

  // ── DevOps & Infrastructure ──
  'docker': {
    name: 'Docker',
    aliases: ['containers', 'containerization'],
    parents: ['devops'],
    children: [],
    related: [{ skill: 'kubernetes', weight: 0.7 }, { skill: 'podman', weight: 0.8 }],
  },
  'kubernetes': {
    name: 'Kubernetes',
    aliases: ['k8s'],
    parents: ['devops', 'docker'],
    children: ['helm', 'eks', 'gke', 'aks'],
    related: [{ skill: 'docker', weight: 0.7 }],
  },
  'terraform': {
    name: 'Terraform',
    aliases: ['tf'],
    parents: ['iac', 'devops'],
    children: [],
    related: [{ skill: 'pulumi', weight: 0.6 }, { skill: 'cloudformation', weight: 0.5 }, { skill: 'ansible', weight: 0.4 }],
  },
  'ci/cd': {
    name: 'CI/CD',
    aliases: ['cicd', 'continuous integration', 'continuous deployment'],
    parents: ['devops'],
    children: ['github actions', 'gitlab ci', 'jenkins', 'circleci'],
    related: [],
  },
  'github actions': {
    name: 'GitHub Actions',
    aliases: ['gha'],
    parents: ['ci/cd'],
    children: [],
    related: [{ skill: 'gitlab ci', weight: 0.7 }, { skill: 'jenkins', weight: 0.5 }],
  },

  // ── Data & ML ──
  'machine learning': {
    name: 'Machine Learning',
    aliases: ['ml'],
    parents: ['data science'],
    children: ['deep learning', 'nlp', 'computer vision'],
    related: [{ skill: 'data science', weight: 0.7 }],
  },
  'deep learning': {
    name: 'Deep Learning',
    aliases: ['dl'],
    parents: ['machine learning'],
    children: ['tensorflow', 'pytorch'],
    related: [],
  },
  'tensorflow': {
    name: 'TensorFlow',
    aliases: ['tf'],
    parents: ['deep learning', 'python'],
    children: [],
    related: [{ skill: 'pytorch', weight: 0.7 }, { skill: 'keras', weight: 0.8 }],
  },
  'pytorch': {
    name: 'PyTorch',
    aliases: ['torch'],
    parents: ['deep learning', 'python'],
    children: [],
    related: [{ skill: 'tensorflow', weight: 0.7 }],
  },
  'pandas': {
    name: 'Pandas',
    aliases: [],
    parents: ['python', 'data science'],
    children: [],
    related: [{ skill: 'numpy', weight: 0.7 }, { skill: 'polars', weight: 0.6 }],
  },
  'spark': {
    name: 'Apache Spark',
    aliases: ['pyspark'],
    parents: ['big data'],
    children: [],
    related: [{ skill: 'hadoop', weight: 0.5 }, { skill: 'flink', weight: 0.5 }],
  },

  // ── Other ──
  'graphql': {
    name: 'GraphQL',
    aliases: ['gql'],
    parents: ['api'],
    children: [],
    related: [{ skill: 'rest', weight: 0.5 }],
  },
  'rest': {
    name: 'REST',
    aliases: ['restful', 'rest api', 'restful api'],
    parents: ['api'],
    children: [],
    related: [{ skill: 'graphql', weight: 0.5 }],
  },
  'kafka': {
    name: 'Apache Kafka',
    aliases: [],
    parents: ['messaging', 'streaming'],
    children: [],
    related: [{ skill: 'rabbitmq', weight: 0.5 }, { skill: 'pulsar', weight: 0.6 }],
  },
  'microservices': {
    name: 'Microservices',
    aliases: ['micro-services', 'microservice architecture'],
    parents: ['architecture'],
    children: [],
    related: [{ skill: 'distributed systems', weight: 0.7 }, { skill: 'kubernetes', weight: 0.4 }],
  },
  'agile': {
    name: 'Agile',
    aliases: ['agile methodology'],
    parents: [],
    children: ['scrum', 'kanban'],
    related: [{ skill: 'scrum', weight: 0.8 }],
  },
  'linux': {
    name: 'Linux',
    aliases: ['unix', 'bash', 'shell'],
    parents: [],
    children: [],
    related: [{ skill: 'devops', weight: 0.3 }],
  },
};

// Build reverse lookup: alias → canonical name
const ALIAS_MAP = new Map<string, string>();
for (const [canonical, node] of Object.entries(SKILL_GRAPH)) {
  ALIAS_MAP.set(canonical, canonical);
  for (const alias of node.aliases) {
    ALIAS_MAP.set(alias.toLowerCase(), canonical);
  }
}

/**
 * Resolve a skill name to its canonical form.
 */
export function resolveSkill(raw: string): string {
  const normalized = raw.trim().toLowerCase();
  return ALIAS_MAP.get(normalized) ?? normalized;
}

/**
 * Check if skillA implies knowledge of skillB (parent chain).
 * e.g., "React" implies "JavaScript"
 */
export function impliesSkill(skillA: string, skillB: string): boolean {
  const a = resolveSkill(skillA);
  const b = resolveSkill(skillB);
  if (a === b) return true;

  const node = SKILL_GRAPH[a];
  if (!node) return false;

  // Direct parent
  for (const parent of node.parents) {
    const resolvedParent = resolveSkill(parent);
    if (resolvedParent === b) return true;
    // One more level up (grandparent)
    if (impliesSkillDirect(resolvedParent, b)) return true;
  }

  return false;
}

function impliesSkillDirect(skillA: string, skillB: string): boolean {
  const node = SKILL_GRAPH[skillA];
  if (!node) return false;
  return node.parents.some((p) => resolveSkill(p) === skillB);
}

/**
 * Get the semantic similarity weight between two skills.
 * Returns: 1.0 = exact/alias match, 0.3-0.9 = related, 0.2 = parent implied, 0 = unrelated
 */
export function skillSimilarity(skillA: string, skillB: string): number {
  const a = resolveSkill(skillA);
  const b = resolveSkill(skillB);

  // Exact or alias match
  if (a === b) return 1.0;

  // Check parent chain (A implies B or B implies A)
  if (impliesSkill(a, b)) return 0.6;
  if (impliesSkill(b, a)) return 0.5; // child skill → less credit for parent requirement

  // Check related skills
  const nodeA = SKILL_GRAPH[a];
  if (nodeA) {
    const related = nodeA.related.find((r) => resolveSkill(r.skill) === b);
    if (related) return related.weight;
  }

  const nodeB = SKILL_GRAPH[b];
  if (nodeB) {
    const related = nodeB.related.find((r) => resolveSkill(r.skill) === a);
    if (related) return related.weight;
  }

  // Check if they share a parent (sibling skills)
  if (nodeA && nodeB) {
    const parentsA = new Set(nodeA.parents.map(resolveSkill));
    const sharedParent = nodeB.parents.some((p) => parentsA.has(resolveSkill(p)));
    if (sharedParent) return 0.25;
  }

  return 0;
}

/**
 * Enhanced skill matching: for each required skill, find the best match
 * from the seeker's skills using the hierarchy.
 *
 * Returns a score 0-1 representing coverage, and details about matches.
 */
export function hierarchicalSkillMatch(
  seekerSkills: string[],
  requiredSkills: string[],
  preferredSkills: string[] = []
): {
  requiredCoverage: number;
  preferredCoverage: number;
  matchedRequired: Array<{ required: string; matched: string; weight: number }>;
  matchedPreferred: Array<{ preferred: string; matched: string; weight: number }>;
  missingRequired: string[];
  totalWeightedScore: number;
} {
  const resolved = seekerSkills.map((s) => ({ original: s, resolved: resolveSkill(s) }));

  const matchedRequired: Array<{ required: string; matched: string; weight: number }> = [];
  const missingRequired: string[] = [];

  for (const req of requiredSkills) {
    let bestMatch = { skill: '', weight: 0 };

    for (const seeker of resolved) {
      const weight = skillSimilarity(seeker.resolved, req);
      if (weight > bestMatch.weight) {
        bestMatch = { skill: seeker.original, weight };
      }
    }

    if (bestMatch.weight >= 0.25) {
      matchedRequired.push({ required: req, matched: bestMatch.skill, weight: bestMatch.weight });
    } else {
      missingRequired.push(req);
    }
  }

  const matchedPreferred: Array<{ preferred: string; matched: string; weight: number }> = [];

  for (const pref of preferredSkills) {
    let bestMatch = { skill: '', weight: 0 };

    for (const seeker of resolved) {
      const weight = skillSimilarity(seeker.resolved, pref);
      if (weight > bestMatch.weight) {
        bestMatch = { skill: seeker.original, weight };
      }
    }

    if (bestMatch.weight >= 0.25) {
      matchedPreferred.push({ preferred: pref, matched: bestMatch.skill, weight: bestMatch.weight });
    }
  }

  const requiredCoverage = requiredSkills.length > 0
    ? matchedRequired.reduce((sum, m) => sum + m.weight, 0) / requiredSkills.length
    : 1;

  const preferredCoverage = preferredSkills.length > 0
    ? matchedPreferred.reduce((sum, m) => sum + m.weight, 0) / preferredSkills.length
    : 0;

  const totalWeightedScore = requiredSkills.length + preferredSkills.length > 0
    ? (matchedRequired.reduce((sum, m) => sum + m.weight, 0) * 0.8 +
       matchedPreferred.reduce((sum, m) => sum + m.weight, 0) * 0.2) /
      (requiredSkills.length * 0.8 + preferredSkills.length * 0.2 || 1)
    : 0;

  return {
    requiredCoverage,
    preferredCoverage,
    matchedRequired,
    matchedPreferred,
    missingRequired,
    totalWeightedScore,
  };
}
