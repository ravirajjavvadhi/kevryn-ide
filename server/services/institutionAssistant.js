const User = require('../User');
const LabSession = require('../LabSessionModel');
const Assignment = require('../models/Assignment');
const Submission = require('../models/Submission');
const Timetable = require('../models/Timetable');

const scopeFor = collegeId => {
    if (!collegeId) throw new Error('Your account is not linked to an institution. Contact management before using institution intelligence.');
    return { collegeId };
};

const cleanIdentifier = value => String(value || '').trim().toUpperCase();

// A KevRyn student roll number is also their username.  Treat a standalone
// identifier as a lookup too, so `24AG1A05L6` works without special wording.
const extractStudentIdentifier = text => {
    const value = String(text || '').trim();
    if (/^[a-z0-9][a-z0-9_-]{3,}$/i.test(value)) return cleanIdentifier(value);
    const match = value.match(/(?:student|roll(?:\s+number)?|details?\s+(?:of|for)|report\s+(?:of|for)|attendance\s+(?:of|for))\s*[:#-]?\s*([a-z0-9][a-z0-9_-]{3,})/i);
    return match ? cleanIdentifier(match[1]) : null;
};

const attendanceFor = session => {
    const attendees = new Set((session.activeStudents || []).map(item => item.username).filter(Boolean));
    (session.activityLog || []).forEach(log => {
        if (log.event?.type === 'login' && log.username) attendees.add(log.username);
    });
    return { attended: attendees.size, expected: (session.allowedStudents || []).length };
};

const presentIn = (session, username) => (
    (session.activeStudents || []).some(item => cleanIdentifier(item.username) === username) ||
    (session.activityLog || []).some(item => item.event?.type === 'login' && cleanIdentifier(item.username) === username)
);

const durationMinutes = session => {
    if (session.endTime && session.startTime) return Math.max(0, Math.round((new Date(session.endTime) - new Date(session.startTime)) / 60000));
    return Number(session.duration) || 0;
};

const kpi = (label, value, tone = 'neutral') => ({ label, value: String(value), tone });

async function buildStudentReport({ collegeId, identifier, facultyId = null }) {
    const scope = scopeFor(collegeId);
    const username = cleanIdentifier(identifier);
    const student = await User.findOne({ ...scope, role: 'student', username }).select('username name rollNumber department year section isActiveStudent createdAt').lean();
    if (!student) return { found: false, identifier: username, reason: 'No student with this roll number exists in your institution.' };

    const sessionScope = facultyId ? { ...scope, facultyId } : scope;
    const sessions = await LabSession.find({
        ...sessionScope,
        $or: [{ allowedStudents: username }, { 'activeStudents.username': username }, { 'activityLog.username': username }]
    }).select('sessionName subject startTime endTime duration isActive allowedStudents activeStudents activityLog').sort({ startTime: -1 }).lean();

    // A faculty member may only inspect a student who is present in at least
    // one of that faculty member's sessions. Management has college-wide scope.
    if (facultyId && !sessions.length) return { found: false, identifier: username, reason: 'This student is not in any lab session assigned to you.' };

    const attended = sessions.filter(session => presentIn(session, username)).length;
    const courseSubjects = [...new Set(sessions.map(session => session.subject).filter(Boolean))];
    const assignmentScope = facultyId && courseSubjects.length
        ? { ...scope, targetDepartment: student.department, targetYear: student.year, targetSection: student.section, subjectName: { $in: courseSubjects } }
        : { ...scope, targetDepartment: student.department, targetYear: student.year, targetSection: student.section };
    const assignments = await Assignment.find(assignmentScope).select('title subjectName maxPoints endTime').lean();
    const assignmentIds = assignments.map(item => item._id);
    // Never load submitted source code or other large payloads into the
    // intelligence context.  The UI only needs factual submission metadata.
    const submissions = assignmentIds.length
        ? await Submission.find({ ...scope, studentUsername: student.username, assignmentId: { $in: assignmentIds } })
            .select('assignmentId status score maxScore submittedAt gradedAt timeSpentSeconds tabSwitches fullScreenExits')
            .populate('assignmentId', 'title subjectName maxPoints')
            .sort({ submittedAt: -1 }).limit(12).lean()
        : [];
    const graded = submissions.filter(item => ['submitted', 'graded'].includes(item.status));
    const averageScore = graded.length ? Math.round(graded.reduce((sum, item) => sum + ((item.score / (item.maxScore || 100)) * 100), 0) / graded.length) : null;
    const attendancePercentage = sessions.length ? Math.round((attended / sessions.length) * 100) : 0;

    const blocks = [
        {
            type: 'profile',
            title: `${student.rollNumber || student.username} · ${student.name || 'Student'}`,
            subtitle: `${student.department || '—'} · Year ${student.year || '—'} · Section ${student.section || '—'}`
        },
        {
            type: 'kpis',
            items: [
                kpi('Attendance', `${attendancePercentage}%`, attendancePercentage < 75 ? 'warning' : 'success'),
                kpi('Labs', `${attended}/${sessions.length}`, 'primary'),
                kpi('Submissions', `${submissions.length}/${assignments.length}`, submissions.length < assignments.length ? 'warning' : 'success'),
                kpi('Average score', averageScore === null ? '—' : `${averageScore}%`, averageScore !== null && averageScore < 50 ? 'warning' : 'primary')
            ]
        },
        {
            type: 'table', title: 'Recent lab activity', columns: ['Lab', 'Date', 'Status', 'Attendance'],
            rows: sessions.slice(0, 8).map(session => [session.sessionName || session.subject || 'Lab', session.startTime ? new Date(session.startTime).toLocaleDateString() : '—', session.isActive ? 'Live' : 'Completed', presentIn(session, username) ? 'Present' : 'Absent'])
        },
        {
            type: 'table', title: 'Recent submissions', columns: ['Assignment', 'Subject', 'Status', 'Score'],
            rows: submissions.slice(0, 8).map(item => [item.assignmentId?.title || 'Assignment', item.assignmentId?.subjectName || '—', item.status || 'Draft', item.status === 'graded' || item.status === 'submitted' ? `${item.score}/${item.maxScore || item.assignmentId?.maxPoints || 100}` : '—'])
        }
    ];
    const summary = { labsAssigned: sessions.length, labsAttended: attended, attendancePercentage, assignmentsAvailable: assignments.length, submissions: submissions.length, averageScore };
    const llmContext = {
        student: { rollNumber: student.rollNumber || student.username, username: student.username, department: student.department, year: student.year, section: student.section, active: student.isActiveStudent !== false },
        summary,
        recentLabs: sessions.slice(0, 6).map(session => ({ name: session.sessionName || session.subject || 'Lab', subject: session.subject || null, status: session.isActive ? 'Live' : 'Completed', startedAt: session.startTime || null, durationMinutes: durationMinutes(session), attendance: presentIn(session, username) ? 'Present' : 'Absent' })),
        recentSubmissions: submissions.slice(0, 6).map(item => ({ title: item.assignmentId?.title || 'Assignment', subject: item.assignmentId?.subjectName || null, status: item.status || 'Draft', score: item.score ?? null, maxScore: item.maxScore || item.assignmentId?.maxPoints || null, submittedAt: item.submittedAt || null }))
    };
    return {
        found: true, student, sessions, submissions, summary,
        llmContext,
        blocks, freshness: new Date().toISOString()
    };
}

async function buildFacultyOverview({ collegeId, facultyId }) {
    const scope = { ...scopeFor(collegeId), facultyId };
    const [sessions, timetable] = await Promise.all([
        LabSession.find(scope).select('sessionName subject startTime endTime duration isActive allowedStudents activeStudents activityLog').sort({ startTime: -1 }).limit(12).lean(),
        Timetable.find(scopeFor(collegeId)).select('facultyId subjectName dayOfWeek startTime endTime labRoom').lean()
    ]);
    const ownTimetable = timetable.filter(item => String(item.facultyId) === String(facultyId));
    const live = sessions.filter(item => item.isActive);
    const recent = sessions.find(item => !item.isActive) || sessions[0];
    const attendance = sessions.reduce((total, session) => {
        const result = attendanceFor(session);
        return { attended: total.attended + result.attended, expected: total.expected + result.expected };
    }, { attended: 0, expected: 0 });
    const summarizeSession = session => {
        const value = attendanceFor(session);
        return { name: session.sessionName || session.subject || 'Lab', subject: session.subject || null, status: session.isActive ? 'Live' : 'Completed', startedAt: session.startTime || null, endedAt: session.endTime || null, durationMinutes: durationMinutes(session), attended: value.attended, expected: value.expected };
    };
    const attendancePercentage = attendance.expected ? Math.round((attendance.attended / attendance.expected) * 100) : 0;
    const llmContext = {
        summary: { liveLabs: live.length, recentLabs: sessions.length, attendancePercentage, weeklySlots: ownTimetable.length },
        liveLabs: live.slice(0, 4).map(summarizeSession),
        recentLabs: sessions.filter(session => !session.isActive).slice(0, 6).map(summarizeSession),
        upcomingTimetable: ownTimetable.slice(0, 8).map(item => ({ subject: item.subjectName || 'Subject', day: item.dayOfWeek || null, startTime: item.startTime || null, endTime: item.endTime || null, room: item.labRoom || null }))
    };
    return {
        sessions, live, recent, timetable: ownTimetable,
        llmContext,
        blocks: [
            { type: 'kpis', items: [kpi('Live labs', live.length, live.length ? 'success' : 'neutral'), kpi('Recent labs', sessions.length, 'primary'), kpi('Attendance', attendance.expected ? `${Math.round((attendance.attended / attendance.expected) * 100)}%` : '—', 'primary'), kpi('Weekly slots', ownTimetable.length, 'neutral')] },
            { type: 'table', title: 'Your recent sessions', columns: ['Lab', 'Status', 'Attendance', 'Started'], rows: sessions.slice(0, 6).map(session => { const value = attendanceFor(session); return [session.sessionName || session.subject || 'Lab', session.isActive ? 'Live' : 'Completed', `${value.attended}/${value.expected}`, session.startTime ? new Date(session.startTime).toLocaleString() : '—']; }) }
        ],
        freshness: new Date().toISOString()
    };
}

module.exports = { buildFacultyOverview, buildStudentReport, extractStudentIdentifier, scopeFor };
