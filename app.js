/**
 * Event Attendance Admin Analytics Dashboard
 * Core Logic & Data Management
 */

// Configuration
const CONFIG = {
    // REPLACE THIS URL after deploying the Google Apps Script provided below
    API_URL: '', 
    REFRESH_INTERVAL: 15000, 
    TABLE_LIMIT: 50,
};

// Global State
// 🚀 Supabase Configuration
const SB_URL = 'https://ctrcyiiryhxzcyngjgsp.supabase.co';
const SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN0cmN5aWlyeWh4emN5bmdqZ3NwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMzNDc5NzYsImV4cCI6MjA4ODkyMzk3Nn0.FQIFrCu0IqfOCT1xFdLpsyv8S7KI5h9by_6XjtHT6-Q';
const supabase = window.supabase ? window.supabase.createClient(SB_URL, SB_KEY) : null;

let students = [];
let filteredStudents = [];
let charts = {};
let isFirstLoad = true;
let serverWasOffline = false;
let currentPage = 1;
const itemsPerPage = 20;

/**
 * Initialization
 */
document.addEventListener('DOMContentLoaded', () => {
    console.log('Dashboard Initializing...');
    try {
        // Initialize Lucide Icons
        lucide.createIcons();
        
        // Initialize Charts with safety
        try {
            initCharts();
        } catch (e) {
            console.error('Chart Initialization Failed:', e);
        }
        
        // Set up Event Listeners
        setupEventListeners();
        
        // Initial Data Load
        loadData();

        // Check Backup Server Status every 5 seconds
        checkServerStatus();
        setInterval(checkServerStatus, 5000);
    } catch (criticalError) {
        console.error('Critical Dashboard Error:', criticalError);
        alert('Dashboard failed to link correctly. Check console (F12) for details.');
    }
});

/**
 * Checks if server.js is running
 */
async function checkServerStatus() {
    const dot = document.getElementById('server-dot');
    const text = document.getElementById('server-status');
    try {
        const res = await fetch('http://localhost:3001/backup', { method: 'OPTIONS' });
        if (res.ok || res.status === 204) {
            dot.className = 'dot online';
            text.textContent = 'Backup Server: Live';
            
            // If it was offline and now it's live, sync the data to folders
            if (serverWasOffline) {
                console.log('Server reconnected. Syncing pending data...');
                triggerLocalBackup();
                serverWasOffline = false;
            }
        } else {
            throw new Error();
        }
    } catch (e) {
        dot.className = 'dot offline';
        text.textContent = 'Backup Server: Down';
        serverWasOffline = true;
    }
}

/**
 * Data Loading Logic
 */
async function loadData() {
    updateSyncStatus('Checking for data...', 'pulse');
    // 1. Try to fetch from Supabase (Primary Cloud Storage)
    if (supabase) {
        try {
            const { data, error } = await supabase.from('students').select('*');
            if (!error && data && data.length > 0) {
                console.log('Data loaded from Cloud (Supabase)');
                students = data;
                localStorage.setItem('ims_students', JSON.stringify(students));
                processAndDisplay();
                updateSyncStatus('Cloud Live', 'online');
                return;
            }
        } catch (e) {
            console.warn('Cloud fetch failed, trying local fallback.');
        }
    }

    // 2. Fallback to LocalStorage (Browser memory)
    const savedData = localStorage.getItem('ims_students');
    if (savedData) {
        students = JSON.parse(savedData);
        processAndDisplay();
        updateSyncStatus('Local Memory', 'warning');
        return;
    }

    // 3. Last Resort: Initial CSV Load (If Server is running)
    try {
        const response = await fetch('http://localhost:3001/get-ims-csv');
        if (response.ok) {
            const result = await response.json();
            const newData = parseCSV(result.csv);
            students = newData;
            localStorage.setItem('ims_students', JSON.stringify(students));
            processAndDisplay();
            updateSyncStatus('Initial Setup', 'online');
            return;
        }
    } catch (e) {
        showNotification('System is offline. Please upload CSV manually or start local server.', 'warning');
    }

    updateSyncStatus('Manual Load Needed', '');
}

async function fetchData() {
    if (!CONFIG.API_URL) return;
    
    updateSyncStatus('Syncing...', 'pulse');
    try {
        const response = await fetch(CONFIG.API_URL);
        const data = await response.json();
        students = data;
        processAndDisplay();
    } catch (error) {
        console.error('Fetch Error:', error);
        updateSyncStatus('Sync Failed', 'text-rose');
    }
}

function processAndDisplay() {
    applyFilters();
    updateCourseDropdown();
    updateStats();
    updateCharts();
    
    const now = new Date();
    document.getElementById('last-updated').textContent = `Last update: ${now.toLocaleTimeString()}`;
    updateSyncStatus(CONFIG.API_URL ? 'Live Sync Active' : 'Offline Mode (CSV)', '');
    
    if (isFirstLoad) {
        isFirstLoad = false;
    }
}

/**
 * CSV Parsing Logic
 */
function parseCSV(text) {
    if (!text) return [];
    
    // Split lines by any newline character (\n or \r\n)
    const lines = text.split(/\r?\n/).filter(line => line.trim() !== '');
    console.log(`CSV raw lines found: ${lines.length}`);
    
    if (lines.length < 2) {
        console.error('CSV File too short or empty.');
        return [];
    }
    
    const parsed = lines.slice(1).map((line, index) => {
        const parts = [];
        let currentPart = '';
        let inQuotes = false;
        
        for (let i = 0; i < line.length; i++) {
            const char = line[i];
            if (char === '"') {
                inQuotes = !inQuotes;
            } else if (char === ',' && !inQuotes) {
                parts.push(currentPart.trim());
                currentPart = '';
            } else {
                currentPart += char;
            }
        }
        parts.push(currentPart.trim());
        
        // Match headers: "Timestamp","Username","Full NAME","EMAIL ID","SOL Roll No.","PHONE NUMBER","COURSE..."
        return {
            timestamp: parts[0] || 'N/A',
            username: parts[1] || 'N/A',
            fullName: parts[2] || 'Unknown',
            email: parts[3] || 'N/A',
            roll: (parts[4] || 'N/A').replace(/"/g, ''), // Cleanup quotes if any
            phone: parts[5] || 'N/A',
            course: (parts[6] || 'General').trim(),
            status: 'Absent'
        };
    });

    console.log('Success! Sample data:', parsed.slice(0, 2));
    return parsed;
}

/**
 * UI State & Stats
 */
function updateSyncStatus(text, className) {
    const statusText = document.getElementById('sync-status');
    const dot = document.querySelector('.status-indicator .dot');
    if (statusText) statusText.textContent = text;
    if (dot) dot.className = `dot ${className}`;
}

function updateStats() {
    const total = students.length;
    const present = students.filter(s => s.status === 'Present').length;
    const absent = total - present;
    const percent = total > 0 ? Math.round((present / total) * 100) : 0;
    
    animateValue('stat-total', 0, total, 1000);
    animateValue('stat-present', 0, present, 1000);
    animateValue('stat-absent', 0, absent, 1000);
    animateValue('stat-percent', 0, percent, 1000, '%');
}

function animateValue(id, start, end, duration, suffix = '') {
    const obj = document.getElementById(id);
    if (!obj) return;
    
    let startTimestamp = null;
    const step = (timestamp) => {
        if (!startTimestamp) startTimestamp = timestamp;
        const progress = Math.min((timestamp - startTimestamp) / duration, 1);
        obj.innerHTML = Math.floor(progress * (end - start) + start) + suffix;
        if (progress < 1) {
            window.requestAnimationFrame(step);
        }
    };
    window.requestAnimationFrame(step);
}

/**
 * Filter Management
 */
function setupEventListeners() {
    document.getElementById('global-search').addEventListener('input', applyFilters);
    document.getElementById('filter-course').addEventListener('change', applyFilters);
    document.getElementById('filter-status').addEventListener('change', applyFilters);
    
    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', (e) => {
            if (item.classList.contains('export-trigger')) return;
            e.preventDefault();
            document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
            item.classList.add('active');
            
            const id = item.id;
            const statusFilter = document.getElementById('filter-status');
            
            if (id === 'nav-overview') {
                statusFilter.value = '';
                document.querySelector('.stats-grid').scrollIntoView({ behavior: 'smooth' });
            } else if (id === 'nav-students') {
                statusFilter.value = '';
                document.querySelector('.table-section').scrollIntoView({ behavior: 'smooth' });
            } else if (id === 'nav-present') {
                statusFilter.value = 'Present';
                document.querySelector('.table-section').scrollIntoView({ behavior: 'smooth' });
            } else if (id === 'nav-absent') {
                statusFilter.value = 'Absent';
                document.querySelector('.table-section').scrollIntoView({ behavior: 'smooth' });
            }
            applyFilters();
        });
    });
    
    // Refresh Button (Safe Check)
    const refreshBtn = document.getElementById('refresh-btn');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', () => {
            CONFIG.API_URL ? fetchData() : showNotification('Cloud sync not configured.', 'warning');
        });
    }

    // Local CSV Upload Handler
    const fileInput = document.getElementById('csv-upload');
    const uploadBtn = document.getElementById('upload-btn');

    uploadBtn.addEventListener('click', () => fileInput.click());

    fileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            const text = event.target.result;
            const parsedData = parseCSV(text);
            if (parsedData.length > 0) {
                students = parsedData;
                // Save to local storage so it persists on this laptop
                localStorage.setItem('ims_students', JSON.stringify(students));
                processAndDisplay();
                showNotification(`Successfully loaded ${students.length} students.`, 'success');
            } else {
                showNotification('Could not read CSV. Check format.', 'error');
            }
        };
        reader.readAsText(file);
    });
    // Modals
    const modal = document.getElementById('export-modal');
    document.getElementById('export-menu-btn').addEventListener('click', () => modal.classList.add('active'));
    document.querySelector('.close-modal').addEventListener('click', () => modal.classList.remove('active'));

    // Cloud Migration Button
    const syncBtn = document.getElementById('sync-to-cloud');
    if (syncBtn) {
        syncBtn.addEventListener('click', migrateLocalToCloud);
    }

    // Mobile Sidebar Toggle Logic
    const mobileToggle = document.getElementById('mobile-toggle');
    const sidebar = document.querySelector('.sidebar');
    const overlay = document.getElementById('sidebar-overlay');

    if (mobileToggle) {
        mobileToggle.addEventListener('click', () => {
            sidebar.classList.add('active');
            overlay.classList.add('active');
        });
    }

    if (overlay) {
        overlay.addEventListener('click', () => {
            sidebar.classList.remove('active');
            overlay.classList.remove('active');
        });
    }

    // Close sidebar when clicking a nav item (on mobile)
    document.querySelectorAll('.nav-item').forEach(link => {
        link.addEventListener('click', () => {
            if (window.innerWidth <= 1024) {
                sidebar.classList.remove('active');
                overlay.classList.remove('active');
            }
        });
    });
}

function updateCourseDropdown() {
    const filterSelect = document.getElementById('filter-course');
    const currentValue = filterSelect.value;
    const uniqueCourses = [...new Set(students.map(s => s.course).filter(Boolean))];
    
    filterSelect.innerHTML = '<option value="">All Courses</option>';
    uniqueCourses.sort().forEach(course => {
        const option = document.createElement('option');
        option.value = course;
        option.textContent = course;
        if (course === currentValue) option.selected = true;
        filterSelect.appendChild(option);
    });
}

function applyFilters() {
    const searchTerm = document.getElementById('global-search').value.toLowerCase();
    const courseFilter = document.getElementById('filter-course').value;
    const statusFilter = document.getElementById('filter-status').value;
    
    filteredStudents = students.filter(student => {
        const matchesSearch = 
            (student.fullName && student.fullName.toLowerCase().includes(searchTerm)) ||
            (student.roll && student.roll.toLowerCase().includes(searchTerm)) ||
            (student.phone && student.phone.includes(searchTerm));
            
        const matchesCourse = !courseFilter || student.course === courseFilter;
        const matchesStatus = !statusFilter || student.status === statusFilter;
        
        return matchesSearch && matchesCourse && matchesStatus;
    });
    
    currentPage = 1; // Reset to first page on new search
    renderTable();
}

/**
 * Table Rendering
 */
function renderTable() {
    const tbody = document.getElementById('student-tbody');
    const searchTerm = document.getElementById('global-search').value.toLowerCase();
    
    if (filteredStudents.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" class="loading-state">No student records found.</td></tr>`;
        renderPagination(0);
        return;
    }
    
    // Sort students by timestamp (newest first)
    const sorted = [...filteredStudents].sort((a,b) => new Date(b.timestamp) - new Date(a.timestamp));
    
    // Pagination Logic
    const start = (currentPage - 1) * itemsPerPage;
    const paginated = sorted.slice(start, start + itemsPerPage);
    
    const fragment = document.createDocumentFragment();
    
    paginated.forEach(student => {
        const tr = document.createElement('tr');
        const isPresent = student.status === 'Present';
        
        // Highlight search matches
        const highlight = (text) => {
            if (!searchTerm) return text;
            const regex = new RegExp(`(${searchTerm})`, 'gi');
            return String(text).replace(regex, '<mark class="highlight">$1</mark>');
        };

        tr.innerHTML = `
            <td>
                <div style="font-weight: 600;">${highlight(student.fullName)}</div>
                <div style="font-size: 0.75rem; color: #64748b;">${student.username}</div>
            </td>
            <td><code>${highlight(student.roll)}</code></td>
            <td><span class="badge" style="background: #f1f5f9; padding: 4px 8px; border-radius: 4px; font-size: 0.7rem;">${student.course}</span></td>
            <td>${highlight(student.phone)}</td>
            <td style="font-size: 0.8rem; color: #64748b;">${student.email}</td>
            <td>
                <span class="status-badge ${isPresent ? 'status-present' : 'status-absent'}">
                    ${student.status}
                </span>
            </td>
            <td>
                <button class="btn-action ${isPresent ? 'btn-danger' : ''}" onclick="toggleStatus('${student.roll}')">
                    ${isPresent ? 'Undo' : 'Mark Present'}
                </button>
            </td>
        `;
        fragment.appendChild(tr);
    });

    tbody.innerHTML = '';
    tbody.appendChild(fragment);
    renderPagination(sorted.length);
}

function renderPagination(totalItems) {
    const totalPages = Math.ceil(totalItems / itemsPerPage);
    let nav = document.getElementById('table-pagination');
    
    if (!nav) {
        nav = document.createElement('div');
        nav.id = 'table-pagination';
        nav.className = 'pagination-container';
        document.querySelector('.table-section').appendChild(nav);
    }
    
    if (totalPages <= 1) {
        nav.style.display = 'none';
        return;
    }
    
    nav.style.display = 'flex';
    nav.innerHTML = `
        <button class="btn btn-outline" ${currentPage === 1 ? 'disabled' : ''} onclick="changePage(-1)">
            <i data-lucide="chevron-left"></i> Previous
        </button>
        <span class="page-info">Page <strong>${currentPage}</strong> of ${totalPages}</span>
        <button class="btn btn-outline" ${currentPage === totalPages ? 'disabled' : ''} onclick="changePage(1)">
            Next <i data-lucide="chevron-right"></i>
        </button>
    `;
    lucide.createIcons();
}

function changePage(dir) {
    currentPage += dir;
    renderTable();
    document.querySelector('.table-section').scrollIntoView({ behavior: 'smooth' });
}

/**
 * Attendance Action
 */
async function toggleStatus(roll) {
    const student = students.find(s => s.roll === roll);
    if (!student) return;

    student.status = (student.status === 'Present') ? 'Absent' : 'Present';
    
    // 1. Update Cloud (Supabase) - Instant sync
    if (supabase) {
        try {
            const { error } = await supabase
                .from('students')
                .upsert(student);
            
            if (error) throw error;
            console.log('Cloud update successful');
        } catch (e) {
            console.error('Cloud update failed:', e);
            showNotification('Sync delayed (Cloud error). Saved locally.', 'warning');
        }
    }
    
    // 2. Local fallback
    localStorage.setItem('ims_students', JSON.stringify(students));
    
    renderTable();
    updateStats();
    updateCharts();
    showNotification(`${student.fullName} is now ${student.status}.`, 'success');
}

/**
 * Migration Function: Syncs current Local Data to Cloud
 */
async function migrateLocalToCloud() {
    if (!supabase) return showNotification('Supabase not initialized!', 'error');
    
    const btn = document.getElementById('sync-to-cloud');
    const originalText = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<i class="spin-icon" data-lucide="loader"></i> Syncing...';
    lucide.createIcons();

    try {
        // Upload students in chunks of 50 to avoid timeouts
        const chunkSize = 50;
        for (let i = 0; i < students.length; i += chunkSize) {
            const chunk = students.slice(i, i + chunkSize);
            const { error } = await supabase.from('students').upsert(chunk);
            if (error) throw error;
        }
        
        showNotification('Migration Complete! Dashboard is now 100% Cloud-based.', 'success');
        updateSyncStatus('Cloud Live', 'online');
    } catch (e) {
        console.error(e);
        showNotification('Migration failed: ' + e.message, 'error');
    } finally {
        btn.disabled = false;
        btn.innerHTML = originalText;
        lucide.createIcons();
    }
}

/**
 * Sends data to local server.js to save files in folders
 */
async function triggerLocalBackup() {
    const text = document.getElementById('server-status');
    try {
        const response = await fetch('http://localhost:3001/backup', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ students: students })
        });
        if (response.ok) {
            console.log('Local backup successful');
            if (text.textContent.includes('Pending')) {
                text.textContent = 'Backup Server: Live';
            }
        }
    } catch (e) {
        console.warn('Backup server is down. Saving to browser memory only.');
        text.textContent = 'Backup Server: Sync Pending...';
    }
}

/**
 * Charting logic
 */
function initCharts() {
    const chartConfig = { 
        responsive: true, 
        maintainAspectRatio: false, 
        plugins: { 
            legend: { display: false } // Hide legend for bar chart to save space
        } 
    };
    
    charts.course = new Chart(document.getElementById('courseChart'), {
        type: 'bar',
        data: { labels: [], datasets: [{ label: 'Students', data: [], backgroundColor: [] }] },
        options: { 
            ...chartConfig, 
            indexAxis: 'y', // Make it horizontal for long course names
            scales: { 
                x: { beginAtZero: true, ticks: { stepSize: 1 } },
                y: { ticks: { font: { size: 10 } } }
            }
        }
    });

    charts.attendance = new Chart(document.getElementById('attendanceChart'), {
        type: 'pie',
        data: { labels: ['Present', 'Absent'], datasets: [{ data: [0, 0], backgroundColor: ['#10b981', '#ef4444'] }] },
        options: chartConfig
    });

    charts.timeline = new Chart(document.getElementById('timelineChart'), {
        type: 'line',
        data: { labels: [], datasets: [{ label: 'Registrations', data: [], borderColor: '#6366f1', fill: true, backgroundColor: 'rgba(99, 102, 241, 0.1)', tension: 0.4 }] },
        options: chartConfig
    });
}

function updateCharts() {
    // 1. Course Distribution
    const courseCounts = {};
    students.forEach(s => { 
        const c = (s.course || 'Unknown').trim();
        courseCounts[c] = (courseCounts[c] || 0) + 1; 
    });
    
    // Sort by count for better visualization
    const sortedCourses = Object.entries(courseCounts).sort((a,b) => b[1] - a[1]);
    const labels = sortedCourses.map(e => e[0]);
    const counts = sortedCourses.map(e => e[1]);
    
    charts.course.data.labels = labels;
    charts.course.data.datasets[0].data = counts;
    // Generate colors based on the number of bars
    charts.course.data.datasets[0].backgroundColor = labels.map((_, i) => `hsl(${220 + (i * 30)}, 70%, 60%)`);
    charts.course.update();
    
    // 2. Attendance
    const present = students.filter(s => s.status === 'Present').length;
    charts.attendance.data.datasets[0].data = [present, students.length - present];
    charts.attendance.update();
    
    // 3. Timeline
    const timelineData = {};
    students.forEach(s => {
        const date = s.timestamp ? s.timestamp.split(' ')[0] : 'Unknown';
        timelineData[date] = (timelineData[date] || 0) + 1;
    });
    const sortedDates = Object.keys(timelineData).sort();
    charts.timeline.data.labels = sortedDates;
    charts.timeline.data.datasets[0].data = sortedDates.map(d => timelineData[d]);
    charts.timeline.update();
}

/**
 * Export
 */
function startExport(format) {
    const scope = document.getElementById('export-scope').value;
    exportData(format, scope);
}

function exportData(format, scope = 'all') {
    let source = students;
    if (scope === 'present') source = students.filter(s => s.status === 'Present');
    if (scope === 'absent') source = students.filter(s => s.status === 'Absent');
    if (scope === 'filtered') source = filteredStudents;

    if (source.length === 0) {
        showNotification('No data found for this scope!', 'error');
        return;
    }

    const dataToExport = source.map(s => ({
        'Timestamp': s.timestamp,
        'Username': s.username,
        'Full Name': s.fullName,
        'Email ID': s.email,
        'Roll Number': s.roll,
        'Phone Number': s.phone,
        'Course': s.course,
        'Attendance Status': s.status
    }));

    if (format === 'xlsx' || format === 'csv') {
        const worksheet = XLSX.utils.json_to_sheet(dataToExport);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "EventData");
        XLSX.writeFile(workbook, `Event_Export_${new Date().toLocaleDateString()}.${format === 'csv' ? 'csv' : 'xlsx'}`);
    } else if (format === 'pdf') {
        window.jsPDF = window.jspdf.jsPDF;
        const doc = new jsPDF();
        doc.setFontSize(22); doc.text("Event Attendance Report", 14, 20);
        doc.setFontSize(10); doc.text(`Generated: ${new Date().toLocaleString()}`, 14, 28);
        doc.autoTable({
            startY: 40,
            head: [['Timestamp', 'Full Name', 'Roll Number', 'Phone', 'Course', 'Status']],
            body: source.map(s => [s.timestamp, s.fullName, s.roll, s.phone, s.course, s.status]),
            theme: 'striped',
            headStyles: { fillColor: [99, 102, 241], fontSize: 8 },
            styles: { fontSize: 7 }
        });
        doc.save(`Event_Report_${scope}_${new Date().toLocaleDateString()}.pdf`);
    }
}

function showNotification(message, type) {
    const container = document.getElementById('notification-container');
    const note = document.createElement('div');
    note.className = 'notification';
    const icon = type === 'success' ? 'check-circle' : 'alert-circle';
    const color = type === 'success' ? '#10b981' : '#ef4444';
    note.innerHTML = `<i data-lucide="${icon}" style="color: ${color}"></i><span>${message}</span>`;
    container.appendChild(note);
    lucide.createIcons();
    setTimeout(() => { note.style.opacity = '0'; setTimeout(() => note.remove(), 300); }, 4000);
}
