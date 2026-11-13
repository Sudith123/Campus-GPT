export interface AttendanceCalculation {
  attended: number;
  conducted: number;
  requiredPercentage: number;
  currentPercentage: number;
  status: 'safe' | 'borderline' | 'shortage';
  classesCanMiss: number;
  classesNeededToRecover: number;
  projectedPercentageIfMissOne: number;
  explanation: string;
}

/**
 * Deterministic calculation for attendance eligibility and miss/recovery allowance.
 * Does not assume one universal threshold; uses configurable requiredPercentage.
 */
export function calculateAttendanceMetrics(
  attended: number,
  conducted: number,
  requiredPercentage: number = 75
): AttendanceCalculation {
  const safeAttended = Math.max(0, Math.floor(attended));
  const safeConducted = Math.max(0, Math.floor(conducted));
  const reqPct = Math.min(99, Math.max(1, requiredPercentage));
  const reqRatio = reqPct / 100;

  if (safeConducted === 0) {
    return {
      attended: 0,
      conducted: 0,
      requiredPercentage: reqPct,
      currentPercentage: 100,
      status: 'safe',
      classesCanMiss: 0,
      classesNeededToRecover: 0,
      projectedPercentageIfMissOne: 0,
      explanation: `No classes have been conducted yet. Policy requires ${reqPct}% attendance once sessions begin.`,
    };
  }

  const clampedAttended = Math.min(safeAttended, safeConducted);
  const currentPercentage = Number(((clampedAttended / safeConducted) * 100).toFixed(2));
  const projectedPercentageIfMissOne = Number(((clampedAttended / (safeConducted + 1)) * 100).toFixed(2));

  let classesCanMiss = 0;
  let classesNeededToRecover = 0;

  if (currentPercentage >= reqPct) {
    // Max total classes T where clampedAttended / T >= reqRatio => T <= clampedAttended / reqRatio
    const maxTotalClasses = Math.floor((clampedAttended + 1e-9) / reqRatio);
    classesCanMiss = Math.max(0, maxTotalClasses - safeConducted);
  } else {
    // Min extra consecutive classes x where (clampedAttended + x) / (safeConducted + x) >= reqRatio
    // => x >= (reqRatio * safeConducted - clampedAttended) / (1 - reqRatio)
    classesNeededToRecover = Math.max(
      1,
      Math.ceil((reqRatio * safeConducted - clampedAttended - 1e-9) / (1 - reqRatio))
    );
  }

  const status: 'safe' | 'borderline' | 'shortage' =
    currentPercentage < reqPct
      ? 'shortage'
      : currentPercentage < reqPct + 5
        ? 'borderline'
        : 'safe';

  const explanation =
    currentPercentage >= reqPct
      ? `Based on ${clampedAttended}/${safeConducted} classes (${currentPercentage}%) against the configured ${reqPct}% policy, you may miss up to ${classesCanMiss} upcoming class${classesCanMiss === 1 ? '' : 'es'} without dropping below ${reqPct}%, assuming no condonation waivers.`
      : `Based on ${clampedAttended}/${safeConducted} classes (${currentPercentage}%), you are below the configured ${reqPct}% requirement. You must attend ${classesNeededToRecover} consecutive class${classesNeededToRecover === 1 ? '' : 'es'} without missing any to reach ${reqPct}%.`;

  return {
    attended: clampedAttended,
    conducted: safeConducted,
    requiredPercentage: reqPct,
    currentPercentage,
    status,
    classesCanMiss,
    classesNeededToRecover,
    projectedPercentageIfMissOne,
    explanation,
  };
}

export interface MarkEntryInput {
  subjectCode: string;
  subjectName: string;
  examName: string;
  marksObtained: number;
  maxMarks: number;
}

export interface PerformanceSummary {
  overallPercentage: number;
  estimatedCgpa: number;
  letterGrade: string;
  totalObtained: number;
  totalMax: number;
  subjectSummaries: Array<{
    subjectCode: string;
    subjectName: string;
    obtained: number;
    max: number;
    percentage: number;
    grade: string;
  }>;
  strongestSubject: string | null;
  needsAttentionSubject: string | null;
}

export function percentageToGrade(pct: number): string {
  if (pct >= 90) return 'O';
  if (pct >= 80) return 'A+';
  if (pct >= 70) return 'A';
  if (pct >= 60) return 'B+';
  if (pct >= 50) return 'B';
  if (pct >= 40) return 'C';
  return 'F';
}

export function calculateAcademicPerformance(entries: MarkEntryInput[]): PerformanceSummary {
  if (entries.length === 0) {
    return {
      overallPercentage: 0,
      estimatedCgpa: 0,
      letterGrade: 'N/A',
      totalObtained: 0,
      totalMax: 0,
      subjectSummaries: [],
      strongestSubject: null,
      needsAttentionSubject: null,
    };
  }

  const bySubject = new Map<string, { subjectName: string; obtained: number; max: number }>();
  let totalObtained = 0;
  let totalMax = 0;

  for (const entry of entries) {
    totalObtained += entry.marksObtained;
    totalMax += entry.maxMarks;
    const prev = bySubject.get(entry.subjectCode) || {
      subjectName: entry.subjectName,
      obtained: 0,
      max: 0,
    };
    prev.obtained += entry.marksObtained;
    prev.max += entry.maxMarks;
    bySubject.set(entry.subjectCode, prev);
  }

  const subjectSummaries = Array.from(bySubject.entries()).map(([subjectCode, data]) => {
    const pct = data.max > 0 ? Number(((data.obtained / data.max) * 100).toFixed(2)) : 0;
    return {
      subjectCode,
      subjectName: data.subjectName,
      obtained: data.obtained,
      max: data.max,
      percentage: pct,
      grade: percentageToGrade(pct),
    };
  });

  subjectSummaries.sort((a, b) => b.percentage - a.percentage);

  const overallPercentage = totalMax > 0 ? Number(((totalObtained / totalMax) * 100).toFixed(2)) : 0;
  const estimatedCgpa = Number(Math.min(10, Math.max(0, overallPercentage / 9.5)).toFixed(2));

  return {
    overallPercentage,
    estimatedCgpa,
    letterGrade: percentageToGrade(overallPercentage),
    totalObtained,
    totalMax,
    subjectSummaries,
    strongestSubject: subjectSummaries[0]?.subjectName ?? null,
    needsAttentionSubject:
      subjectSummaries.length > 0 ? subjectSummaries[subjectSummaries.length - 1].subjectName : null,
  };
}

export interface PlacementEligibilityInput {
  cgpa: number;
  activeBacklogs: number;
  departmentCode: string;
  semester: number;
}

export interface PlacementDriveCriteria {
  minCgpa: number;
  maxBacklogs: number;
  allowedDepartments: string[];
  minSemester?: number;
}

export interface PlacementEligibilityResult {
  eligible: boolean;
  reasons: string[];
}

export function evaluatePlacementEligibility(
  student: PlacementEligibilityInput,
  criteria: PlacementDriveCriteria
): PlacementEligibilityResult {
  const reasons: string[] = [];

  if (student.cgpa < criteria.minCgpa) {
    reasons.push(`Requires minimum CGPA ${criteria.minCgpa.toFixed(2)} (current: ${student.cgpa.toFixed(2)})`);
  }
  if (student.activeBacklogs > criteria.maxBacklogs) {
    reasons.push(`Allows at most ${criteria.maxBacklogs} active backlog(s) (current: ${student.activeBacklogs})`);
  }
  if (
    criteria.allowedDepartments.length > 0 &&
    !criteria.allowedDepartments.includes('ALL') &&
    !criteria.allowedDepartments.includes(student.departmentCode)
  ) {
    reasons.push(`Restricted to ${criteria.allowedDepartments.join(', ')} (your department: ${student.departmentCode})`);
  }
  if (criteria.minSemester && student.semester < criteria.minSemester) {
    reasons.push(`Requires Semester ${criteria.minSemester}+ (current: Sem ${student.semester})`);
  }

  return {
    eligible: reasons.length === 0,
    reasons,
  };
}

export interface PageText {
  pageNumber: number;
  text: string;
}

export interface DocumentChunk {
  chunkIndex: number;
  pageNumber: number;
  content: string;
}

export function chunkDocumentText(
  pages: PageText[],
  chunkSize: number = 900,
  overlap: number = 150
): DocumentChunk[] {
  const chunks: DocumentChunk[] = [];
  let chunkIndex = 0;

  for (const page of pages) {
    const cleaned = page.text.replace(/\s+/g, ' ').trim();
    if (!cleaned) continue;

    if (cleaned.length <= chunkSize) {
      chunks.push({
        chunkIndex: chunkIndex++,
        pageNumber: page.pageNumber,
        content: cleaned,
      });
      continue;
    }

    let start = 0;
    while (start < cleaned.length) {
      let end = Math.min(cleaned.length, start + chunkSize);
      if (end < cleaned.length) {
        const lastSpace = cleaned.lastIndexOf(' ', end);
        if (lastSpace > start + chunkSize * 0.5) {
          end = lastSpace;
        }
      }
      const slice = cleaned.slice(start, end).trim();
      if (slice.length > 0) {
        chunks.push({
          chunkIndex: chunkIndex++,
          pageNumber: page.pageNumber,
          content: slice,
        });
      }
      if (end >= cleaned.length) break;
      start = Math.max(end - overlap, start + 1);
    }
  }

  return chunks;
}

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length === 0 || b.length === 0 || a.length !== b.length) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

export interface TimetableSlot {
  id?: number;
  dayOfWeek: string;
  startTime: string;
  endTime: string;
  room: string;
  teacherId: number;
  departmentId: number;
  semester: number;
}

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

export function checkTimetableConflict(
  existing: TimetableSlot[],
  candidate: TimetableSlot
): string | null {
  const cStart = toMinutes(candidate.startTime);
  const cEnd = toMinutes(candidate.endTime);

  if (cEnd <= cStart) {
    return 'End time must be after start time.';
  }

  for (const slot of existing) {
    if (candidate.id && slot.id === candidate.id) continue;
    if (slot.dayOfWeek !== candidate.dayOfWeek) continue;

    const sStart = toMinutes(slot.startTime);
    const sEnd = toMinutes(slot.endTime);
    const overlaps = cStart < sEnd && sStart < cEnd;
    if (!overlaps) continue;

    if (slot.room.trim().toLowerCase() === candidate.room.trim().toLowerCase()) {
      return `Room ${candidate.room} is already booked on ${candidate.dayOfWeek} (${slot.startTime}-${slot.endTime}).`;
    }
    if (slot.teacherId === candidate.teacherId) {
      return `Assigned teacher already has a class on ${candidate.dayOfWeek} (${slot.startTime}-${slot.endTime}).`;
    }
    if (slot.departmentId === candidate.departmentId && slot.semester === candidate.semester) {
      return `Semester ${candidate.semester} already has a scheduled class on ${candidate.dayOfWeek} (${slot.startTime}-${slot.endTime}).`;
    }
  }

  return null;
}
