const User = require('../User');
const LabSession = require('../LabSessionModel');
const Timetable = require('../models/Timetable');
const Course = require('../models/Course');
const overviewCache = new Map();
const OVERVIEW_TTL_MS = 30 * 1000;
const INSTITUTION_TIME_ZONE = process.env.INSTITUTION_TIME_ZONE || 'Asia/Kolkata';
const cacheKey = collegeId => String(collegeId || 'global');
const invalidateInstitutionOverview = collegeId => overviewCache.delete(cacheKey(collegeId));

const startOfToday = () => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    return { start, end };
};

const institutionWeekday = () => new Intl.DateTimeFormat('en-US', {
    weekday: 'long', timeZone: INSTITUTION_TIME_ZONE
}).format(new Date());

const attendanceFor = session => {
    const attendees = new Set((session.activeStudents || []).map(item => item.username).filter(Boolean));
    (session.activityLog || []).forEach(log => {
        if (log.event?.type === 'login' && log.username) attendees.add(log.username);
    });
    return { attended: attendees.size, expected: (session.allowedStudents || []).length };
};

const durationMinutes = session => {
    if (session.endTime && session.startTime) return Math.max(0, Math.round((new Date(session.endTime) - new Date(session.startTime)) / 60000));
    return Number(session.duration) || 0;
};

async function getInstitutionSnapshot(collegeId, { studentQuery } = {}) {
    const key = cacheKey(collegeId);
    const cached = !studentQuery && overviewCache.get(key);
    if (cached && cached.expiresAt > Date.now()) return cached.value;
    const scope = collegeId ? { collegeId } : {};
    const { start, end } = startOfToday();
    const todaySessions = await LabSession.find({
        ...scope,
        $or: [{ startTime: { $gte: start, $lt: end } }, { isActive: true }]
    }).populate('facultyId', 'username').populate('courseId', 'name code').lean();

    const sessionRecords = todaySessions.map(session => {
        const attendance = attendanceFor(session);
        return {
            id: String(session._id),
            timetableId: session.timetableId ? String(session.timetableId) : null,
            name: session.sessionName,
            subject: session.courseId?.name || session.subject || 'General Lab',
            courseCode: session.courseId?.code || '',
            faculty: session.facultyId?.username || 'Unassigned',
            startTime: session.startTime,
            endTime: session.endTime,
            durationMinutes: durationMinutes(session),
            status: session.isActive ? 'live' : 'completed',
            attendance
        };
    });
    const [totalStudents, totalFaculty, totalCourses, todaysTimetable] = await Promise.all([
        User.countDocuments({ ...scope, role: 'student', isActiveStudent: { $ne: false } }),
        User.countDocuments({ ...scope, role: 'faculty' }),
        Course.countDocuments(scope),
        Timetable.find({ ...scope, dayOfWeek: institutionWeekday() }).populate('facultyId', 'username').lean()
    ]);

    const sessionsByTimetable = new Map(sessionRecords.filter(item => item.timetableId).map(item => [item.timetableId, item]));
    const scheduledRecords = todaysTimetable.map(item => {
        const startedSession = sessionsByTimetable.get(String(item._id));
        if (startedSession) return { ...startedSession, scheduled: true };
        return {
            id: `timetable:${item._id}`,
            timetableId: String(item._id),
            name: `${item.subjectName} (${item.department}-${item.year}-${item.section})`,
            subject: item.subjectName || 'General Lab',
            courseCode: item.subjectCode || '',
            faculty: item.facultyId?.username || 'Unassigned',
            startTime: item.startTime || null,
            endTime: item.endTime || null,
            durationMinutes: null,
            status: 'scheduled',
            attendance: { attended: 0, expected: 0 },
            scheduled: true
        };
    });
    // Retain manually-created sessions too, but do not duplicate timetable
    // sessions that were already represented by their scheduled slot.
    const todayLabs = [...scheduledRecords, ...sessionRecords.filter(item => !item.timetableId)];
    const startedLabs = sessionRecords.length;
    const totalExpected = sessionRecords.reduce((sum, item) => sum + item.attendance.expected, 0);
    const totalAttended = sessionRecords.reduce((sum, item) => sum + item.attendance.attended, 0);

    let student = null;
    if (studentQuery && studentQuery.trim()) {
        const escaped = studentQuery.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        // A management question is normally expressed with a name, roll number,
        // or username.  Resolve all three inside the institution boundary so the
        // model never needs to guess which student the manager meant.
        student = await User.findOne({ ...scope, role: 'student', $or: [
            { rollNumber: { $regex: escaped, $options: 'i' } },
            { username: { $regex: escaped, $options: 'i' } },
            { name: { $regex: escaped, $options: 'i' } }
        ] }).select('username name rollNumber email department year section isActiveStudent createdAt').lean();
        if (student) {
            const identifier = student.rollNumber || student.username;
            const history = await LabSession.find({ ...scope, allowedStudents: identifier }).select('sessionName subject startTime isActive activityLog activeStudents allowedStudents duration endTime').lean();
            let attended = 0;
            history.forEach(session => {
                const stats = attendanceFor(session);
                const wasPresent = (session.activeStudents || []).some(item => item.username === identifier) || (session.activityLog || []).some(log => log.event?.type === 'login' && log.username === identifier);
                if (wasPresent) attended += 1;
            });
            student.labsAssigned = history.length;
            student.labsAttended = attended;
            student.attendancePercentage = history.length ? Math.round((attended / history.length) * 100) : 0;
        }
    }

    const snapshot = {
        generatedAt: new Date().toISOString(),
        summary: {
            totalStudents, totalFaculty, totalCourses,
            scheduledToday: todaysTimetable.length,
            labsToday: todayLabs.length,
            startedLabs,
            completedLabs: todayLabs.filter(item => item.status === 'completed').length,
            liveLabs: todayLabs.filter(item => item.status === 'live').length,
            attendance: { attended: totalAttended, expected: totalExpected, percentage: totalExpected ? Math.round((totalAttended / totalExpected) * 100) : 0 }
        },
        todayLabs,
        student
    };
    if (!studentQuery) overviewCache.set(key, { value: snapshot, expiresAt: Date.now() + OVERVIEW_TTL_MS });
    return snapshot;
}

module.exports = { getInstitutionSnapshot, invalidateInstitutionOverview };
