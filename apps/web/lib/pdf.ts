function escapePdfText(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

export function buildSimplePdf(lines: string[]) {
  const sanitizedLines = lines.map((line) => escapePdfText(line));
  const contentLines = ["BT", "/F1 11 Tf", "14 TL", "50 760 Td"];
  sanitizedLines.forEach((line, index) => {
    if (index > 0) {
      contentLines.push("T*");
    }
    contentLines.push(`(${line}) Tj`);
  });
  contentLines.push("ET");

  const contentStream = contentLines.join("\n");

  const objects: string[] = [];
  objects.push("1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj");
  objects.push("2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj");
  objects.push(
    "3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >> endobj"
  );
  objects.push(
    `4 0 obj << /Length ${Buffer.byteLength(contentStream, "utf8")} >> stream\n${contentStream}\nendstream endobj`
  );
  objects.push("5 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj");

  let offset = 0;
  const parts: string[] = [];
  const offsets: number[] = [];

  const header = "%PDF-1.4\n";
  parts.push(header);
  offset += Buffer.byteLength(header, "utf8");

  for (const obj of objects) {
    offsets.push(offset);
    const chunk = `${obj}\n`;
    parts.push(chunk);
    offset += Buffer.byteLength(chunk, "utf8");
  }

  const xrefStart = offset;
  const xrefLines = ["xref", `0 ${objects.length + 1}`, "0000000000 65535 f "];
  offsets.forEach((objOffset) => {
    const line = `${objOffset.toString().padStart(10, "0")} 00000 n `;
    xrefLines.push(line);
  });

  const xrefContent = `${xrefLines.join("\n")}\n`;
  parts.push(xrefContent);
  offset += Buffer.byteLength(xrefContent, "utf8");

  const trailer = `trailer << /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;
  parts.push(trailer);

  return Buffer.from(parts.join(""), "utf8");
}

function chunkLines(lines: string[], linesPerPage: number) {
  const chunks: string[][] = [];
  for (let i = 0; i < lines.length; i += linesPerPage) {
    chunks.push(lines.slice(i, i + linesPerPage));
  }
  if (chunks.length === 0) {
    chunks.push([""]);
  }
  return chunks;
}

export function buildPagedPdf(
  lines: string[],
  options?: {
    linesPerPage?: number;
    fontSize?: number;
    lineHeight?: number;
    startX?: number;
    startY?: number;
  }
) {
  const linesPerPage = options?.linesPerPage ?? 48;
  const fontSize = options?.fontSize ?? 11;
  const lineHeight = options?.lineHeight ?? 14;
  const startX = options?.startX ?? 50;
  const startY = options?.startY ?? 760;

  const pages = chunkLines(lines, linesPerPage).map((pageLines) => {
    const sanitizedLines = pageLines.map((line) => escapePdfText(line));
    const contentLines = ["BT", `/F1 ${fontSize} Tf`, `${lineHeight} TL`, `${startX} ${startY} Td`];
    sanitizedLines.forEach((line, index) => {
      if (index > 0) {
        contentLines.push("T*");
      }
      contentLines.push(`(${line}) Tj`);
    });
    contentLines.push("ET");
    return contentLines.join("\n");
  });

  const objects: string[] = [];
  const pageRefs = pages.map((_, index) => `${3 + index} 0 R`).join(" ");
  const fontObjNum = 3 + pages.length * 2;

  objects.push("1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj");
  objects.push(
    `2 0 obj << /Type /Pages /Kids [${pageRefs}] /Count ${pages.length} >> endobj`
  );

  pages.forEach((_, index) => {
    const pageObjNum = 3 + index;
    const contentObjNum = 3 + pages.length + index;
    objects.push(
      `${pageObjNum} 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents ${contentObjNum} 0 R /Resources << /Font << /F1 ${fontObjNum} 0 R >> >> >> endobj`
    );
  });

  pages.forEach((contentStream, index) => {
    const contentObjNum = 3 + pages.length + index;
    objects.push(
      `${contentObjNum} 0 obj << /Length ${Buffer.byteLength(
        contentStream,
        "utf8"
      )} >> stream\n${contentStream}\nendstream endobj`
    );
  });

  objects.push(
    `${fontObjNum} 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj`
  );

  let offset = 0;
  const parts: string[] = [];
  const offsets: number[] = [];

  const header = "%PDF-1.4\n";
  parts.push(header);
  offset += Buffer.byteLength(header, "utf8");

  for (const obj of objects) {
    offsets.push(offset);
    const chunk = `${obj}\n`;
    parts.push(chunk);
    offset += Buffer.byteLength(chunk, "utf8");
  }

  const xrefStart = offset;
  const xrefLines = ["xref", `0 ${objects.length + 1}`, "0000000000 65535 f "];
  offsets.forEach((objOffset) => {
    const line = `${objOffset.toString().padStart(10, "0")} 00000 n `;
    xrefLines.push(line);
  });

  const xrefContent = `${xrefLines.join("\n")}\n`;
  parts.push(xrefContent);
  offset += Buffer.byteLength(xrefContent, "utf8");

  const trailer = `trailer << /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;
  parts.push(trailer);

  return Buffer.from(parts.join(""), "utf8");
}

type PdfFontName = "F1" | "F2";
type PdfRgb = [number, number, number];

export type StyledJobGeniusActionStep = {
  step: string;
  why?: string;
  timeline?: string;
  priority?: string;
};

export type StyledJobGeniusReportPayload = {
  title: string;
  seekerName: string;
  seekerEmail: string;
  generatedAtIso: string;
  goal: string;
  adminInput: string;
  profileReadiness: string;
  summary: string;
  analysis: string[];
  actionSteps: StyledJobGeniusActionStep[];
  suggestions: string[];
  nextSteps: string[];
};

function wrapTextForPdf(value: string, maxChars: number): string[] {
  const cleaned = value.replace(/\s+/g, " ").trim();
  if (!cleaned) return [""];
  if (cleaned.length <= maxChars) return [cleaned];

  const words = cleaned.split(" ");
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    if (!current) {
      current = word;
      continue;
    }

    if (current.length + 1 + word.length <= maxChars) {
      current += ` ${word}`;
      continue;
    }

    lines.push(current);
    current = word;
  }

  if (current) {
    lines.push(current);
  }

  return lines;
}

function pushText(
  commands: string[],
  text: string,
  x: number,
  y: number,
  font: PdfFontName,
  size: number,
  color: PdfRgb
) {
  commands.push("BT");
  commands.push(`/${font} ${size} Tf`);
  commands.push(`${color[0]} ${color[1]} ${color[2]} rg`);
  commands.push(`${x} ${y} Td`);
  commands.push(`(${escapePdfText(text)}) Tj`);
  commands.push("ET");
}

function buildPdfFromPageStreams(pageStreams: string[]) {
  const pageCount = Math.max(1, pageStreams.length);
  const objects: string[] = [];
  const pageStart = 3;
  const contentStart = pageStart + pageCount;
  const fontRegularObj = contentStart + pageCount;
  const fontBoldObj = fontRegularObj + 1;

  const pageRefs = Array.from({ length: pageCount }, (_, index) => {
    return `${pageStart + index} 0 R`;
  }).join(" ");

  objects.push("1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj");
  objects.push(`2 0 obj << /Type /Pages /Kids [${pageRefs}] /Count ${pageCount} >> endobj`);

  for (let index = 0; index < pageCount; index += 1) {
    const pageObj = pageStart + index;
    const contentObj = contentStart + index;
    objects.push(
      `${pageObj} 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents ${contentObj} 0 R /Resources << /Font << /F1 ${fontRegularObj} 0 R /F2 ${fontBoldObj} 0 R >> >> >> endobj`
    );
  }

  for (let index = 0; index < pageCount; index += 1) {
    const contentObj = contentStart + index;
    const stream = pageStreams[index] || "";
    objects.push(
      `${contentObj} 0 obj << /Length ${Buffer.byteLength(stream, "utf8")} >> stream\n${stream}\nendstream endobj`
    );
  }

  objects.push(
    `${fontRegularObj} 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj`
  );
  objects.push(
    `${fontBoldObj} 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >> endobj`
  );

  let offset = 0;
  const parts: string[] = [];
  const offsets: number[] = [];

  const header = "%PDF-1.4\n";
  parts.push(header);
  offset += Buffer.byteLength(header, "utf8");

  for (const obj of objects) {
    offsets.push(offset);
    const chunk = `${obj}\n`;
    parts.push(chunk);
    offset += Buffer.byteLength(chunk, "utf8");
  }

  const xrefStart = offset;
  const xrefLines = ["xref", `0 ${objects.length + 1}`, "0000000000 65535 f "];
  offsets.forEach((objOffset) => {
    xrefLines.push(`${objOffset.toString().padStart(10, "0")} 00000 n `);
  });
  const xref = `${xrefLines.join("\n")}\n`;
  parts.push(xref);

  const trailer = `trailer << /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;
  parts.push(trailer);

  return Buffer.from(parts.join(""), "utf8");
}

export function buildStyledJobGeniusReportPdf(
  payload: StyledJobGeniusReportPayload
) {
  const pageWidth = 612;
  const pageHeight = 792;
  const marginX = 48;
  const contentWidth = pageWidth - marginX * 2;
  const bodyColor: PdfRgb = [0.16, 0.19, 0.24];
  const mutedColor: PdfRgb = [0.36, 0.41, 0.5];

  const pages: string[][] = [];
  let commands: string[] = [];
  let y = 0;

  const startPage = (continuation: boolean) => {
    if (commands.length > 0) {
      pages.push(commands);
    }

    commands = [];
    commands.push("1 1 1 rg");
    commands.push(`0 0 ${pageWidth} ${pageHeight} re f`);

    if (!continuation) {
      commands.push("0.08 0.2 0.44 rg");
      commands.push(`0 666 ${pageWidth} 126 re f`);

      pushText(commands, payload.title || "JobGenius Career Strategy Report", 48, 748, "F2", 23, [1, 1, 1]);
      pushText(commands, "Analysis, actions, and direction to secure a strong-fit job.", 48, 726, "F1", 11, [0.86, 0.9, 0.98]);

      commands.push("0.93 0.96 1 rg");
      commands.push("402 705 162 36 re f");
      commands.push("0.76 0.84 0.96 RG");
      commands.push("0.8 w");
      commands.push("402 705 162 36 re S");
      pushText(commands, "Readiness", 414, 726, "F1", 8, [0.14, 0.22, 0.42]);
      pushText(commands, payload.profileReadiness || "Needs Work", 414, 713, "F2", 11, [0.08, 0.2, 0.44]);

      pushText(
        commands,
        `Generated ${new Date(payload.generatedAtIso).toLocaleString()}`,
        48,
        704,
        "F1",
        9,
        [0.86, 0.9, 0.98]
      );
      y = 642;
    } else {
      commands.push("0.93 0.96 1 rg");
      commands.push(`0 748 ${pageWidth} 44 re f`);
      pushText(commands, payload.title || "JobGenius Career Strategy Report", 48, 766, "F2", 12, [0.08, 0.2, 0.44]);
      y = 726;
    }
  };

  const ensureSpace = (height: number) => {
    if (y - height < 64) {
      startPage(true);
    }
  };

  const addSectionTitle = (title: string) => {
    ensureSpace(30);
    commands.push("0.94 0.97 1 rg");
    commands.push(`${marginX} ${y - 20} ${contentWidth} 22 re f`);
    pushText(commands, title, marginX + 10, y - 5, "F2", 12, [0.08, 0.2, 0.44]);
    y -= 30;
  };

  const addParagraph = (
    text: string,
    opts?: { maxChars?: number; indent?: number; font?: PdfFontName; size?: number; color?: PdfRgb; lineHeight?: number }
  ) => {
    const maxChars = opts?.maxChars ?? 96;
    const indent = opts?.indent ?? 0;
    const font = opts?.font ?? "F1";
    const size = opts?.size ?? 10.8;
    const color = opts?.color ?? bodyColor;
    const lineHeight = opts?.lineHeight ?? 14.5;
    const lines = wrapTextForPdf(text, maxChars);

    ensureSpace(lines.length * lineHeight + 6);
    lines.forEach((line) => {
      pushText(commands, line, marginX + indent, y, font, size, color);
      y -= lineHeight;
    });
    y -= 3;
  };

  const addBulletList = (items: string[]) => {
    if (items.length === 0) {
      addParagraph("- No items available.", { color: mutedColor });
      return;
    }

    items.forEach((item) => {
      const wrapped = wrapTextForPdf(item, 86);
      ensureSpace(wrapped.length * 14.5 + 4);
      pushText(commands, `- ${wrapped[0]}`, marginX + 8, y, "F1", 10.6, bodyColor);
      y -= 14.5;
      for (let index = 1; index < wrapped.length; index += 1) {
        pushText(commands, wrapped[index], marginX + 20, y, "F1", 10.6, bodyColor);
        y -= 14.5;
      }
      y -= 2.5;
    });
  };

  const addActionStep = (step: StyledJobGeniusActionStep, index: number) => {
    const stepLines = wrapTextForPdf(`${index + 1}. ${step.step}`, 84);
    const whyLines = step.why ? wrapTextForPdf(`Why: ${step.why}`, 82) : [];
    const meta = [
      step.timeline ? `Timeline: ${step.timeline}` : null,
      step.priority ? `Priority: ${step.priority}` : null,
    ]
      .filter((value): value is string => Boolean(value))
      .join(" | ");
    const metaLines = meta ? wrapTextForPdf(meta, 82) : [];

    const lineCount = stepLines.length + whyLines.length + metaLines.length;
    const boxHeight = lineCount * 13.5 + 16;
    ensureSpace(boxHeight + 10);

    const boxX = marginX + 4;
    const boxY = y - boxHeight + 4;
    const boxWidth = contentWidth - 8;
    commands.push("0.97 0.98 1 rg");
    commands.push(`${boxX} ${boxY} ${boxWidth} ${boxHeight} re f`);
    commands.push("0.84 0.89 0.96 RG");
    commands.push("0.8 w");
    commands.push(`${boxX} ${boxY} ${boxWidth} ${boxHeight} re S`);

    let localY = y - 11;
    stepLines.forEach((line) => {
      pushText(commands, line, marginX + 14, localY, "F2", 10.8, [0.09, 0.2, 0.44]);
      localY -= 13.5;
    });
    whyLines.forEach((line) => {
      pushText(commands, line, marginX + 14, localY, "F1", 10.2, bodyColor);
      localY -= 13.5;
    });
    metaLines.forEach((line) => {
      pushText(commands, line, marginX + 14, localY, "F1", 9.6, mutedColor);
      localY -= 13.5;
    });

    y = boxY - 8;
  };

  startPage(false);

  addSectionTitle("Profile Snapshot");
  addParagraph(`Job Seeker: ${payload.seekerName}`);
  addParagraph(`Email: ${payload.seekerEmail}`);
  addParagraph(`Generated On: ${new Date(payload.generatedAtIso).toLocaleString()}`);

  addSectionTitle("Goal");
  addParagraph(payload.goal);

  if (payload.adminInput.trim()) {
    addSectionTitle("Admin Inputs and Context");
    addParagraph(payload.adminInput);
  }

  addSectionTitle("Executive Summary");
  addParagraph(payload.summary);

  addSectionTitle("Analysis Highlights");
  addBulletList(payload.analysis);

  addSectionTitle("Action Plan");
  if (payload.actionSteps.length === 0) {
    addParagraph("- No action steps available.", { color: mutedColor });
  } else {
    payload.actionSteps.forEach((step, index) => {
      addActionStep(step, index);
    });
  }

  addSectionTitle("Suggestions To Move Forward");
  addBulletList(payload.suggestions);

  addSectionTitle("Next Steps For This Week");
  addBulletList(payload.nextSteps);

  addSectionTitle("JobGenius Note");
  addParagraph(
    "Focused, consistent execution creates interview momentum. Complete the highest-priority steps first, keep your profile current, and review outcomes weekly with your account manager."
  );

  if (commands.length > 0) {
    pages.push(commands);
  }

  const totalPages = pages.length || 1;
  pages.forEach((pageCommands, index) => {
    pageCommands.push("0.87 0.9 0.95 RG");
    pageCommands.push("0.5 w");
    pageCommands.push("48 40 m 564 40 l S");
    pushText(
      pageCommands,
      `JobGenius Report | Page ${index + 1} of ${totalPages}`,
      48,
      26,
      "F1",
      8.8,
      [0.4, 0.45, 0.54]
    );
  });

  return buildPdfFromPageStreams(pages.map((pageCommands) => pageCommands.join("\n")));
}

// ─── Payslip PDF (staff payroll, migration 075) ──────────────

export type PayslipPdfLineItem = {
  label: string;
  amount: number;
};

export type PayslipPdfPayload = {
  employerName?: string;
  workerName: string;
  workerEmail?: string | null;
  jobTitle?: string | null;
  periodLabel: string;
  periodStart?: string | null;
  periodEnd?: string | null;
  payDate?: string | null;
  currency?: string;
  earnings: PayslipPdfLineItem[];
  deductions: PayslipPdfLineItem[];
  gross: number;
  totalDeductions: number;
  net: number;
  payoutDetails?: string | null;
  reference?: string | null;
};

export function buildPayslipPdf(payload: PayslipPdfPayload): Buffer {
  const pageWidth = 612;
  const currency = payload.currency || "USD";
  const employer = payload.employerName || "JobGenius LLC";
  const money = (n: number) =>
    (Number(n) || 0).toLocaleString("en-US", { style: "currency", currency });
  const fmtDate = (iso?: string | null) => {
    if (!iso) return "—";
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("en-US");
  };

  const bodyColor: PdfRgb = [0.16, 0.19, 0.24];
  const mutedColor: PdfRgb = [0.4, 0.45, 0.54];
  const amountX = 420;
  const labelX = 56;
  const commands: string[] = [];

  // background
  commands.push("1 1 1 rg");
  commands.push(`0 0 ${pageWidth} 792 re f`);

  // header band
  commands.push("0.08 0.2 0.44 rg");
  commands.push(`0 712 ${pageWidth} 80 re f`);
  pushText(commands, "PAYSLIP", 48, 760, "F2", 24, [1, 1, 1]);
  pushText(commands, employer, 48, 738, "F1", 11, [0.86, 0.9, 0.98]);
  pushText(commands, payload.periodLabel, 48, 722, "F1", 10, [0.86, 0.9, 0.98]);

  let y = 688;

  // worker + period info
  pushText(commands, "Employee", labelX, y, "F2", 10, [0.08, 0.2, 0.44]);
  pushText(commands, "Pay Details", 340, y, "F2", 10, [0.08, 0.2, 0.44]);
  y -= 16;
  pushText(commands, payload.workerName, labelX, y, "F1", 11, bodyColor);
  pushText(
    commands,
    `Pay date: ${fmtDate(payload.payDate)}`,
    340,
    y,
    "F1",
    10,
    bodyColor
  );
  y -= 14;
  if (payload.jobTitle) {
    pushText(commands, payload.jobTitle, labelX, y, "F1", 10, mutedColor);
  }
  pushText(
    commands,
    `Period: ${fmtDate(payload.periodStart)} – ${fmtDate(payload.periodEnd)}`,
    340,
    y,
    "F1",
    10,
    mutedColor
  );
  y -= 14;
  if (payload.workerEmail) {
    pushText(commands, payload.workerEmail, labelX, y, "F1", 10, mutedColor);
  }
  y -= 22;

  const sectionHeader = (title: string) => {
    commands.push("0.94 0.97 1 rg");
    commands.push(`48 ${y - 16} 516 20 re f`);
    pushText(commands, title, labelX, y - 2, "F2", 11, [0.08, 0.2, 0.44]);
    pushText(commands, "Amount", amountX, y - 2, "F2", 11, [0.08, 0.2, 0.44]);
    y -= 30;
  };

  const lineRow = (label: string, amount: number, bold = false) => {
    const font: PdfFontName = bold ? "F2" : "F1";
    pushText(commands, label, labelX, y, font, 10.5, bodyColor);
    pushText(commands, money(amount), amountX, y, font, 10.5, bodyColor);
    y -= 16;
  };

  sectionHeader("Earnings");
  if (payload.earnings.length === 0) {
    pushText(commands, "No earnings", labelX, y, "F1", 10, mutedColor);
    y -= 16;
  } else {
    payload.earnings.forEach((e) => lineRow(e.label, e.amount));
  }
  y -= 4;
  lineRow("Gross earnings", payload.gross, true);
  y -= 12;

  sectionHeader("Deductions");
  if (payload.deductions.length === 0) {
    pushText(commands, "No deductions", labelX, y, "F1", 10, mutedColor);
    y -= 16;
  } else {
    payload.deductions.forEach((d) => lineRow(d.label, d.amount));
  }
  y -= 4;
  lineRow("Total deductions", payload.totalDeductions, true);
  y -= 18;

  // net pay highlight box
  commands.push("0.08 0.2 0.44 rg");
  commands.push(`48 ${y - 22} 516 34 re f`);
  pushText(commands, "NET PAY", labelX, y - 4, "F2", 12, [1, 1, 1]);
  pushText(commands, money(payload.net), amountX, y - 4, "F2", 13, [1, 1, 1]);
  y -= 44;

  if (payload.reference) {
    pushText(
      commands,
      `Payment reference: ${payload.reference}`,
      labelX,
      y,
      "F1",
      9.5,
      mutedColor
    );
    y -= 14;
  }
  if (payload.payoutDetails) {
    const lines = wrapTextForPdf(`Payout to: ${payload.payoutDetails}`, 90);
    lines.forEach((line) => {
      pushText(commands, line, labelX, y, "F1", 9.5, mutedColor);
      y -= 13;
    });
  }

  // footer
  commands.push("0.87 0.9 0.95 RG");
  commands.push("0.5 w");
  commands.push("48 56 m 564 56 l S");
  pushText(
    commands,
    `${employer} — generated ${new Date().toLocaleDateString("en-US")}. This payslip is a record only.`,
    48,
    42,
    "F1",
    8.8,
    mutedColor
  );

  return buildPdfFromPageStreams([commands.join("\n")]);
}
