const { cert, getApps, initializeApp } = require('firebase-admin/app')
const { getFirestore, FieldValue } = require('firebase-admin/firestore')

function getDb() {
  const raw = process.env.FIREBASE_ADMIN_SERVICE_ACCOUNT_JSON
  if (!raw) {
    throw new Error(
      'FIREBASE_ADMIN_SERVICE_ACCOUNT_JSON ausente. Defina antes de rodar a auditoria.',
    )
  }
  if (!getApps().length) {
    initializeApp({ credential: cert(JSON.parse(raw)) })
  }
  return getFirestore()
}

function asString(v) {
  return typeof v === 'string' ? v.trim() : ''
}

async function run() {
  const applyFixes = process.argv.includes('--apply-fixes')
  const db = getDb()

  const collections = {
    trails: process.env.TRAILS_COLLECTION || 'trails',
    students: process.env.STUDENTS_COLLECTION || 'students',
    studentTrails: process.env.STUDENT_TRAILS_COLLECTION || 'student_trails',
    trailStages: process.env.TRAIL_STAGES_COLLECTION || 'trail_stages',
    trailStageQuestions:
      process.env.TRAIL_STAGE_QUESTIONS_COLLECTION || 'trail_stage_questions',
    conversationLogs: process.env.CONVERSATION_LOGS_COLLECTION || 'conversation_logs',
  }

  const [
    trailsSnap,
    studentsSnap,
    studentTrailsSnap,
    trailStagesSnap,
    trailStageQuestionsSnap,
    conversationLogsSnap,
  ] = await Promise.all([
    db.collection(collections.trails).get(),
    db.collection(collections.students).get(),
    db.collection(collections.studentTrails).get(),
    db.collection(collections.trailStages).get(),
    db.collection(collections.trailStageQuestions).get(),
    db.collection(collections.conversationLogs).get(),
  ])

  const trailInstitutionById = new Map()
  for (const d of trailsSnap.docs) {
    const data = d.data() || {}
    trailInstitutionById.set(d.id, asString(data.institution_id))
  }
  const studentInstitutionById = new Map()
  for (const d of studentsSnap.docs) {
    const data = d.data() || {}
    studentInstitutionById.set(d.id, asString(data.institution_id))
  }

  const report = {
    totals: {
      trails: trailsSnap.size,
      students: studentsSnap.size,
      student_trails: studentTrailsSnap.size,
      trail_stages: trailStagesSnap.size,
      trail_stage_questions: trailStageQuestionsSnap.size,
      conversation_logs: conversationLogsSnap.size,
    },
    issues: {
      studentTrailOrphanStudent: 0,
      studentTrailOrphanTrail: 0,
      studentTrailInstitutionDiffTrail: 0,
      studentInstitutionDiffTrail: 0,
      trailStagesOrphanTrail: 0,
      trailStageQuestionsOrphanTrail: 0,
      conversationLogsOrphanTrail: 0,
    },
    fixes: {
      safeStudentTrailInstitutionUpdates: 0,
      appliedStudentTrailInstitutionUpdates: 0,
    },
  }

  const safeFixDocIds = []
  for (const d of studentTrailsSnap.docs) {
    const data = d.data() || {}
    const studentId = asString(data.student_id)
    const trailId = asString(data.trail_id)
    const studentTrailInstitutionId = asString(data.institution_id)
    const studentInstitutionId = studentInstitutionById.get(studentId) || ''
    const trailInstitutionId = trailInstitutionById.get(trailId) || ''

    if (!studentInstitutionById.has(studentId)) {
      report.issues.studentTrailOrphanStudent += 1
    }
    if (!trailInstitutionById.has(trailId)) {
      report.issues.studentTrailOrphanTrail += 1
    }

    if (
      trailInstitutionId &&
      studentTrailInstitutionId &&
      studentTrailInstitutionId !== trailInstitutionId
    ) {
      report.issues.studentTrailInstitutionDiffTrail += 1
    }

    if (
      trailInstitutionId &&
      studentInstitutionId &&
      studentInstitutionId !== trailInstitutionId
    ) {
      report.issues.studentInstitutionDiffTrail += 1
    }

    if (
      trailInstitutionId &&
      studentInstitutionId &&
      studentInstitutionId === trailInstitutionId &&
      studentTrailInstitutionId !== trailInstitutionId
    ) {
      report.fixes.safeStudentTrailInstitutionUpdates += 1
      safeFixDocIds.push(d.id)
    }
  }

  for (const d of trailStagesSnap.docs) {
    const trailId = asString((d.data() || {}).trail_id)
    if (!trailInstitutionById.has(trailId)) {
      report.issues.trailStagesOrphanTrail += 1
    }
  }
  for (const d of trailStageQuestionsSnap.docs) {
    const trailId = asString((d.data() || {}).trail_id)
    if (!trailInstitutionById.has(trailId)) {
      report.issues.trailStageQuestionsOrphanTrail += 1
    }
  }
  for (const d of conversationLogsSnap.docs) {
    const trailId = asString((d.data() || {}).trail_id)
    if (!trailInstitutionById.has(trailId)) {
      report.issues.conversationLogsOrphanTrail += 1
    }
  }

  if (applyFixes && safeFixDocIds.length > 0) {
    const chunkSize = 400
    for (let start = 0; start < safeFixDocIds.length; start += chunkSize) {
      const chunk = safeFixDocIds.slice(start, start + chunkSize)
      const batch = db.batch()
      for (const docId of chunk) {
        const ref = db.collection(collections.studentTrails).doc(docId)
        const snap = await ref.get()
        if (!snap.exists) continue
        const data = snap.data() || {}
        const trailId = asString(data.trail_id)
        const trailInstitutionId = trailInstitutionById.get(trailId) || ''
        if (!trailInstitutionId) continue
        batch.update(ref, {
          institution_id: trailInstitutionId,
          updated_at: FieldValue.serverTimestamp(),
        })
        report.fixes.appliedStudentTrailInstitutionUpdates += 1
      }
      await batch.commit()
    }
  }

  console.log(JSON.stringify({ applyFixes, collections, report }, null, 2))
}

run().catch((err) => {
  console.error(
    JSON.stringify(
      {
        error: err instanceof Error ? err.message : String(err),
      },
      null,
      2,
    ),
  )
  process.exit(1)
})
