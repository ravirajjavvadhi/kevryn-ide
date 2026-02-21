const { spawn } = require('child_process');
const path = require('path');
const net = require('net');
const fs = require('fs');

class DeployManager {
    constructor() {
        this.deployments = new Map(); // projectId -> { process, port, status, logs, startTime, pid, cwd, command }
        this.basePort = 4000;
        this.savePath = path.join(__dirname, 'deployments.json');

        // Ensure deploy directory exists
        if (!fs.existsSync(path.dirname(this.savePath))) {
            fs.mkdirSync(path.dirname(this.savePath), { recursive: true });
        }
    }

    // Load state from disk on startup
    loadState() {
        if (fs.existsSync(this.savePath)) {
            try {
                const data = JSON.parse(fs.readFileSync(this.savePath, 'utf8'));
                console.log("[DeployManager] Loading saved state:", data);

                for (const [projectId, dep] of Object.entries(data)) {
                    // Check if process is still alive
                    try {
                        process.kill(dep.pid, 0); // Throws if PID doesn't exist

                        // It's alive! Re-hydrate state
                        this.deployments.set(projectId, {
                            ...dep,
                            status: 'running',
                            process: null, // We can't re-attach the object, but we know the PID
                            logs: [] // Logs are lost on restart for now
                        });
                        console.log(`[DeployManager] Recovered active deployment ${projectId} (PID: ${dep.pid})`);
                    } catch (e) {
                        console.log(`[DeployManager] Deployment ${projectId} (PID: ${dep.pid}) is no longer running.`);
                        // Don't add to map, effectively "stopping" it in our view
                    }
                }
            } catch (e) {
                console.error("[DeployManager] Failed to load state:", e);
            }
        }
    }

    saveState() {
        const data = {};
        for (const [id, dep] of this.deployments) {
            data[id] = {
                projectId: id,
                port: dep.port,
                pid: dep.pid,
                cwd: dep.cwd,
                command: dep.command,
                startTime: dep.startTime
            };
        }
        try {
            fs.writeFileSync(this.savePath, JSON.stringify(data, null, 2));
        } catch (e) {
            console.error("[DeployManager] Failed to save state:", e);
        }
    }

    async findAvailablePort(startPort) {
        return new Promise((resolve, reject) => {
            const server = net.createServer();
            server.listen(startPort, () => {
                const { port } = server.address();
                server.close(() => resolve(port));
            });
            server.on('error', (err) => {
                if (err.code === 'EADDRINUSE') {
                    resolve(this.findAvailablePort(startPort + 1));
                } else {
                    reject(err);
                }
            });
        });
    }

    async startDeployment(projectId, projectPath, commandStr) {
        if (this.deployments.has(projectId)) {
            await this.stopDeployment(projectId);
        }

        const port = await this.findAvailablePort(this.basePort);
        const [cmd, ...args] = commandStr.split(' ');

        const env = { ...process.env, PORT: port.toString() };

        console.log(`[DeployManager] Starting ${projectId} on port ${port} (Detached)`);

        // Spawn detached process
        const child = spawn(cmd, args, {
            cwd: projectPath,
            env: env,
            shell: true,
            detached: true,
            stdio: 'ignore' // Ignore stdio to allow complete detachment
        });

        child.unref(); // Allow parent to exit independently

        const deployment = {
            process: child, // Only available in this session
            pid: child.pid,
            port: port,
            cwd: projectPath,
            command: commandStr,
            status: 'running', // Assume running since detached
            logs: [],
            startTime: new Date()
        };

        this.deployments.set(projectId, deployment);
        this.saveState();

        return { projectId, port, status: 'starting' };
    }

    async stopDeployment(projectId) {
        const deployment = this.deployments.get(projectId);
        if (deployment) {
            if (deployment.pid) {
                if (process.platform === 'win32') {
                    try {
                        const { exec } = require('child_process');
                        console.log(`[DeployManager] Killing PID ${deployment.pid}`);
                        exec(`taskkill /pid ${deployment.pid} /T /F`);
                    } catch (e) { console.error("Kill failed", e); }
                } else {
                    try { process.kill(-deployment.pid); } catch (e) { try { process.kill(deployment.pid); } catch (e2) { } }
                }
            }

            this.deployments.delete(projectId);
            this.saveState();
            return true;
        }
        return false;
    }

    getDeployment(projectId) {
        return this.deployments.get(projectId);
    }
}

module.exports = new DeployManager();
