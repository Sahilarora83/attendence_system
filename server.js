const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 3001;
const BACKUP_DIR = path.join(__dirname, 'Backup');

// Ensure backup directories exist
const folders = ['', 'Present', 'Absent'];
folders.forEach(f => {
    const dir = path.join(BACKUP_DIR, f);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

const server = http.createServer((req, res) => {
    // Enable CORS so the browser dashboard can talk to this server
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
    }

    if (req.method === 'GET' && req.url === '/get-ims-csv') {
        const csvPath = path.join(__dirname, 'IMS PRO SCHOOL.csv');
        const statePath = path.join(BACKUP_DIR, 'attendance_state.json');
        
        let studentsData = '';
        let attendanceState = [];

        if (fs.existsSync(csvPath)) {
            studentsData = fs.readFileSync(csvPath, 'utf8');
        }

        if (fs.existsSync(statePath)) {
            try {
                attendanceState = JSON.parse(fs.readFileSync(statePath, 'utf8'));
            } catch(e) { console.error('Error reading state:', e); }
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ csv: studentsData, attendance: attendanceState }));
        return;
    }

    if (req.method === 'POST' && req.url === '/backup') {
        let body = '';
        req.on('data', chunk => { body += chunk.toString(); });
        req.on('end', () => {
            try {
                const data = JSON.parse(body);
                const { students } = data;
                
                const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
                const csvHeader = "Timestamp,Username,Full Name,Email,Roll Number,Phone,Course,Status";
                
                // Helper to format student data for CSV
                const formatStudent = s => `"${s.timestamp}","${s.username}","${s.fullName}","${s.email}","${s.roll}","${s.phone}","${s.course}","${s.status}"`;

                // 1. Generate Present CSV
                const present = students.filter(s => s.status === 'Present');
                const presentCsv = [csvHeader, ...present.map(formatStudent)].join("\n");
                fs.writeFileSync(path.join(BACKUP_DIR, 'Present', `Present_List.csv`), presentCsv);
                
                // 2. Generate Absent CSV
                const absent = students.filter(s => s.status === 'Absent');
                const absentCsv = [csvHeader, ...absent.map(formatStudent)].join("\n");
                fs.writeFileSync(path.join(BACKUP_DIR, 'Absent', `Absent_List.csv`), absentCsv);

                // 3. Save Persistent State (The secret sauce for recovery)
                const state = students.map(s => ({ roll: s.roll, status: s.status }));
                fs.writeFileSync(path.join(BACKUP_DIR, 'attendance_state.json'), JSON.stringify(state));

                console.log(`[${new Date().toLocaleTimeString()}] Backup & State updated in folder.`);
                
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true }));
            } catch (err) {
                console.error('Backup Error:', err);
                res.writeHead(500);
                res.end();
            }
        });
    } else {
        res.writeHead(404);
        res.end();
    }
});

server.on('error', (e) => {
    if (e.code === 'EADDRINUSE') {
        console.error(`[!] ERROR: Port ${PORT} is already in use.`);
        console.error(`    Please close any other terminal running 'node server.js' and try again.`);
        process.exit(1);
    }
});

server.listen(PORT, () => {
    console.log(`-----------------------------------------`);
    console.log(`IMS Backup Server running on http://localhost:${PORT}`);
    console.log(`Backups will be saved to: ${BACKUP_DIR}`);
    console.log(`Keep this window open while using the dashboard!`);
    console.log(`-----------------------------------------`);
});
