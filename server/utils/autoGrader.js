const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const os = require('os');

const runTestCase = (cmd, args, input, expectedOutput, timeout = 2000) => {
    return new Promise((resolve) => {
        const proc = spawn(cmd, args);
        let stdout = '';
        let stderr = '';
        let killed = false;

        const timer = setTimeout(() => {
            proc.kill();
            killed = true;
            resolve({ pass: false, output: 'Timeout', error: 'Execution timed out' });
        }, timeout);

        if (input) {
            proc.stdin.write(input);
            proc.stdin.end();
        }

        proc.stdout.on('data', (data) => { stdout += data.toString(); });
        proc.stderr.on('data', (data) => { stderr += data.toString(); });

        proc.on('close', (code) => {
            clearTimeout(timer);
            if (killed) return;

            const actual = stdout.trim();
            const expected = expectedOutput.trim();
            const pass = actual === expected;

            resolve({
                pass,
                input,
                expected: expected,
                actual: actual,
                error: stderr,
                executionTime: 'N/A' // Could add timing
            });
        });

        proc.on('error', (err) => {
            clearTimeout(timer);
            resolve({ pass: false, output: '', error: err.message });
        });
    });
};

const runAutoGrader = async (code, language, testCases) => {
    const tmpDir = os.tmpdir();
    const fileName = `submission_${Date.now()}.${language === 'python' ? 'py' : 'js'}`;
    const filePath = path.join(tmpDir, fileName);

    fs.writeFileSync(filePath, code);

    const results = [];
    let cmd = '';
    let args = [];

    if (language === 'python') {
        cmd = 'python';
        args = [filePath];
    } else if (language === 'javascript' || language === 'node') {
        cmd = 'node';
        args = [filePath];
    } else {
        return { error: "Unsupported language" };
    }

    try {
        for (const tc of testCases) {
            const result = await runTestCase(cmd, args, tc.input, tc.expectedOutput);
            results.push({
                ...result,
                isHidden: tc.isHidden,
                points: tc.points
            });
        }
    } catch (e) {
        console.error("AutoGrader Error:", e);
    } finally {
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    }

    return results;
};

module.exports = { runAutoGrader };
