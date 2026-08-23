const LabSession = require('../LabSessionModel');
const User = require('../User');
const DeveloperMetrics = require('../models/DeveloperMetrics');
const Submission = require('../models/Submission');
const Assignment = require('../models/Assignment');
const Course = require('../models/Course');

const tools = [
    {
        type: "function",
        function: {
            name: "get_lab_sessions",
            description: "Get past lab sessions for a specific class. Returns the session ID, date, attendance summary, and subject.",
            parameters: {
                type: "object",
                properties: {
                    subjectName: {
                        type: "string",
                        description: "The name of the subject, e.g., 'CN' or 'Flutter'"
                    }
                },
                required: ["subjectName"]
            }
        }
    },
    {
        type: "function",
        function: {
            name: "generate_csv_report",
            description: "Generates a downloadable CSV file for attendance and detailed metrics for a specific lab session.",
            parameters: {
                type: "object",
                properties: {
                    sessionId: {
                        type: "string",
                        description: "The MongoDB ID of the lab session"
                    }
                },
                required: ["sessionId"]
            }
        }
    },
    {
        type: "function",
        function: {
            name: "get_student_dev_metrics",
            description: "Fetches a student's competitive programming insights from GitHub, LeetCode, CodeChef, and HackerRank.",
            parameters: {
                type: "object",
                properties: {
                    rollNumber: {
                        type: "string",
                        description: "The roll number or username of the student."
                    }
                },
                required: ["rollNumber"]
            }
        }
    },
    {
        type: "function",
        function: {
            name: "get_recent_submissions",
            description: "Fetches student submissions for assignments on a given day. Use this when asked for today's submissions or submissions for a specific course.",
            parameters: {
                type: "object",
                properties: {
                    courseName: {
                        type: "string",
                        description: "The name of the course or subject (e.g. 'Java', 'CN')."
                    },
                    dateString: {
                        type: "string",
                        description: "The date string to look for submissions (e.g. 'today', '2026-08-23'). Defaults to 'today'."
                    }
                }
            }
        }
    },
    {
        type: "function",
        function: {
            name: "execute_read_query",
            description: "Executes a flexible read-only MongoDB query to answer custom/complex faculty requests (e.g. 'average scores', 'students who failed', 'assignments matching criteria').",
            parameters: {
                type: "object",
                properties: {
                    collection: {
                        type: "string",
                        description: "The mongoose model to query. Allowed: User, LabSession, DeveloperMetrics, Submission, Assignment, Course"
                    },
                    query: {
                        type: "object",
                        description: "The MongoDB filter object (e.g. { score: { $gt: 80 } }). Use valid MongoDB query syntax."
                    },
                    sort: {
                        type: "object",
                        description: "Optional sort object (e.g. { createdAt: -1 })"
                    },
                    limit: {
                        type: "number",
                        description: "Max results to return (max 100). Default 50."
                    }
                },
                required: ["collection", "query"]
            }
        }
    }
];

const executeTool = async (name, args, facultyId) => {
    switch (name) {
        case 'get_lab_sessions': {
            try {
                const query = { facultyId, isActive: false };
                if (args.subjectName) query.subject = new RegExp(args.subjectName, 'i');
                const sessions = await LabSession.find(query).sort({ endTime: -1 }).limit(5);
                
                if (sessions.length === 0) return "No past lab sessions found for this subject.";
                
                return sessions.map(s => ({
                    sessionId: s._id,
                    name: s.sessionName,
                    subject: s.subject,
                    date: s.startTime,
                    enrolled: s.allowedStudents?.length || 0,
                    attended: s.activeStudents?.length || 0
                }));
            } catch (e) {
                return `Error: ${e.message}`;
            }
        }

        case 'generate_csv_report': {
            try {
                return {
                    message: "Report is ready. Instead of a CSV, you should provide the direct Print Official PDF link.",
                    action: "Tell the user to click the [🖨️ Print Official PDF] link using the format provided in your system instructions."
                };
            } catch (e) {
                return `Error: ${e.message}`;
            }
        }

        case 'get_student_dev_metrics': {
            try {
                const user = await User.findOne({ 
                    $or: [{ username: args.rollNumber }, { rollNumber: args.rollNumber }]
                });
                if (!user) return `Student ${args.rollNumber} not found.`;

                const metrics = await DeveloperMetrics.findOne({ userId: user._id });
                if (!metrics) return `No developer metrics found for ${user.fullName || args.rollNumber}. They may not have linked their profiles.`;

                return {
                    student: user.fullName || user.username,
                    github: metrics.github ? { repos: metrics.github.publicRepos, stars: metrics.github.stars } : "Not linked",
                    leetcode: metrics.leetcode ? { solved: metrics.leetcode.totalSolved, ranking: metrics.leetcode.ranking } : "Not linked",
                    hackerrank: metrics.hackerrank ? { badges: metrics.hackerrank.badges?.length || 0 } : "Not linked",
                    codechef: metrics.codechef ? { rating: metrics.codechef.rating, stars: metrics.codechef.stars } : "Not linked"
                };
            } catch (e) {
                return `Error: ${e.message}`;
            }
        }

        case 'get_recent_submissions': {
            try {
                let assignmentQuery = {};
                if (args.courseName) {
                    const courses = await Course.find({ name: new RegExp(args.courseName, 'i') });
                    if (courses.length > 0) {
                        assignmentQuery.courseId = { $in: courses.map(c => c._id) };
                    } else {
                        // Fallback to searching Assignment.subjectName directly if course not found
                        assignmentQuery.subjectName = new RegExp(args.courseName, 'i');
                    }
                }
                
                const assignments = await Assignment.find(assignmentQuery).select('_id title subjectName');
                if (assignments.length === 0) return `No assignments found for course: ${args.courseName || 'any'}.`;

                const assignmentIds = assignments.map(a => a._id);
                
                // Date filtering
                let startOfDay = new Date();
                startOfDay.setHours(0, 0, 0, 0);
                let endOfDay = new Date();
                endOfDay.setHours(23, 59, 59, 999);
                
                if (args.dateString && args.dateString.toLowerCase() !== 'today') {
                    startOfDay = new Date(args.dateString);
                    startOfDay.setHours(0, 0, 0, 0);
                    endOfDay = new Date(args.dateString);
                    endOfDay.setHours(23, 59, 59, 999);
                }

                const submissions = await Submission.find({
                    assignmentId: { $in: assignmentIds },
                    submittedAt: { $gte: startOfDay, $lte: endOfDay }
                }).sort({ submittedAt: -1 }).limit(50);

                if (submissions.length === 0) return `No submissions found for the specified date and course.`;

                return submissions.map(sub => {
                    const assignment = assignments.find(a => a._id.toString() === sub.assignmentId.toString());
                    return {
                        student: sub.studentUsername,
                        assignment: assignment ? assignment.title : 'Unknown Assignment',
                        subject: assignment ? assignment.subjectName : 'Unknown Subject',
                        score: sub.score,
                        submittedAt: sub.submittedAt
                    };
                });
            } catch (e) {
                return `Error: ${e.message}`;
            }
        }

        case 'execute_read_query': {
            try {
                const models = { User, LabSession, DeveloperMetrics, Submission, Assignment, Course };
                const Model = models[args.collection];
                if (!Model) return `Error: Collection ${args.collection} not found or not permitted. Allowed models: ${Object.keys(models).join(', ')}`;
                
                let limit = args.limit || 50;
                if (limit > 100) limit = 100;

                let dbQuery = Model.find(args.query);
                if (args.sort) dbQuery = dbQuery.sort(args.sort);
                
                const results = await dbQuery.limit(limit).lean();
                
                if (results.length === 0) return "Query returned 0 results.";
                return results;
            } catch (e) {
                return `Error executing query: ${e.message}`;
            }
        }

        default:
            return `Tool ${name} not found.`;
    }
};

module.exports = {
    tools,
    executeTool
};

