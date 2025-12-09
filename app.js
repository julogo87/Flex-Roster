/**
 * FLEX CREW - Crew Scheduling System
 * Sistema de programación de tripulaciones
 */

// ============================================
// AUTHENTICATION & USERS
// ============================================
const Auth = {
    USERS_KEY: 'flexcrew-users',
    
    // Default users (loaded on first run)
    defaultUsers: {
        'admin': { password: 'admin123', name: 'Administrador', role: 'admin' },
        'julian': { password: 'julian123', name: 'Julián García', role: 'scheduler' },
        'maria': { password: 'maria123', name: 'María López', role: 'scheduler' },
        'carlos': { password: 'carlos123', name: 'Carlos Ruiz', role: 'viewer' }
    },
    currentUser: null,
    
    getUsers() {
        try {
            const saved = localStorage.getItem(this.USERS_KEY);
            if (saved) return JSON.parse(saved);
            // First run - save default users
            localStorage.setItem(this.USERS_KEY, JSON.stringify(this.defaultUsers));
            return this.defaultUsers;
        } catch (e) {
            return this.defaultUsers;
        }
    },
    
    saveUsers(users) {
        localStorage.setItem(this.USERS_KEY, JSON.stringify(users));
    },
    
    init() {
        const saved = localStorage.getItem('flexcrew-session');
        if (saved) {
            const session = JSON.parse(saved);
            const users = this.getUsers();
            if (session.user && users[session.user]) {
                this.currentUser = { username: session.user, ...users[session.user] };
                return true;
            }
        }
        return false;
    },
    
    login(username, password) {
        const users = this.getUsers();
        const user = users[username];
        if (user && user.password === password) {
            this.currentUser = { username, ...user };
            localStorage.setItem('flexcrew-session', JSON.stringify({ user: username, time: Date.now() }));
            Logger.log('login', `Inicio de sesión: ${user.name}`, `Usuario: ${username}, Rol: ${user.role}`);
            return true;
        }
        return false;
    },
    
    logout() {
        const name = this.currentUser?.name || 'Usuario';
        Logger.log('login', `Cierre de sesión: ${name}`);
        this.currentUser = null;
        localStorage.removeItem('flexcrew-session');
    },
    
    getUser() {
        return this.currentUser;
    },
    
    isAdmin() {
        return this.currentUser?.role === 'admin';
    },
    
    createUser(username, password, name, role) {
        const users = this.getUsers();
        if (users[username]) return { success: false, error: 'Usuario ya existe' };
        users[username] = { password, name, role };
        this.saveUsers(users);
        Logger.log('edit', `Usuario creado: ${name}`, `Username: ${username}, Rol: ${role}`);
        return { success: true };
    },
    
    updateUser(username, data) {
        const users = this.getUsers();
        if (!users[username]) return { success: false, error: 'Usuario no existe' };
        users[username] = { ...users[username], ...data };
        this.saveUsers(users);
        Logger.log('edit', `Usuario actualizado: ${users[username].name}`, `Username: ${username}`);
        return { success: true };
    },
    
    deleteUser(username) {
        if (username === 'admin') return { success: false, error: 'No se puede eliminar admin' };
        const users = this.getUsers();
        if (!users[username]) return { success: false, error: 'Usuario no existe' };
        const name = users[username].name;
        delete users[username];
        this.saveUsers(users);
        Logger.log('delete', `Usuario eliminado: ${name}`, `Username: ${username}`);
        return { success: true };
    },
    
    getAllUsers() {
        return this.getUsers();
    }
};

// ============================================
// ACTIVITY LOGGER
// ============================================
const Logger = {
    STORAGE_KEY: 'flexcrew-logs',
    MAX_LOGS: 1000,
    
    log(type, action, details = '') {
        const logs = this.getLogs();
        const entry = {
            id: Date.now() + '-' + Math.random().toString(36).substr(2, 9),
            timestamp: new Date().toISOString(),
            type,
            action,
            details,
            user: Auth.currentUser?.username || 'system'
        };
        
        logs.unshift(entry);
        
        if (logs.length > this.MAX_LOGS) {
            logs.splice(this.MAX_LOGS);
        }
        
        localStorage.setItem(this.STORAGE_KEY, JSON.stringify(logs));
    },
    
    getLogs() {
        try {
            return JSON.parse(localStorage.getItem(this.STORAGE_KEY)) || [];
        } catch (e) {
            return [];
        }
    },
    
    clear() {
        // Only admin can clear logs
        if (!Auth.isAdmin()) {
            return false;
        }
        Logger.log('delete', 'Historial de logs limpiado por administrador');
        localStorage.setItem(this.STORAGE_KEY, '[]');
        return true;
    },
    
    getByType(type) {
        return this.getLogs().filter(l => l.type === type);
    },
    
    export() {
        const logs = this.getLogs();
        const csv = [
            'Timestamp,Type,Action,Details,User',
            ...logs.map(l => `"${l.timestamp}","${l.type}","${l.action}","${l.details}","${l.user}"`)
        ].join('\n');
        
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `FlexCrew_Logs_${new Date().toISOString().split('T')[0]}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    }
};

// ============================================
// CONFIGURATION
// ============================================
const CONFIG = {
    // Valid bases are managed via AppState.validBases (dynamic)
    get VALID_BASES() { return AppState.validBases; },
    DOMESTIC_ROUTES: new Set(['MDEBOG', 'BOGMDE', 'BOGCLO', 'CLOBOG', 'BOGBAQ', 'BAQBOG']),
    ALLOWED_DH_ROUTES: new Set([
        'MDE-BOG', 'BOG-MDE', 'MDE-MIA', 'MIA-MDE', 'BOG-SCL', 'SCL-BOG', 
        'BOG-VCP', 'VCP-BOG', 'BOG-EZE', 'EZE-BOG', 'BOG-JFK', 'JFK-BOG',
        'MDE-SCL', 'SCL-MDE', 'MDE-JFK', 'JFK-MDE', 'MDE-VCP', 'VCP-MDE', 
        'MDE-EZE', 'EZE-MDE', 'MIA-BOG', 'BOG-MIA'
    ]),
    // Service time addition: +1h domestic, +1.5h international
    ST_ADD_DOMESTIC: 1.0,
    ST_ADD_INTERNATIONAL: 1.5,
    // Day window for ST limits (04:30 - 16:30)
    DAY_WINDOW: { start: 4.5, end: 16.5 },
    LIMITS: {
        CREW_2: { FT: 9.0, ST_DAY: 12.5, ST_NIGHT: 11.5 },
        CREW_3: { FT: 14.0, ST_DAY: 17.0, ST_NIGHT: 16.0 },
        CREW_4: { FT: 17.0, ST_DAY: 20.0, ST_NIGHT: 19.0 }
    },
    PILOT_LIMITS: {
        MAX_MONTHLY_HOURS: 90,
        MAX_FORTNIGHT_HOURS: 50,
        MAX_CONTINUOUS_DAYS: 6,
        MAX_AWAY_DAYS: 6
    },
    NEXT_DAY_START_HOUR: 1.5, // 1:30 AM
    MAX_DH_DAYS_BEFORE: 3,
    ZOOM: { min: 0.3, max: 3.0, step: 0.2, default: 1.0 },
    STORAGE_KEY: 'flex_crew_scheduler_v4'
};

// ============================================
// APPLICATION STATE
// ============================================
const AppState = {
    itinerary: [],
    pilots: [],
    pilotDBsByMonth: {}, // { "2026-01": pilots[], "2025-12": pilots[] }
    rotations: [],
    slots: [],
    assignments: new Map(),
    
    // Multi-month management
    loadedMonths: new Map(), // { "2026-01": { flights: [], pilots: [], rotations: [], slots: [], assignments: Map } }
    activeMonth: null, // "2026-01" format
    
    // Selection state for rotations
    selectedRotations: new Set(), // Set of rotation IDs
    
    // Valid bases configuration - preestablished
    validBases: new Set(['MDE', 'BOG', 'MIA', 'VCP', 'SCL', 'EZE']),
    
    // Holidays configuration
    holidays: new Map(), // { "2026-01-01": "Año Nuevo", "2026-12-25": "Navidad" }
    
    currentView: 'upload',
    currentPeriod: { year: 2026, month: 1 },
    itineraryPeriod: null, // Detected from itinerary
    pilotsPeriod: null, // Detected from pilots DB
    viewRange: 'month',
    zoomLevel: 1.0,
    
    // Time zone settings
    showUTC: false, // false = UTC-5, true = UTC
    
    filters: {
        base: '', role: '', assignment: '',
        calendarRole: '', calendarBase: '',
        unassignedRole: '', unassignedSort: 'date',
        ganttRole: '', ganttBase: '',
        tailFilter: ''
    },
    
    draggedSlot: null,
    draggedEvent: null,
    selectedPilot: null,
    selectedEvent: null
};

// ============================================
// UTILITIES
// ============================================
const Utils = {
    parseExcelDate(value) {
        if (!value) return null;
        if (value instanceof Date) return new Date(value);
        if (typeof value === 'number') return new Date((value - 25569) * 86400 * 1000);
        if (typeof value === 'string') {
            const date = new Date(value);
            return isNaN(date) ? null : date;
        }
        return null;
    },
    
    parseExcelTime(value) {
        if (!value) return null;
        if (value instanceof Date) return { hours: value.getHours(), minutes: value.getMinutes() };
        if (typeof value === 'number') {
            const totalMinutes = Math.round(value * 24 * 60);
            return { hours: Math.floor(totalMinutes / 60) % 24, minutes: totalMinutes % 60 };
        }
        if (typeof value === 'string') {
            const match = value.match(/(\d{1,2}):(\d{2})/);
            if (match) return { hours: parseInt(match[1]), minutes: parseInt(match[2]) };
        }
        return null;
    },
    
    combineDateTime(date, time) {
        if (!date || !time) return null;
        const d = new Date(date);
        d.setHours(time.hours, time.minutes, 0, 0);
        return d;
    },
    
    formatDate(date, format = 'short', useUTC = null) {
        if (!date) return '';
        let d = new Date(date);
        
        // Apply UTC offset based on toggle (default: use AppState.showUTC)
        const showUTC = useUTC !== null ? useUTC : AppState.showUTC;
        if (!showUTC) {
            // Convert to UTC-5 (Colombia time)
            d = new Date(d.getTime() - 5 * 60 * 60 * 1000);
        }
        
        if (format === 'short') return d.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', timeZone: 'UTC' });
        if (format === 'time') return d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' });
        if (format === 'full') return `${d.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', timeZone: 'UTC' })} ${d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' })}`;
        if (format === 'iso') return d.toISOString().split('T')[0];
        return d.toLocaleDateString('es-ES', { timeZone: 'UTC' });
    },
    
    // Format hours in decimal (for professional reports)
    formatHoursDecimal(hours) {
        if (hours == null) return '0.00';
        return hours.toFixed(2);
    },
    
    formatHours(hours) {
        if (hours == null) return '-';
        // Return in decimal format
        return hours.toFixed(2) + 'h';
    },
    
    getMonthName(month) {
        return ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'][month - 1];
    },
    
    getDaysInMonth(year, month) {
        return new Date(year, month, 0).getDate();
    },
    
    hoursBetween(start, end) {
        return (new Date(end) - new Date(start)) / (1000 * 60 * 60);
    },
    
    isSameDay(date1, date2) {
        const d1 = new Date(date1), d2 = new Date(date2);
        return d1.getFullYear() === d2.getFullYear() && d1.getMonth() === d2.getMonth() && d1.getDate() === d2.getDate();
    },
    
    getDateRange(start, end) {
        const dates = [];
        const current = new Date(start);
        const endDate = new Date(end);
        current.setHours(0, 0, 0, 0);
        endDate.setHours(0, 0, 0, 0);
        while (current <= endDate) {
            dates.push(new Date(current));
            current.setDate(current.getDate() + 1);
        }
        return dates;
    },
    
    isNightRotation(startTime, endTime) {
        const start = new Date(startTime);
        const end = new Date(endTime);
        return start.getDate() !== end.getDate() || start.getMonth() !== end.getMonth() || start.getFullYear() !== end.getFullYear();
    },
    
    generateId: (prefix = '') => prefix + Math.random().toString(36).substr(2, 9),
    
    getInitials(name) {
        if (!name) return '??';
        return name.split(' ').filter(n => n.length > 0).map(n => n[0]).join('').toUpperCase().substr(0, 2);
    },
    
    debounce(func, wait) {
        let timeout;
        return function(...args) {
            clearTimeout(timeout);
            timeout = setTimeout(() => func(...args), wait);
        };
    },
    
    // Parse date string correctly (YYYY-MM-DD)
    parseLocalDate(dateStr) {
        if (!dateStr) return null;
        const [year, month, day] = dateStr.split('-').map(Number);
        return new Date(year, month - 1, day);
    },
    
    // Convert UTC time to UTC-5 (Colombia time)
    utcToLocal(date) {
        if (!date) return null;
        const d = new Date(date);
        d.setHours(d.getHours() - 5);
        return d;
    },
    
    // Convert UTC-5 to UTC
    localToUtc(date) {
        if (!date) return null;
        const d = new Date(date);
        d.setHours(d.getHours() + 5);
        return d;
    },
    
    // Format time with timezone option
    formatTimeWithTZ(date, showUTC = false) {
        if (!date) return '--:--';
        const d = showUTC ? new Date(date) : this.utcToLocal(date);
        return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
    }
};

// ============================================
// DATA LOADERS
// ============================================
const DataLoader = {
    async loadItinerary(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const data = new Uint8Array(e.target.result);
                    const workbook = XLSX.read(data, { type: 'array', cellDates: true });
                    const sheet = workbook.Sheets[workbook.SheetNames[0]];
                    const json = XLSX.utils.sheet_to_json(sheet, { raw: false, dateNF: 'yyyy-mm-dd' });
                    
                    const flights = json.filter(row => row['Day'] && row['Dept Sta'] && row['Arvl Sta'])
                        .map((row, index) => ({
                            id: `FLT-${index + 1}`,
                            day: Utils.parseExcelDate(row['Day']),
                            deptTime: Utils.parseExcelTime(row['Dept Time']),
                            deptSta: (row['Dept Sta'] || '').toString().trim().toUpperCase(),
                            arvlSta: (row['Arvl Sta'] || '').toString().trim().toUpperCase(),
                            arvlTime: Utils.parseExcelTime(row['Arvl Time']),
                            flightNumber: (row['Flt Desg'] || '').toString().trim(),
                            tail: (row['Tail'] || '').toString().trim()
                        }))
                        .filter(f => f.day && f.deptTime && f.deptSta && f.arvlSta);
                    
                    AppState.itinerary = flights;
                    
                    // Detect period from flights
                    let detectedPeriod = null;
                    if (flights.length > 0) {
                        const firstDate = flights[0].day;
                        detectedPeriod = `${firstDate.getFullYear()}-${String(firstDate.getMonth() + 1).padStart(2, '0')}`;
                        AppState.itineraryPeriod = detectedPeriod;
                    }
                    
                    resolve({ flights, period: detectedPeriod });
                } catch (error) { reject(error); }
            };
            reader.onerror = reject;
            reader.readAsArrayBuffer(file);
        });
    },
    
    async loadPilots(file, forMonth = null) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const data = new Uint8Array(e.target.result);
                    const workbook = XLSX.read(data, { type: 'array', cellDates: true });
                    const sheet = workbook.Sheets[workbook.SheetNames[0]];
                    const json = XLSX.utils.sheet_to_json(sheet);
                    
                    const pilots = json.map(row => ({
                        id: String(row['Pilot_ID'] || ''),
                        nick: row['Pilot_Nick_Name'] || '',
                        name: row['Pilot_Name'] || '',
                        base: (row['Base'] || '').toString().trim().toUpperCase(),
                        role: (row['Role'] || '').toString().trim().toUpperCase(),
                        qualifiedTails: (row['Qualified_Tails'] || '').toString().split(',').map(t => t.trim()).filter(t => t),
                        qualifiedTailsCRF: (row['Qualified_Tails_CRF'] || '').toString().split(',').map(t => t.trim()).filter(t => t),
                        freeDays: DataLoader.parseDateList(row['Free_Days']),
                        absences: DataLoader.parseDateList(row['Absences']),
                        training: DataLoader.parseDateList(row['Training']),
                        seniority: parseInt(row['Seniority']) || 9999
                    })).filter(p => p.id && p.name);
                    
                    pilots.forEach(pilot => {
                        pilot.currentLocation = pilot.base;
                        pilot.nextAvailableTime = null;
                        pilot.awayStartDate = null;
                        pilot.ftByMonth = {};
                        pilot.ftByFortnight = {};
                    });
                    
                    // Detect month from free days/absences/training dates
                    let detectedMonth = forMonth;
                    if (!detectedMonth) {
                        for (const pilot of pilots) {
                            const allDates = [...pilot.freeDays, ...pilot.absences, ...pilot.training];
                            if (allDates.length > 0) {
                                const firstDate = allDates[0];
                                const [year, month] = firstDate.split('-').map(Number);
                                detectedMonth = `${year}-${String(month).padStart(2, '0')}`;
                                break;
                            }
                        }
                    }
                    
                    // Default to current period if no dates found
                    if (!detectedMonth) {
                        detectedMonth = `${AppState.currentPeriod.year}-${String(AppState.currentPeriod.month).padStart(2, '0')}`;
                    }
                    
                    // Save to pilotDBsByMonth
                    AppState.pilotDBsByMonth[detectedMonth] = JSON.parse(JSON.stringify(pilots));
                    
                    // Set as current pilots
                    AppState.pilots = pilots;
                    
                    // Create pre-loaded events from Free_days, Absences, Training
                    DataLoader.createPreloadedEvents(pilots);
                    
                    resolve({ pilots, month: detectedMonth });
                } catch (error) { reject(error); }
            };
            reader.onerror = reject;
            reader.readAsArrayBuffer(file);
        });
    },
    
    createPreloadedEvents(pilots) {
        pilots.forEach(pilot => {
            const assignments = AppState.assignments.get(pilot.id) || [];
            
            // Add FREE days
            if (pilot.freeDays && pilot.freeDays.size > 0) {
                pilot.freeDays.forEach(dateStr => {
                    const [year, month, day] = dateStr.split('-').map(Number);
                    const startDate = new Date(year, month - 1, day, 0, 0, 0, 0);
                    const endDate = new Date(year, month - 1, day, 23, 59, 59, 999);
                    
                    assignments.push({
                        type: 'FREE',
                        id: Utils.generateId('FREE-'),
                        startTime: startDate,
                        endTime: endDate,
                        preloaded: true, // Mark as preloaded (from DB)
                        notes: 'Día libre pre-cargado'
                    });
                });
            }
            
            // Add OFF (Absences)
            if (pilot.absences && pilot.absences.size > 0) {
                pilot.absences.forEach(dateStr => {
                    const [year, month, day] = dateStr.split('-').map(Number);
                    const startDate = new Date(year, month - 1, day, 0, 0, 0, 0);
                    const endDate = new Date(year, month - 1, day, 23, 59, 59, 999);
                    
                    assignments.push({
                        type: 'OFF',
                        id: Utils.generateId('OFF-'),
                        startTime: startDate,
                        endTime: endDate,
                        preloaded: true,
                        notes: 'Ausencia pre-cargada'
                    });
                });
            }
            
            // Add TRN (Training)
            if (pilot.training && pilot.training.size > 0) {
                pilot.training.forEach(dateStr => {
                    const [year, month, day] = dateStr.split('-').map(Number);
                    const startDate = new Date(year, month - 1, day, 0, 0, 0, 0);
                    const endDate = new Date(year, month - 1, day, 23, 59, 59, 999);
                    
                    assignments.push({
                        type: 'TRN',
                        id: Utils.generateId('TRN-'),
                        startTime: startDate,
                        endTime: endDate,
                        preloaded: true,
                        notes: 'Entrenamiento pre-cargado'
                    });
                });
            }
            
            // Sort by date and save
            assignments.sort((a, b) => new Date(a.startTime) - new Date(b.startTime));
            AppState.assignments.set(pilot.id, assignments);
        });
    },
    
    parseDateList(value) {
        if (!value) return new Set();
        const dates = new Set();
        value.toString().split(',').forEach(part => {
            const trimmed = part.trim();
            if (!trimmed) return;
            
            // Try DD-MM-YYYY or DD/MM/YYYY format first
            const ddmmyyyy = trimmed.match(/^(\d{1,2})[-\/](\d{1,2})[-\/](\d{4})$/);
            if (ddmmyyyy) {
                const day = parseInt(ddmmyyyy[1]);
                const month = parseInt(ddmmyyyy[2]);
                const year = parseInt(ddmmyyyy[3]);
                const dateStr = `${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
                dates.add(dateStr);
                return;
            }
            
            // Try YYYY-MM-DD format
            const yyyymmdd = trimmed.match(/^(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})$/);
            if (yyyymmdd) {
                const year = parseInt(yyyymmdd[1]);
                const month = parseInt(yyyymmdd[2]);
                const day = parseInt(yyyymmdd[3]);
                const dateStr = `${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
                dates.add(dateStr);
                return;
            }
            
            // Try Excel date (number)
            const date = Utils.parseExcelDate(trimmed);
            if (date && !isNaN(date.getTime())) {
                dates.add(date.toISOString().split('T')[0]);
            }
        });
        return dates;
    }
};

// ============================================
// ROTATION GENERATOR
// ============================================
const RotationGenerator = {
    generate(flights) {
        if (!flights || flights.length === 0) return [];
        
        const sorted = [...flights].sort((a, b) => {
            if (a.tail !== b.tail) return a.tail.localeCompare(b.tail);
            return Utils.combineDateTime(a.day, a.deptTime) - Utils.combineDateTime(b.day, b.deptTime);
        });
        
        const filtered = sorted.filter(f => !f.flightNumber.match(/^[WMLA]/));
        
        const rotations = [];
        let rotationId = 1;
        let currentLegs = [];
        let stationsPath = [];
        
        filtered.forEach(flight => {
            if (currentLegs.length === 0) {
                currentLegs.push(flight);
                stationsPath = [flight.deptSta, flight.arvlSta];
            } else {
                const lastLeg = currentLegs[currentLegs.length - 1];
                
                if (flight.tail === lastLeg.tail && flight.deptSta === lastLeg.arvlSta) {
                    currentLegs.push(flight);
                    stationsPath.push(flight.arvlSta);
                } else {
                    if (this.shouldCloseRotation(stationsPath)) {
                        const rotation = this.buildRotation(rotationId++, currentLegs, stationsPath);
                        if (rotation) rotations.push(rotation);
                    }
                    currentLegs = [flight];
                    stationsPath = [flight.deptSta, flight.arvlSta];
                }
            }
            
            if (this.shouldCloseRotation(stationsPath)) {
                const rotation = this.buildRotation(rotationId++, currentLegs, stationsPath);
                if (rotation) rotations.push(rotation);
                currentLegs = [];
                stationsPath = [];
            }
        });
        
        if (currentLegs.length > 0 && this.shouldCloseRotation(stationsPath)) {
            const rotation = this.buildRotation(rotationId++, currentLegs, stationsPath);
            if (rotation) rotations.push(rotation);
        }
        
        AppState.rotations = rotations;
        this.generateSlots(rotations);
        return rotations;
    },
    
    shouldCloseRotation(stationsPath) {
        if (!stationsPath || stationsPath.length === 0) return false;
        const last = stationsPath[stationsPath.length - 1];
        return CONFIG.VALID_BASES.has(last);
    },
    
    buildRotation(id, legs, stationsPath) {
        if (!legs || legs.length === 0) return null;
        
        const firstLeg = legs[0];
        const lastLeg = legs[legs.length - 1];
        
        const startTime = Utils.combineDateTime(firstLeg.day, firstLeg.deptTime);
        let endTime = Utils.combineDateTime(lastLeg.day, lastLeg.arvlTime);
        if (endTime < startTime) endTime.setDate(endTime.getDate() + 1);
        
        // FT = suma del tiempo de cada vuelo individual
        let ftTotal = 0;
        legs.forEach(leg => {
            const dept = Utils.combineDateTime(leg.day, leg.deptTime);
            let arvl = Utils.combineDateTime(leg.day, leg.arvlTime);
            if (arvl < dept) arvl.setDate(arvl.getDate() + 1);
            const legFT = Utils.hoursBetween(dept, arvl);
            ftTotal += legFT;
        });
        
        // ST = tiempo transcurrido desde inicio hasta fin + 1.5h (o +1h si es ruta doméstica)
        const elapsedTime = Utils.hoursBetween(startTime, endTime);
        const routeKey = `${firstLeg.deptSta}${lastLeg.arvlSta}`;
        const stAdd = CONFIG.DOMESTIC_ROUTES.has(routeKey) ? CONFIG.ST_ADD_DOMESTIC : CONFIG.ST_ADD_INTERNATIONAL;
        const stTotal = elapsedTime + stAdd;
        
        const deptHour = firstLeg.deptTime.hours + firstLeg.deptTime.minutes / 60;
        const isDayWindow = deptHour >= CONFIG.DAY_WINDOW.start && deptHour <= CONFIG.DAY_WINDOW.end;
        const crewInfo = this.determineCrewSize(ftTotal, stTotal, isDayWindow);
        const isNight = Utils.isNightRotation(startTime, endTime);
        
        const restBase = this.calculateRestBase(ftTotal);
        const restAway = this.calculateRestAway(ftTotal);
        
        return {
            id: `ROT-${String(id).padStart(3, '0')}`,
            tail: firstLeg.tail,
            origin: firstLeg.deptSta,
            destination: lastLeg.arvlSta,
            route: stationsPath.join('-'),
            legs: legs.length,
            startTime,
            endTime,
            ftTotal: Math.round(ftTotal * 100) / 100,
            stTotal: Math.round(stTotal * 100) / 100,
            crew: crewInfo.crew,
            distribution: crewInfo.distribution,
            isNight,
            restBase,
            restAway,
            nextRotBase: new Date(endTime.getTime() + restBase * 60 * 60 * 1000),
            nextRotAway: new Date(endTime.getTime() + restAway * 60 * 60 * 1000)
        };
    },
    
    determineCrewSize(ft, st, isDayWindow) {
        const stLimit = isDayWindow ? 'ST_DAY' : 'ST_NIGHT';
        if (ft <= CONFIG.LIMITS.CREW_2.FT && st <= CONFIG.LIMITS.CREW_2[stLimit]) return { crew: 2, distribution: '1 CAP, 1 COP' };
        if (ft <= CONFIG.LIMITS.CREW_3.FT && st <= CONFIG.LIMITS.CREW_3[stLimit]) return { crew: 3, distribution: '1 CAP, 1 COP, 1 CRP' };
        return { crew: 4, distribution: '2 CAP, 2 COP' };
    },
    
    calculateRestBase(ft) {
        if (ft <= 4) return 8;
        if (ft <= 9) return 10;
        if (ft <= 12) return 12;
        if (ft <= 14) return 14;
        return 16;
    },
    
    calculateRestAway(ft) {
        if (ft <= 4) return 10;
        if (ft <= 9) return 12;
        if (ft <= 12) return 18;
        return 24;
    },
    
    generateSlots(rotations) {
        const slots = [];
        rotations.forEach(rotation => {
            const distMatch = rotation.distribution.match(/(\d+)\s*(CAP|COP|CRP)/gi) || [];
            const counts = { CAP: 0, COP: 0, CRP: 0 };
            distMatch.forEach(m => {
                const match = m.match(/(\d+)\s*(CAP|COP|CRP)/i);
                if (match) counts[match[2].toUpperCase()] += parseInt(match[1]);
            });
            
            ['CAP', 'COP', 'CRP'].forEach(role => {
                for (let i = 0; i < counts[role]; i++) {
                    slots.push({
                        id: `${rotation.id}-${role}-${i + 1}`,
                        rotationId: rotation.id,
                        role,
                        slotNumber: i + 1,
                        rotation,
                        pilotId: null,
                        pilotName: null
                    });
                }
            });
        });
        
        AppState.slots = slots;
        return slots;
    }
};

// ============================================
// PILOT VALIDATOR (Based on Python logic)
// ============================================
const PilotValidator = {
    isRoleCompatible(pilot, slotRole) {
        const r = pilot.role.toUpperCase();
        const sr = slotRole.toUpperCase();
        if (sr === 'CAP') return r.includes('CAP');
        if (sr === 'COP') return r.includes('COP');
        if (sr === 'CRP') return r.includes('CRP') || r.includes('CAP') || r.includes('COP');
        return false;
    },
    
    isTailQualified(pilot, tail, role) {
        if (!tail) return true;
        if (role.toUpperCase() === 'CRP') {
            return pilot.qualifiedTailsCRF.includes(tail) || pilot.qualifiedTails.includes(tail);
        }
        return pilot.qualifiedTails.includes(tail);
    },
    
    isAvailableOnDates(pilot, startDate, endDate) {
        const dates = Utils.getDateRange(startDate, endDate);
        for (const date of dates) {
            const dateStr = date.toISOString().split('T')[0];
            if (pilot.freeDays.has(dateStr) || pilot.absences.has(dateStr) || pilot.training.has(dateStr)) return false;
        }
        return true;
    },
    
    hasTimeOverlap(pilot, startTime, endTime, excludeSlotId = null) {
        const assignments = AppState.assignments.get(pilot.id) || [];
        const start = new Date(startTime);
        const end = new Date(endTime);
        const startMs = start.getTime();
        const endMs = end.getTime();
        
        // Get dates covered by the new assignment
        const newDates = new Set();
        const tempDate = new Date(start);
        while (tempDate <= end) {
            newDates.add(tempDate.toISOString().split('T')[0]);
            tempDate.setDate(tempDate.getDate() + 1);
        }
        
        for (const a of assignments) {
            if (excludeSlotId && a.slotId === excludeSlotId) continue;
            
            // Skip non-operational types (FREE, OFF, etc. don't cause overlap)
            const operationalTypes = new Set(['ROT', 'DH', 'TRN', 'OFI']);
            if (!operationalTypes.has(a.type)) continue;
            
            const aStart = new Date(a.startTime);
            const aEnd = new Date(a.endTime);
            const aStartMs = aStart.getTime();
            const aEndMs = aEnd.getTime();
            
            // Check time overlap
            if (!(endMs <= aStartMs || startMs >= aEndMs)) return true;
            
            // Also check if ANY day overlaps (no two operational assignments on same day)
            const tempA = new Date(aStart);
            while (tempA <= aEnd) {
                const dateStr = tempA.toISOString().split('T')[0];
                if (newDates.has(dateStr)) return true;
                tempA.setDate(tempA.getDate() + 1);
            }
        }
        return false;
    },
    
    // Get the pilot's location BEFORE a given time
    getLocationBefore(pilot, beforeTime) {
        const assignments = AppState.assignments.get(pilot.id) || [];
        const before = new Date(beforeTime).getTime();
        
        let lastEnd = 0;
        let lastLocation = pilot.base;
        
        for (const a of assignments) {
            const aEnd = new Date(a.endTime).getTime();
            if (aEnd < before && aEnd > lastEnd) {
                lastEnd = aEnd;
                lastLocation = a.destination || a.origin || pilot.base;
            }
        }
        
        return lastLocation;
    },
    
    // Check if previous day was a free/off day
    hadFreeDayBefore(pilot, beforeTime) {
        const assignments = AppState.assignments.get(pilot.id) || [];
        const before = new Date(beforeTime);
        const prevDay = new Date(before);
        prevDay.setDate(prevDay.getDate() - 1);
        const prevDayStr = prevDay.toISOString().split('T')[0];
        
        // Check if previous day had FREE, OFF, VAC, L
        const nonOperationalTypes = new Set(['FREE', 'OFF', 'VAC', 'L', 'LUS']);
        
        for (const a of assignments) {
            if (!nonOperationalTypes.has(a.type)) continue;
            const startStr = new Date(a.startTime).toISOString().split('T')[0];
            const endStr = new Date(a.endTime).toISOString().split('T')[0];
            if (prevDayStr >= startStr && prevDayStr <= endStr) {
                return true;
            }
        }
        
        // Also check pilot's freeDays, absences from DB
        if (pilot.freeDays?.has(prevDayStr) || pilot.absences?.has(prevDayStr)) {
            return true;
        }
        
        return false;
    },
    
    // Check geographic continuity - NO BLOCKING, only for validation warnings
    validateGeographicContinuity(pilot, rotation, excludeSlotId = null) {
        // Geographic continuity is now only checked in validation (as warning)
        // Assignment is always allowed - user can add DH manually
        const currentLoc = this.getLocationBefore(pilot, rotation.startTime);
        
        if (currentLoc === rotation.origin) return { valid: true };
        
        // Check if DH is possible (suggest it but don't require it)
        const dhRoute = `${currentLoc}-${rotation.origin}`;
        if (CONFIG.ALLOWED_DH_ROUTES.has(dhRoute)) {
            return { valid: true, needsDH: true, dhOrigin: currentLoc, dhDestination: rotation.origin };
        }
        
        // Allow anyway - user can add DH manually
        return { valid: true, warning: `Ubicación: ${currentLoc}→${rotation.origin}` };
    },
    
    getPreviousAssignment(pilot, beforeTime, excludeFree = true) {
        const assignments = AppState.assignments.get(pilot.id) || [];
        const before = new Date(beforeTime).getTime();
        
        let prev = null;
        let prevEnd = 0;
        
        // Types that REQUIRE rest calculation (operational assignments)
        const operationalTypes = new Set(['ROT', 'DH', 'TRN', 'OFI']);
        
        for (const a of assignments) {
            // Only consider operational assignments for rest calculation
            if (excludeFree && !operationalTypes.has(a.type)) continue;
            
            const aEnd = new Date(a.endTime).getTime();
            if (aEnd < before && aEnd > prevEnd) {
                prevEnd = aEnd;
                prev = a;
            }
        }
        
        return prev;
    },
    
    // Validate rest between assignments - ONLY for operational types
    validateRest(pilot, rotation, excludeSlotId = null) {
        const prevAssignment = this.getPreviousAssignment(pilot, rotation.startTime);
        
        // No previous operational assignment = no rest required
        if (!prevAssignment) return { valid: true };
        
        // Only ROT, DH, TRN require rest - everything else is ignored
        const operationalTypes = new Set(['ROT', 'DH', 'TRN', 'OFI']);
        if (!operationalTypes.has(prevAssignment.type)) {
            return { valid: true };
        }
        
        const restRequired = prevAssignment.destination === pilot.base ? 
            (prevAssignment.restBase || 10) : (prevAssignment.restAway || 12);
        const actualRest = Utils.hoursBetween(prevAssignment.endTime, rotation.startTime);
        
        if (actualRest < restRequired) {
            return { valid: false, reason: `Descanso: ${actualRest.toFixed(1)}h < ${restRequired}h req.` };
        }
        
        // Check 1:30 AM rule for next day
        const prev = new Date(prevAssignment.endTime);
        const next = new Date(rotation.startTime);
        
        if (!Utils.isSameDay(prev, next)) {
            const nextHour = next.getHours() + next.getMinutes() / 60;
            // If next day, must start after 1:30 AM
            if (nextHour < CONFIG.NEXT_DAY_START_HOUR && nextHour !== 0) {
                return { valid: false, reason: `Inicio antes de 01:30 (${Utils.formatDate(next, 'time')})` };
            }
        }
        
        return { valid: true };
    },
    
    // FT Limits
    respectsFTLimits(pilot, startTime, ftHours) {
        const month = new Date(startTime).getMonth();
        const year = new Date(startTime).getFullYear();
        const day = new Date(startTime).getDate();
        const monthKey = `${year}-${month}`;
        const fortnightKey = `${year}-${month}-${day <= 15 ? 1 : 2}`;
        
        const currentMonthFT = pilot.ftByMonth[monthKey] || 0;
        const currentFortnightFT = pilot.ftByFortnight[fortnightKey] || 0;
        
        if (currentMonthFT + ftHours > CONFIG.PILOT_LIMITS.MAX_MONTHLY_HOURS) {
            return { valid: false, reason: `Excede 90h/mes (${Math.round(currentMonthFT + ftHours)}h)` };
        }
        if (currentFortnightFT + ftHours > CONFIG.PILOT_LIMITS.MAX_FORTNIGHT_HOURS) {
            return { valid: false, reason: `Excede 50h/quincena (${Math.round(currentFortnightFT + ftHours)}h)` };
        }
        return { valid: true };
    },
    
    // Get assignments for a specific day
    getAssignmentsForDay(pilot, date) {
        const assignments = AppState.assignments.get(pilot.id) || [];
        const dateStr = new Date(date).toISOString().split('T')[0];
        
        return assignments.filter(a => {
            const startStr = new Date(a.startTime).toISOString().split('T')[0];
            const endStr = new Date(a.endTime).toISOString().split('T')[0];
            return dateStr >= startStr && dateStr <= endStr;
        });
    },
    
    // Calculate accumulated duty for a day
    getDailyDuty(pilot, date, excludeSlotId = null) {
        const assignments = this.getAssignmentsForDay(pilot, date);
        let totalDuty = 0;
        
        assignments.forEach(a => {
            if (excludeSlotId && a.slotId === excludeSlotId) return;
            // Only count ROT and DH for duty
            if (a.type === 'ROT' || a.type === 'DH') {
                totalDuty += a.stHours || a.dutyHours || 0;
            }
        });
        
        return totalDuty;
    },
    
    // Calculate accumulated FT for a day
    getDailyFT(pilot, date, excludeSlotId = null) {
        const assignments = this.getAssignmentsForDay(pilot, date);
        let totalFT = 0;
        
        assignments.forEach(a => {
            if (excludeSlotId && a.slotId === excludeSlotId) return;
            if (a.type === 'ROT' || a.type === 'DH') {
                totalFT += a.ftHours || 0;
            }
        });
        
        return totalFT;
    },
    
    // Validate Duty Time limits
    respectsDutyLimits(pilot, rotation, excludeSlotId = null) {
        const startDate = new Date(rotation.startTime);
        const isNight = rotation.isNight || Utils.isNightRotation(rotation.startTime, rotation.endTime);
        const crewSize = rotation.crew || 2;
        
        // Get limits based on crew size
        let limits;
        if (crewSize >= 4) limits = CONFIG.LIMITS.CREW_4;
        else if (crewSize >= 3) limits = CONFIG.LIMITS.CREW_3;
        else limits = CONFIG.LIMITS.CREW_2;
        
        const ftLimit = limits.FT;
        const stLimit = isNight ? limits.ST_NIGHT : limits.ST_DAY;
        
        // Get existing duty and FT for the day
        const existingDuty = this.getDailyDuty(pilot, startDate, excludeSlotId);
        const existingFT = this.getDailyFT(pilot, startDate, excludeSlotId);
        
        const newDuty = rotation.stTotal || 0;
        const newFT = rotation.ftTotal || 0;
        
        const totalDuty = existingDuty + newDuty;
        const totalFT = existingFT + newFT;
        
        // Validate FT limit for the day
        if (totalFT > ftLimit) {
            return { 
                valid: false, 
                reason: `Excede FT diario: ${totalFT.toFixed(1)}h > ${ftLimit}h (crew ${crewSize})` 
            };
        }
        
        // Validate ST/Duty limit for the day
        if (totalDuty > stLimit) {
            return { 
                valid: false, 
                reason: `Excede Duty diario: ${totalDuty.toFixed(1)}h > ${stLimit}h (${isNight ? 'noche' : 'día'})` 
            };
        }
        
        return { valid: true, dailyDuty: totalDuty, dailyFT: totalFT };
    },
    
    // Check continuous days limit (6 days max)
    isDateAssigned(pilot, date, excludeSlotId = null) {
        const assignments = AppState.assignments.get(pilot.id) || [];
        const dateStr = new Date(date).toISOString().split('T')[0];
        
        return assignments.some(a => {
            if (excludeSlotId && a.slotId === excludeSlotId) return false;
            const start = new Date(a.startTime).toISOString().split('T')[0];
            const end = new Date(a.endTime).toISOString().split('T')[0];
            return dateStr >= start && dateStr <= end;
        });
    },
    
    respectsContinuousDaysLimit(pilot, startDate, endDate, excludeSlotId = null) {
        let prevDays = 0;
        let checkDate = new Date(startDate);
        checkDate.setDate(checkDate.getDate() - 1);
        
        // Only count operational days (not OFF, FREE, VAC, etc.)
        const nonOperationalTypes = new Set(['OFF', 'VAC', 'FREE', 'LUS', 'INC', 'L']);
        
        while (this.isDateAssignedOperational(pilot, checkDate, excludeSlotId, nonOperationalTypes)) {
            prevDays++;
            checkDate.setDate(checkDate.getDate() - 1);
        }
        
        const newDays = Math.ceil((new Date(endDate) - new Date(startDate)) / (1000 * 60 * 60 * 24)) + 1;
        
        // Return warning instead of error - don't block
        if (prevDays + newDays > CONFIG.PILOT_LIMITS.MAX_CONTINUOUS_DAYS) {
            return { valid: true, warning: `${prevDays + newDays} días continuos de asignación (máx recomendado: 6)` };
        }
        return { valid: true };
    },
    
    isDateAssignedOperational(pilot, date, excludeSlotId, nonOperationalTypes) {
        const assignments = AppState.assignments.get(pilot.id) || [];
        return assignments.some(a => {
            if (excludeSlotId && a.slotId === excludeSlotId) return false;
            if (nonOperationalTypes.has(a.type)) return false; // Don't count free days
            const aStart = new Date(a.startTime);
            const aEnd = new Date(a.endTime);
            return Utils.isSameDay(aStart, date) || (aStart <= date && aEnd >= date);
        });
    },
    
    // Away from base limit (6 days max) - WARNING only, don't block
    respectsAwayLimit(pilot, startDate, endDate, destination, excludeSlotId = null) {
        if (destination === pilot.base) return { valid: true };
        
        const assignments = AppState.assignments.get(pilot.id) || [];
        const nonOperationalTypes = new Set(['OFF', 'VAC', 'FREE', 'LUS', 'INC', 'L']);
        
        // Find when pilot left base
        let awayStart = new Date(startDate);
        let checkDate = new Date(startDate);
        checkDate.setDate(checkDate.getDate() - 1);
        
        while (true) {
            const prevAssignment = assignments.find(a => {
                if (excludeSlotId && a.slotId === excludeSlotId) return false;
                // Non-operational types = pilot is at base
                if (nonOperationalTypes.has(a.type)) return false;
                const aStart = new Date(a.startTime);
                const aEnd = new Date(a.endTime);
                return (Utils.isSameDay(aEnd, checkDate) || (aStart <= checkDate && aEnd >= checkDate));
            });
            
            if (!prevAssignment) break;
            if (prevAssignment.destination === pilot.base) break;
            
            awayStart = new Date(prevAssignment.startTime);
            checkDate.setDate(checkDate.getDate() - 1);
        }
        
        const daysAway = Math.ceil((new Date(endDate) - awayStart) / (1000 * 60 * 60 * 24)) + 1;
        
        // Return warning instead of error - don't block
        if (daysAway > CONFIG.PILOT_LIMITS.MAX_AWAY_DAYS) {
            return { valid: true, warning: `${daysAway} días fuera de base (máx recomendado: 6)` };
        }
        return { valid: true };
    },
    
    // Main validation function
    validateAssignment(pilot, slot, checkGeography = true, excludeSlotId = null) {
        const rotation = slot.rotation;
        const errors = [];
        const warnings = [];
        
        if (!this.isRoleCompatible(pilot, slot.role)) errors.push('Rol no compatible');
        if (!this.isTailQualified(pilot, rotation.tail, slot.role)) errors.push(`No habilitado para ${rotation.tail}`);
        if (!this.isAvailableOnDates(pilot, rotation.startTime, rotation.endTime)) errors.push('Día libre/ausencia/training');
        if (this.hasTimeOverlap(pilot, rotation.startTime, rotation.endTime, excludeSlotId)) errors.push('Conflicto de horario');
        
        const restCheck = this.validateRest(pilot, rotation, excludeSlotId);
        if (!restCheck.valid) errors.push(restCheck.reason);
        
        const ftCheck = this.respectsFTLimits(pilot, rotation.startTime, rotation.ftTotal);
        if (!ftCheck.valid) errors.push(ftCheck.reason);
        
        // NEW: Validate daily duty limits
        const dutyCheck = this.respectsDutyLimits(pilot, rotation, excludeSlotId);
        if (!dutyCheck.valid) errors.push(dutyCheck.reason);
        
        const contCheck = this.respectsContinuousDaysLimit(pilot, rotation.startTime, rotation.endTime, excludeSlotId);
        if (!contCheck.valid) errors.push(contCheck.reason);
        
        const awayCheck = this.respectsAwayLimit(pilot, rotation.startTime, rotation.endTime, rotation.destination, excludeSlotId);
        if (!awayCheck.valid) errors.push(awayCheck.reason);
        
        let needsDH = false;
        let dhInfo = null;
        
        if (checkGeography) {
            const geoCheck = this.validateGeographicContinuity(pilot, rotation, excludeSlotId);
            if (!geoCheck.valid) {
                errors.push(geoCheck.reason);
            } else if (geoCheck.needsDH) {
                needsDH = true;
                dhInfo = { origin: geoCheck.dhOrigin, destination: geoCheck.dhDestination };
            }
        }
        
        return { 
            valid: errors.length === 0, 
            errors, 
            warnings,
            needsDH, 
            dhInfo,
            dutyInfo: dutyCheck.valid ? { dailyDuty: dutyCheck.dailyDuty, dailyFT: dutyCheck.dailyFT } : null
        };
    },
    
    // Find available DH date before rotation
    findDHDate(pilot, rotation) {
        const startDate = new Date(rotation.startTime);
        startDate.setHours(0, 0, 0, 0);
        
        const prevAssignment = this.getPreviousAssignment(pilot, rotation.startTime);
        let earliestDate = prevAssignment ? new Date(prevAssignment.endTime) : new Date(startDate);
        earliestDate.setDate(earliestDate.getDate() + 1);
        earliestDate.setHours(0, 0, 0, 0);
        
        const minAllowed = new Date(startDate);
        minAllowed.setDate(minAllowed.getDate() - CONFIG.MAX_DH_DAYS_BEFORE);
        if (earliestDate < minAllowed) earliestDate = minAllowed;
        
        const latestDate = new Date(startDate);
        latestDate.setDate(latestDate.getDate() - 1);
        
        if (earliestDate > latestDate) return null;
        
        // Find a free day for DH
        let checkDate = new Date(latestDate);
        while (checkDate >= earliestDate) {
            if (!this.isDateAssigned(pilot, checkDate)) {
                return new Date(checkDate);
            }
            checkDate.setDate(checkDate.getDate() - 1);
        }
        return null;
    }
};

// ============================================
// AUTO ASSIGNER (Based on Python logic)
// ============================================
const AutoAssigner = {
    assign(strategy = 'ft_then_seniority') {
        // Reset pilot states
        AppState.pilots.forEach(pilot => {
            pilot.currentLocation = pilot.base;
            pilot.nextAvailableTime = null;
            pilot.awayStartDate = null;
            pilot.ftByMonth = {};
            pilot.ftByFortnight = {};
        });
        
        // Keep only preloaded events (FREE, OFF, TRN from DB), remove ROT and DH assignments
        AppState.pilots.forEach(pilot => {
            const existing = AppState.assignments.get(pilot.id) || [];
            const preloaded = existing.filter(a => a.preloaded === true);
            AppState.assignments.set(pilot.id, preloaded);
        });
        
        // Reset all slots to unassigned
        AppState.slots.forEach(slot => { 
            slot.pilotId = null; 
            slot.pilotName = null; 
        });
        
        // Calculate difficulty on original slots
        this.calculateDifficulty(AppState.slots);
        
        // Sort by difficulty then by date
        const sortedSlots = [...AppState.slots].sort((a, b) => {
            if (a.difficulty !== b.difficulty) return a.difficulty - b.difficulty;
            return new Date(a.rotation.startTime) - new Date(b.rotation.startTime);
        });
        
        const results = { assigned: 0, unassigned: 0, dhUsed: 0, dhRecords: [] };
        
        // Assign using the sorted order but modify original slots
        sortedSlots.forEach(sortedSlot => {
            // Find the original slot in AppState.slots
            const slot = AppState.slots.find(s => s.id === sortedSlot.id);
            if (!slot) return;
            
            const result = this.assignSlot(slot, strategy);
            if (result.assigned) {
                results.assigned++;
                if (result.dhUsed) {
                    results.dhUsed++;
                    if (result.dhRecord) results.dhRecords.push(result.dhRecord);
                }
            } else {
                results.unassigned++;
            }
        });
        
        // Add DH to base for pilots ending outside base
        this.addRepositionDHToBase(results);
        
        return results;
    },
    
    calculateDifficulty(slots) {
        // Add difficulty property to original slots (not copies)
        slots.forEach(slot => {
            let eligibleCount = 0;
            AppState.pilots.forEach(pilot => {
                if (PilotValidator.isRoleCompatible(pilot, slot.role) &&
                    PilotValidator.isTailQualified(pilot, slot.rotation.tail, slot.role) &&
                    PilotValidator.isAvailableOnDates(pilot, slot.rotation.startTime, slot.rotation.endTime)) {
                    eligibleCount++;
                }
            });
            slot.difficulty = eligibleCount === 0 ? 10000 : eligibleCount;
        });
        return slots;
    },
    
    assignSlot(slot, strategy) {
        const rotation = slot.rotation;
        
        // Phase 1: Candidates WITHOUT DH (strict geographic continuity)
        const noDHCandidates = [];
        
        AppState.pilots.forEach(pilot => {
            const currentLoc = PilotValidator.getLocationBefore(pilot, rotation.startTime);
            if (currentLoc !== rotation.origin) return;
            
            const validation = PilotValidator.validateAssignment(pilot, slot, false);
            if (validation.valid) {
                noDHCandidates.push(pilot);
            }
        });
        
        if (noDHCandidates.length > 0) {
            this.sortByStrategy(noDHCandidates, strategy);
            const bestPilot = noDHCandidates[0];
            this.registerAssignment(bestPilot, slot);
            return { assigned: true, dhUsed: false };
        }
        
        // Phase 2: Try with DH before
        const dhCandidates = [];
        
        AppState.pilots.forEach(pilot => {
            const currentLoc = PilotValidator.getLocationBefore(pilot, rotation.startTime);
            if (currentLoc === rotation.origin) return; // Already tried above
            
            // Check if DH route is allowed
            const dhRoute = `${currentLoc}-${rotation.origin}`;
            if (!CONFIG.ALLOWED_DH_ROUTES.has(dhRoute)) return;
            
            // Validate without geography check
            const validation = PilotValidator.validateAssignment(pilot, slot, false);
            if (!validation.valid) return;
            
            // Find DH date
            const dhDate = PilotValidator.findDHDate(pilot, rotation);
            if (!dhDate) return;
            
            dhCandidates.push({ pilot, dhDate, dhOrigin: currentLoc, dhDestination: rotation.origin });
        });
        
        if (dhCandidates.length > 0) {
            dhCandidates.sort((a, b) => this.compareByStrategy(a.pilot, b.pilot, strategy));
            const { pilot, dhDate, dhOrigin, dhDestination } = dhCandidates[0];
            
            // Register DH first
            const dhRecord = this.registerDH(pilot, dhOrigin, dhDestination, dhDate, slot);
            
            // Then register rotation
            this.registerAssignment(pilot, slot);
            
            return { assigned: true, dhUsed: true, dhRecord };
        }
        
        return { assigned: false };
    },
    
    sortByStrategy(pilots, strategy) {
        pilots.sort((a, b) => this.compareByStrategy(a, b, strategy));
    },
    
    compareByStrategy(a, b, strategy) {
        const getTotalFT = p => Object.values(p.ftByMonth).reduce((sum, h) => sum + h, 0);
        if (strategy === 'seniority') return a.seniority - b.seniority || getTotalFT(a) - getTotalFT(b);
        if (strategy === 'reverse_seniority') return b.seniority - a.seniority || getTotalFT(a) - getTotalFT(b);
        return getTotalFT(a) - getTotalFT(b) || a.seniority - b.seniority;
    },
    
    registerAssignment(pilot, slot) {
        const rotation = slot.rotation;
        slot.pilotId = pilot.id;
        slot.pilotName = pilot.name;
        
        const assignment = {
            type: 'ROT',
            slotId: slot.id,
            rotationId: rotation.id,
            role: slot.role,
            tail: rotation.tail,
            origin: rotation.origin,
            destination: rotation.destination,
            route: rotation.route,
            startTime: new Date(rotation.startTime),
            endTime: new Date(rotation.endTime),
            ftHours: rotation.ftTotal,
            stHours: rotation.stTotal,
            restBase: rotation.restBase,
            restAway: rotation.restAway,
            isNight: rotation.isNight,
            crew: rotation.crew || 2,
            distribution: rotation.distribution
        };
        
        const assignments = AppState.assignments.get(pilot.id) || [];
        assignments.push(assignment);
        assignments.sort((a, b) => new Date(a.startTime) - new Date(b.startTime));
        AppState.assignments.set(pilot.id, assignments);
        
        pilot.currentLocation = rotation.destination;
        
        const month = rotation.startTime.getMonth();
        const year = rotation.startTime.getFullYear();
        const day = rotation.startTime.getDate();
        const monthKey = `${year}-${month}`;
        const fortnightKey = `${year}-${month}-${day <= 15 ? 1 : 2}`;
        pilot.ftByMonth[monthKey] = (pilot.ftByMonth[monthKey] || 0) + rotation.ftTotal;
        pilot.ftByFortnight[fortnightKey] = (pilot.ftByFortnight[fortnightKey] || 0) + rotation.ftTotal;
    },
    
    registerDH(pilot, origin, destination, dhDate, relatedSlot = null) {
        const dhStart = new Date(dhDate);
        dhStart.setHours(6, 0, 0, 0);
        const dhEnd = new Date(dhDate);
        dhEnd.setHours(20, 0, 0, 0);
        
        const dhRecord = {
            type: 'DH',
            id: Utils.generateId('DH-'),
            origin,
            destination,
            startTime: dhStart,
            endTime: dhEnd,
            relatedRotation: relatedSlot?.rotationId || null,
            restBase: 10,
            restAway: 12
        };
        
        const assignments = AppState.assignments.get(pilot.id) || [];
        assignments.push(dhRecord);
        assignments.sort((a, b) => new Date(a.startTime) - new Date(b.startTime));
        AppState.assignments.set(pilot.id, assignments);
        
        pilot.currentLocation = destination;
        
        return dhRecord;
    },
    
    // Add DH to return to base for pilots ending outside
    addRepositionDHToBase(results) {
        AppState.pilots.forEach(pilot => {
            const assignments = AppState.assignments.get(pilot.id) || [];
            if (assignments.length === 0) return;
            
            // Get last assignment
            const lastAssignment = assignments.reduce((last, a) => {
                if (!last || new Date(a.endTime) > new Date(last.endTime)) return a;
                return last;
            }, null);
            
            if (!lastAssignment) return;
            
            const currentLoc = lastAssignment.destination || pilot.currentLocation;
            if (currentLoc === pilot.base) return;
            
            // Check if DH route is allowed
            const dhRoute = `${currentLoc}-${pilot.base}`;
            if (!CONFIG.ALLOWED_DH_ROUTES.has(dhRoute)) return;
            
            // Find next day
            const dhDate = new Date(lastAssignment.endTime);
            dhDate.setDate(dhDate.getDate() + 1);
            dhDate.setHours(0, 0, 0, 0);
            
            // Check if day is free
            if (PilotValidator.isDateAssigned(pilot, dhDate)) return;
            
            this.registerDH(pilot, currentLoc, pilot.base, dhDate, null);
            results.dhUsed++;
        });
    },
    
    unassignSlot(slot) {
        const pilot = AppState.pilots.find(p => p.id === slot.pilotId);
        if (!pilot) return;
        
        const assignments = AppState.assignments.get(pilot.id) || [];
        const idx = assignments.findIndex(a => a.slotId === slot.id);
        
        if (idx > -1) {
            const removed = assignments.splice(idx, 1)[0];
            
            // Update FT counters
            if (removed.ftHours) {
                const start = new Date(removed.startTime);
                const monthKey = `${start.getFullYear()}-${start.getMonth()}`;
                const fortnightKey = `${start.getFullYear()}-${start.getMonth()}-${start.getDate() <= 15 ? 1 : 2}`;
                pilot.ftByMonth[monthKey] = Math.max(0, (pilot.ftByMonth[monthKey] || 0) - removed.ftHours);
                pilot.ftByFortnight[fortnightKey] = Math.max(0, (pilot.ftByFortnight[fortnightKey] || 0) - removed.ftHours);
            }
            
            AppState.assignments.set(pilot.id, assignments);
        }
        
        slot.pilotId = null;
        slot.pilotName = null;
    }
};

// ============================================
// SCHEDULE VALIDATOR
// ============================================
const ScheduleValidator = {
    validate() {
        const results = { errors: [], warnings: [], stats: { total: 0, valid: 0, errors: 0, warnings: 0 } };
        const { year, month } = AppState.currentPeriod;
        
        // Types that count as operational assignments (require rest, count as continuous duty)
        const operationalTypes = new Set(['ROT', 'DH', 'TRN', 'OFI']);
        // Types that don't count as assignments (no rest needed)
        const nonOperationalTypes = new Set(['OFF', 'VAC', 'FREE', 'LUS', 'INC', 'L']);
        
        AppState.pilots.forEach(pilot => {
            const assignments = AppState.assignments.get(pilot.id) || [];
            if (assignments.length === 0) return;
            
            const sorted = [...assignments].sort((a, b) => new Date(a.startTime) - new Date(b.startTime));
            
            // Track consecutive days outside base
            let consecutiveDaysOutside = 0;
            let lastOutsideDate = null;
            let consecutiveAssignmentDays = 0;
            let lastAssignmentDate = null;
            
            for (let i = 0; i < sorted.length; i++) {
                const current = sorted[i];
                const currentDate = new Date(current.startTime);
                const dayOfMonth = currentDate.getDate();
                results.stats.total++;
                
                // Format date for error messages
                const dateStr = `${dayOfMonth}/${month}`;
                
                // Skip validation for non-operational types - they don't need rest
                if (nonOperationalTypes.has(current.type)) {
                    // Reset consecutive assignment counter
                    consecutiveAssignmentDays = 0;
                    lastAssignmentDate = null;
                    results.stats.valid++;
                    continue;
                }
                
                // Track consecutive assignment days (only for operational types)
                if (operationalTypes.has(current.type)) {
                    const currDateStr = currentDate.toISOString().split('T')[0];
                    
                    if (lastAssignmentDate) {
                        const dayDiff = Math.round((currentDate - lastAssignmentDate) / (24 * 60 * 60 * 1000));
                        if (dayDiff <= 1) {
                            consecutiveAssignmentDays++;
                        } else {
                            consecutiveAssignmentDays = 1;
                        }
                    } else {
                        consecutiveAssignmentDays = 1;
                    }
                    lastAssignmentDate = currentDate;
                    
                    // Check for >6 consecutive assignment days
                    if (consecutiveAssignmentDays > 6) {
                        results.warnings.push({
                            pilotId: pilot.id,
                            pilotName: pilot.nick || pilot.name,
                            message: `[${dateStr}] Más de 6 días continuos de asignación (${consecutiveAssignmentDays} días)`,
                            assignment: current
                        });
                        results.stats.warnings++;
                    }
                }
                
                // Track consecutive days outside base
                if (current.destination && current.destination !== pilot.base) {
                    const currDateStr = currentDate.toISOString().split('T')[0];
                    
                    if (lastOutsideDate) {
                        const dayDiff = Math.round((currentDate - lastOutsideDate) / (24 * 60 * 60 * 1000));
                        if (dayDiff <= 1) {
                            consecutiveDaysOutside++;
                        } else {
                            consecutiveDaysOutside = 1;
                        }
                    } else {
                        consecutiveDaysOutside = 1;
                    }
                    lastOutsideDate = currentDate;
                    
                    // Check for >6 days outside base
                    if (consecutiveDaysOutside > 6) {
                        results.warnings.push({
                            pilotId: pilot.id,
                            pilotName: pilot.nick || pilot.name,
                            message: `[${dateStr}] Más de 6 días fuera de base (${consecutiveDaysOutside} días en ${current.destination})`,
                            assignment: current
                        });
                        results.stats.warnings++;
                    }
                } else if (current.destination === pilot.base) {
                    // Reset when back at base
                    consecutiveDaysOutside = 0;
                    lastOutsideDate = null;
                }
                
                // Find previous OPERATIONAL assignment for rest validation
                let prevOperational = null;
                for (let j = i - 1; j >= 0; j--) {
                    if (operationalTypes.has(sorted[j].type)) {
                        prevOperational = sorted[j];
                        break;
                    }
                }
                
                // Only check rest if there's a previous operational assignment
                if (prevOperational) {
                    const prevEndDate = new Date(prevOperational.endTime);
                    const prevDateStr = `${prevEndDate.getDate()}/${month}`;
                    
                    const restRequired = prevOperational.destination === pilot.base ? 
                        (prevOperational.restBase || 10) : (prevOperational.restAway || 12);
                    const actualRest = Utils.hoursBetween(prevOperational.endTime, current.startTime);
                    
                    if (actualRest < restRequired) {
                        results.errors.push({
                            pilotId: pilot.id,
                            pilotName: pilot.nick || pilot.name,
                            message: `[${dateStr}] Descanso insuficiente: ${Utils.formatHours(actualRest)} < ${restRequired}h (desde ${prevDateStr})`,
                            assignment: current
                        });
                        results.stats.errors++;
                        continue;
                    }
                    
                    // Check 1:30 AM rule
                    if (!Utils.isSameDay(prevEndDate, currentDate)) {
                        const startHour = currentDate.getHours() + currentDate.getMinutes() / 60;
                        if (startHour > 0 && startHour < CONFIG.NEXT_DAY_START_HOUR) {
                            results.errors.push({
                                pilotId: pilot.id,
                                pilotName: pilot.nick || pilot.name,
                                message: `[${dateStr}] Inicio antes de 01:30: ${Utils.formatDate(currentDate, 'time')}`,
                                assignment: current
                            });
                            results.stats.errors++;
                            continue;
                        }
                    }
                    
                    // Geographic continuity - WARNING only (not blocking)
                    // Skip if current is DH or no origin
                    if (current.type !== 'DH' && current.origin) {
                        // Find most recent DH between prevOperational and current
                        let lastDHDestination = null;
                        let hadDaysOff = false;
                        
                        for (let k = i - 1; k >= 0; k--) {
                            const check = sorted[k];
                            if (nonOperationalTypes.has(check.type)) {
                                hadDaysOff = true;
                            }
                            if (check.type === 'DH' && !lastDHDestination) {
                                lastDHDestination = check.destination;
                            }
                            if (check === prevOperational) break;
                        }
                        
                        // Determine expected location
                        let expectedLocation;
                        if (hadDaysOff) {
                            expectedLocation = lastDHDestination || pilot.base;
                        } else {
                            expectedLocation = lastDHDestination || prevOperational.destination;
                        }
                        
                        // If mismatch, show WARNING (not error)
                        if (current.origin !== expectedLocation) {
                            results.warnings.push({
                                pilotId: pilot.id,
                                pilotName: pilot.nick || pilot.name,
                                message: `[${dateStr}] Continuidad: piloto en ${expectedLocation}, vuelo desde ${current.origin}`,
                                assignment: current
                            });
                            results.stats.warnings++;
                        }
                    }
                }
                
                results.stats.valid++;
            }
        });
        
        return results;
    }
};

// ============================================
// STATE MANAGER
// ============================================
const StateManager = {
    getSavedStates() {
        try {
            const stored = localStorage.getItem(CONFIG.STORAGE_KEY);
            return stored ? JSON.parse(stored) : [];
        } catch (e) { return []; }
    },
    
    saveState(name) {
        const states = this.getSavedStates();
        
        const assignmentsObj = {};
        AppState.assignments.forEach((value, key) => {
            assignmentsObj[key] = value.map(a => ({
                ...a,
                startTime: a.startTime ? new Date(a.startTime).toISOString() : null,
                endTime: a.endTime ? new Date(a.endTime).toISOString() : null
            }));
        });
        
        const state = {
            itinerary: AppState.itinerary,
            pilots: AppState.pilots.map(p => ({
                ...p,
                freeDays: [...p.freeDays],
                absences: [...p.absences],
                training: [...p.training]
            })),
            rotations: AppState.rotations.map(r => ({
                ...r,
                startTime: r.startTime?.toISOString(),
                endTime: r.endTime?.toISOString()
            })),
            slots: AppState.slots.map(s => ({
                id: s.id,
                rotationId: s.rotationId,
                role: s.role,
                pilotId: s.pilotId,
                pilotName: s.pilotName
            })),
            assignments: assignmentsObj,
            currentPeriod: AppState.currentPeriod
        };
        
        const newState = {
            id: Utils.generateId('state-'),
            name: name || `${Utils.getMonthName(AppState.currentPeriod.month)} ${AppState.currentPeriod.year}`,
            date: new Date().toISOString(),
            data: state
        };
        
        const existingIdx = states.findIndex(s => s.name === newState.name);
        if (existingIdx > -1) states.splice(existingIdx, 1);
        
        states.unshift(newState);
        while (states.length > 20) states.pop();
        
        localStorage.setItem(CONFIG.STORAGE_KEY, JSON.stringify(states));
        return newState;
    },
    
    loadState(stateId) {
        const states = this.getSavedStates();
        const state = states.find(s => s.id === stateId);
        if (!state) return false;
        
        const data = state.data;
        
        AppState.itinerary = data.itinerary || [];
        AppState.pilots = (data.pilots || []).map(p => ({
            ...p,
            freeDays: new Set(p.freeDays || []),
            absences: new Set(p.absences || []),
            training: new Set(p.training || []),
            ftByMonth: {},
            ftByFortnight: {}
        }));
        
        AppState.rotations = (data.rotations || []).map(r => ({
            ...r,
            startTime: r.startTime ? new Date(r.startTime) : null,
            endTime: r.endTime ? new Date(r.endTime) : null
        }));
        
        // Rebuild slots with rotation references
        AppState.slots = (data.slots || []).map(s => {
            const rotation = AppState.rotations.find(r => r.id === s.rotationId);
            return { ...s, rotation };
        });
        
        AppState.assignments.clear();
        Object.entries(data.assignments || {}).forEach(([pilotId, assignments]) => {
            AppState.assignments.set(pilotId, assignments.map(a => ({
                ...a,
                startTime: a.startTime ? new Date(a.startTime) : null,
                endTime: a.endTime ? new Date(a.endTime) : null
            })));
        });
        
        AppState.currentPeriod = data.currentPeriod || { year: 2026, month: 1 };
        
        // Recalculate pilot hours
        AppState.pilots.forEach(pilot => {
            const assignments = AppState.assignments.get(pilot.id) || [];
            assignments.forEach(a => {
                if (a.type === 'ROT' && a.ftHours) {
                    const start = new Date(a.startTime);
                    const monthKey = `${start.getFullYear()}-${start.getMonth()}`;
                    const fortnightKey = `${start.getFullYear()}-${start.getMonth()}-${start.getDate() <= 15 ? 1 : 2}`;
                    pilot.ftByMonth[monthKey] = (pilot.ftByMonth[monthKey] || 0) + a.ftHours;
                    pilot.ftByFortnight[fortnightKey] = (pilot.ftByFortnight[fortnightKey] || 0) + a.ftHours;
                }
            });
        });
        
        return true;
    },
    
    deleteState(stateId) {
        const states = this.getSavedStates();
        const idx = states.findIndex(s => s.id === stateId);
        if (idx > -1) {
            states.splice(idx, 1);
            localStorage.setItem(CONFIG.STORAGE_KEY, JSON.stringify(states));
            return true;
        }
        return false;
    },
    
    exportToFile() {
        const assignmentsObj = {};
        AppState.assignments.forEach((value, key) => {
            assignmentsObj[key] = value.map(a => ({
                ...a,
                startTime: a.startTime instanceof Date ? a.startTime.toISOString() : a.startTime,
                endTime: a.endTime instanceof Date ? a.endTime.toISOString() : a.endTime
            }));
        });
        
        // Include loaded months data
        const loadedMonthsObj = {};
        AppState.loadedMonths.forEach((data, key) => {
            const monthAssignments = {};
            data.assignments.forEach((value, pilotId) => {
                monthAssignments[pilotId] = value.map(a => ({
                    ...a,
                    startTime: a.startTime instanceof Date ? a.startTime.toISOString() : a.startTime,
                    endTime: a.endTime instanceof Date ? a.endTime.toISOString() : a.endTime
                }));
            });
            
            loadedMonthsObj[key] = {
                flights: data.flights,
                pilots: data.pilots.map(p => ({
                    ...p,
                    freeDays: [...(p.freeDays || [])],
                    absences: [...(p.absences || [])],
                    training: [...(p.training || [])]
                })),
                rotations: data.rotations.map(r => ({
                    ...r,
                    startTime: r.startTime instanceof Date ? r.startTime.toISOString() : r.startTime,
                    endTime: r.endTime instanceof Date ? r.endTime.toISOString() : r.endTime
                })),
                slots: data.slots.map(s => ({ id: s.id, rotationId: s.rotationId, role: s.role, pilotId: s.pilotId, pilotName: s.pilotName })),
                assignments: monthAssignments
            };
        });
        
        const state = {
            version: '2.0',
            system: 'FlexCrewRoster',
            exportDate: new Date().toISOString(),
            itinerary: AppState.itinerary,
            pilots: AppState.pilots.map(p => ({
                ...p,
                freeDays: [...(p.freeDays || [])],
                absences: [...(p.absences || [])],
                training: [...(p.training || [])]
            })),
            rotations: AppState.rotations.map(r => ({
                ...r,
                startTime: r.startTime instanceof Date ? r.startTime.toISOString() : r.startTime,
                endTime: r.endTime instanceof Date ? r.endTime.toISOString() : r.endTime
            })),
            slots: AppState.slots.map(s => ({ id: s.id, rotationId: s.rotationId, role: s.role, pilotId: s.pilotId, pilotName: s.pilotName })),
            assignments: assignmentsObj,
            currentPeriod: AppState.currentPeriod,
            activeMonth: AppState.activeMonth,
            loadedMonths: loadedMonthsObj,
            holidays: Object.fromEntries(AppState.holidays)
        };
        
        const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const filename = `FlexCrewRoster_Data_${new Date().toISOString().split('T')[0]}.json`;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
        
        Toast.show('success', 'Exportado', `Datos guardados en ${filename}`);
        Logger.log('export', 'Datos exportados para SharePoint', filename);
    },
    
    importFromFile(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const data = JSON.parse(e.target.result);
                    
                    // Load main state
                    AppState.itinerary = data.itinerary || [];
                    AppState.pilots = (data.pilots || []).map(p => ({
                        ...p,
                        freeDays: new Set(p.freeDays || []),
                        absences: new Set(p.absences || []),
                        training: new Set(p.training || []),
                        ftByMonth: p.ftByMonth || {},
                        ftByFortnight: p.ftByFortnight || {}
                    }));
                    
                    AppState.rotations = (data.rotations || []).map(r => ({
                        ...r,
                        startTime: r.startTime ? new Date(r.startTime) : null,
                        endTime: r.endTime ? new Date(r.endTime) : null
                    }));
                    
                    // Rebuild slots with rotation references
                    AppState.slots = (data.slots || []).map(s => {
                        const rotation = AppState.rotations.find(r => r.id === s.rotationId);
                        return { ...s, rotation };
                    });
                    
                    // Load assignments
                    AppState.assignments.clear();
                    Object.entries(data.assignments || {}).forEach(([pilotId, assignments]) => {
                        AppState.assignments.set(pilotId, assignments.map(a => ({
                            ...a,
                            startTime: a.startTime ? new Date(a.startTime) : null,
                            endTime: a.endTime ? new Date(a.endTime) : null
                        })));
                    });
                    
                    AppState.currentPeriod = data.currentPeriod || { year: 2026, month: 1 };
                    AppState.activeMonth = data.activeMonth || null;
                    
                    // Load months data
                    AppState.loadedMonths.clear();
                    if (data.loadedMonths) {
                        Object.entries(data.loadedMonths).forEach(([key, monthData]) => {
                            const assignments = new Map();
                            Object.entries(monthData.assignments || {}).forEach(([pilotId, ass]) => {
                                assignments.set(pilotId, ass.map(a => ({
                                    ...a,
                                    startTime: a.startTime ? new Date(a.startTime) : null,
                                    endTime: a.endTime ? new Date(a.endTime) : null
                                })));
                            });
                            
                            const rotations = (monthData.rotations || []).map(r => ({
                                ...r,
                                startTime: r.startTime ? new Date(r.startTime) : null,
                                endTime: r.endTime ? new Date(r.endTime) : null
                            }));
                            
                            const slots = (monthData.slots || []).map(s => {
                                const rotation = rotations.find(r => r.id === s.rotationId);
                                return { ...s, rotation };
                            });
                            
                            AppState.loadedMonths.set(key, {
                                flights: monthData.flights || [],
                                pilots: (monthData.pilots || []).map(p => ({
                                    ...p,
                                    freeDays: new Set(p.freeDays || []),
                                    absences: new Set(p.absences || []),
                                    training: new Set(p.training || []),
                                    ftByMonth: p.ftByMonth || {},
                                    ftByFortnight: p.ftByFortnight || {}
                                })),
                                rotations,
                                slots,
                                assignments
                            });
                        });
                    }
                    
                    // Load holidays
                    if (data.holidays) {
                        AppState.holidays = new Map(Object.entries(data.holidays));
                    }
                    
                    // Recalculate pilot hours
                    AppState.pilots.forEach(pilot => {
                        const assignments = AppState.assignments.get(pilot.id) || [];
                        pilot.ftByMonth = {};
                        pilot.ftByFortnight = {};
                        assignments.forEach(a => {
                            if (a.type === 'ROT' && a.ftHours) {
                                const start = new Date(a.startTime);
                                const monthKey = `${start.getFullYear()}-${start.getMonth()}`;
                                const fortnightKey = `${start.getFullYear()}-${start.getMonth()}-${start.getDate() <= 15 ? 1 : 2}`;
                                pilot.ftByMonth[monthKey] = (pilot.ftByMonth[monthKey] || 0) + a.ftHours;
                                pilot.ftByFortnight[fortnightKey] = (pilot.ftByFortnight[fortnightKey] || 0) + a.ftHours;
                            }
                        });
                    });
                    
                    Toast.show('success', 'Importado', 'Datos cargados correctamente');
                    Logger.log('import', 'Datos importados desde archivo', file.name);
                    resolve(true);
                } catch (err) {
                    Toast.show('error', 'Error', 'Error al leer el archivo');
                    reject(err);
                }
            };
            reader.onerror = () => reject(new Error('Error reading file'));
            reader.readAsText(file);
        });
    }
};

// ============================================
// EXPORT MANAGER
// ============================================
const ExportManager = {
    exportSchedule() {
        const wb = XLSX.utils.book_new();
        
        const slotsData = AppState.slots.map(s => ({
            'Rotación': s.rotation?.id,
            'Slot': s.id,
            'Rol': s.role,
            'Ruta': s.rotation?.route,
            'Inicio': Utils.formatDate(s.rotation?.startTime, 'full'),
            'Fin': Utils.formatDate(s.rotation?.endTime, 'full'),
            'FT': s.rotation?.ftTotal,
            'Piloto ID': s.pilotId || '',
            'Piloto': s.pilotName || '',
            'Estado': s.pilotId ? 'Asignado' : 'Sin asignar'
        }));
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(slotsData), 'Rotaciones');
        
        const { year, month } = AppState.currentPeriod;
        const pilotsData = AppState.pilots.map(p => {
            const monthKey = `${year}-${month - 1}`;
            const q1Key = `${year}-${month - 1}-1`;
            const q2Key = `${year}-${month - 1}-2`;
            const assignments = AppState.assignments.get(p.id) || [];
            
            return {
                'ID': p.id,
                'Nombre': p.name,
                'Base': p.base,
                'Rol': p.role,
                'Horas Mes': Math.round((p.ftByMonth[monthKey] || 0) * 10) / 10,
                'Horas Q1': Math.round((p.ftByFortnight[q1Key] || 0) * 10) / 10,
                'Horas Q2': Math.round((p.ftByFortnight[q2Key] || 0) * 10) / 10,
                'Rotaciones': assignments.filter(a => a.type === 'ROT').length,
                'DH': assignments.filter(a => a.type === 'DH').length
            };
        });
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(pilotsData), 'Pilotos');
        
        XLSX.writeFile(wb, `Schedule_${year}_${String(month).padStart(2, '0')}.xlsx`);
    },
    
    exportPilotRoster(pilotId) {
        const pilot = AppState.pilots.find(p => p.id === pilotId);
        if (!pilot) return;
        
        const assignments = AppState.assignments.get(pilotId) || [];
        const { year, month } = AppState.currentPeriod;
        const daysInMonth = Utils.getDaysInMonth(year, month);
        const monthNames = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
        const dayNames = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
        
        // Calculate totals
        let totalST = 0;
        let totalFT = 0;
        let totalDH = 0;
        let freeDays = 0;
        let rotationCount = 0;
        let dhCount = 0;
        
        assignments.forEach(a => {
            if (a.type === 'ROT') {
                totalST += a.stHours || 0;
                totalFT += a.ftHours || 0;
                rotationCount++;
            } else if (a.type === 'DH') {
                totalDH += a.dutyHours || a.stHours || 0;
                dhCount++;
            }
            if (a.type === 'FREE' || a.type === 'OFF' || a.type === 'L') freeDays++;
        });
        
        const rosterData = [];
        
        // Header - Pilot Info
        rosterData.push({ 'A': 'FLEX CREW - PROGRAMACIÓN MENSUAL' });
        rosterData.push({});
        rosterData.push({ 'A': 'PILOTO', 'B': pilot.name });
        rosterData.push({ 'A': 'ID', 'B': pilot.id, 'C': 'BASE', 'D': pilot.base, 'E': 'RANGO', 'F': pilot.role });
        rosterData.push({ 'A': 'PERIODO', 'B': `${monthNames[month - 1]} ${year}` });
        rosterData.push({});
        
        // Totals Summary - Like the pilot modal
        rosterData.push({ 'A': '═════════════════ RESUMEN ═════════════════' });
        rosterData.push({ 'A': 'Flight Time (FT)', 'B': `${totalFT.toFixed(2)} hrs`, 'C': 'Rotaciones', 'D': rotationCount });
        rosterData.push({ 'A': 'Service Time (ST)', 'B': `${totalST.toFixed(2)} hrs`, 'C': 'Dead Heads', 'D': dhCount });
        rosterData.push({ 'A': 'DH Time', 'B': `${totalDH.toFixed(2)} hrs`, 'C': 'Días Libres', 'D': freeDays });
        rosterData.push({});
        
        // Qualifications
        rosterData.push({ 'A': 'HABILITACIONES', 'B': pilot.qualifiedTails?.join(', ') || 'N/A' });
        rosterData.push({});
        
        // Assignments table
        rosterData.push({ 'A': '═════════════════ ASIGNACIONES ═════════════════' });
        rosterData.push({
            'A': 'Fecha',
            'B': 'Tipo',
            'C': 'Ruta',
            'D': 'Equipo',
            'E': 'Salida',
            'F': 'Llegada',
            'G': 'FT',
            'H': 'ST/Duty'
        });
        
        // Sort assignments by date
        const sortedAssignments = [...assignments].sort((a, b) => new Date(a.startTime) - new Date(b.startTime));
        
        sortedAssignments.forEach(a => {
            const start = new Date(a.startTime);
            const end = new Date(a.endTime);
            const dayName = dayNames[start.getDay()];
            const dateStr = `${dayName} ${start.getDate()}/${month}`;
            
            let tipo = a.type;
            let ruta = '';
            let equipo = '';
            let salida = '';
            let llegada = '';
            let ft = '';
            let st = '';
            
            if (a.type === 'ROT') {
                tipo = a.role || 'ROT';
                ruta = a.route || `${a.origin}-${a.destination}`;
                equipo = a.tail || '';
                salida = Utils.formatDate(start, 'time', false);
                llegada = Utils.formatDate(end, 'time', false);
                ft = (a.ftHours || 0).toFixed(2);
                st = (a.stHours || 0).toFixed(2);
            } else if (a.type === 'DH') {
                tipo = 'DH';
                ruta = `${a.origin}→${a.destination}`;
                salida = Utils.formatDate(start, 'time', false);
                llegada = Utils.formatDate(end, 'time', false);
                ft = (a.ftHours || 0).toFixed(2);
                st = (a.dutyHours || a.stHours || 0).toFixed(2);
            } else if (a.type === 'FREE' || a.type === 'OFF' || a.type === 'L') {
                tipo = 'LIBRE';
                ruta = a.type;
            } else if (a.type === 'VAC') {
                tipo = 'VAC';
                ruta = 'Vacaciones';
            } else if (a.type === 'TRN') {
                tipo = 'ENTRENO';
                ruta = 'Entrenamiento';
                st = '7.00';
            }
            
            rosterData.push({
                'A': dateStr,
                'B': tipo,
                'C': ruta,
                'D': equipo,
                'E': salida,
                'F': llegada,
                'G': ft,
                'H': st
            });
        });
        
        // Empty days
        rosterData.push({});
        rosterData.push({ 'A': '─────────────────────────────────────────────────' });
        rosterData.push({ 'A': 'TOTALES', 'G': totalFT.toFixed(2), 'H': totalST.toFixed(2) });
        
        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.json_to_sheet(rosterData, { skipHeader: true });
        
        // Set column widths
        ws['!cols'] = [
            { wch: 12 }, // Fecha
            { wch: 8 },  // Tipo
            { wch: 20 }, // Ruta
            { wch: 10 }, // Equipo
            { wch: 8 },  // Salida
            { wch: 8 },  // Llegada
            { wch: 8 },  // FT
            { wch: 8 }   // ST
        ];
        
        XLSX.utils.book_append_sheet(wb, ws, 'Roster');
        XLSX.writeFile(wb, `FlexCrew_${pilot.nick || pilot.id}_${monthNames[month-1]}_${year}.xlsx`);
    },
    
    // Export ALL pilot rosters in one file
    exportAllRosters() {
        const wb = XLSX.utils.book_new();
        const { year, month } = AppState.currentPeriod;
        const daysInMonth = Utils.getDaysInMonth(year, month);
        const monthNames = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
        const dayNames = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
        
        AppState.pilots.forEach(pilot => {
            const assignments = AppState.assignments.get(pilot.id) || [];
            
            // Calculate totals
            let totalST = 0;
            let totalFT = 0;
            let totalDH = 0;
            let freeDays = 0;
            
            assignments.forEach(a => {
                if (a.type === 'ROT') {
                    totalST += a.stHours || 0;
                    totalFT += a.ftHours || 0;
                } else if (a.type === 'DH') {
                    totalDH += a.dutyHours || a.stHours || 0;
                }
                if (a.type === 'FREE' || a.type === 'OFF' || a.type === 'L') freeDays++;
            });
            
            const rosterData = [];
            
            // Header - Same format as individual export
            rosterData.push({ 'A': pilot.name, 'B': pilot.id, 'C': pilot.base, 'D': pilot.role });
            rosterData.push({ 'A': 'FT', 'B': totalFT.toFixed(2), 'C': 'ST', 'D': totalST.toFixed(2), 'E': 'DH', 'F': totalDH.toFixed(2), 'G': 'Libres', 'H': freeDays });
            rosterData.push({});
            rosterData.push({ 'A': 'Fecha', 'B': 'Tipo', 'C': 'Ruta', 'D': 'Equipo', 'E': 'Salida', 'F': 'Llegada', 'G': 'FT', 'H': 'ST' });
            
            const sortedAssignments = [...assignments].sort((a, b) => new Date(a.startTime) - new Date(b.startTime));
            
            sortedAssignments.forEach(a => {
                const start = new Date(a.startTime);
                const dayName = dayNames[start.getDay()];
                const dateStr = `${dayName} ${start.getDate()}/${month}`;
                
                let tipo = a.type;
                let ruta = '';
                let equipo = '';
                let salida = '';
                let llegada = '';
                let ft = '';
                let st = '';
                
                if (a.type === 'ROT') {
                    tipo = a.role || 'ROT';
                    ruta = a.route || '';
                    equipo = a.tail || '';
                    salida = Utils.formatDate(start, 'time', false);
                    llegada = Utils.formatDate(new Date(a.endTime), 'time', false);
                    ft = (a.ftHours || 0).toFixed(2);
                    st = (a.stHours || 0).toFixed(2);
                } else if (a.type === 'DH') {
                    tipo = 'DH';
                    ruta = `${a.origin}→${a.destination}`;
                    salida = Utils.formatDate(start, 'time', false);
                    llegada = Utils.formatDate(new Date(a.endTime), 'time', false);
                    ft = (a.ftHours || 0).toFixed(2);
                    st = (a.dutyHours || 0).toFixed(2);
                } else if (a.type === 'FREE' || a.type === 'OFF') {
                    tipo = 'LIBRE';
                } else {
                    tipo = a.type;
                }
                
                rosterData.push({
                    'A': dateStr, 'B': tipo, 'C': ruta, 'D': equipo, 
                    'E': salida, 'F': llegada, 'G': ft, 'H': st
                });
            });
            
            const ws = XLSX.utils.json_to_sheet(rosterData, { skipHeader: true });
            ws['!cols'] = [
                { wch: 10 }, { wch: 8 }, { wch: 18 }, { wch: 10 },
                { wch: 7 }, { wch: 7 }, { wch: 7 }, { wch: 7 }
            ];
            
            const sheetName = (pilot.nick || pilot.id).substring(0, 31);
            XLSX.utils.book_append_sheet(wb, ws, sheetName);
        });
        
        XLSX.writeFile(wb, `FlexCrew_AllRosters_${year}_${String(month).padStart(2, '0')}.xlsx`);
    }
};

// ============================================
// UI CONTROLLER
// ============================================
const UIController = {
    fontScale: 1.0,
    
    init() {
        this.bindNavigation();
        this.bindFileUploads();
        this.bindFilters();
        this.bindPeriodControls();
        this.bindZoomControls();
        this.bindFontControls();
        this.bindModals();
        this.bindDragAndDrop();
        this.bindActions();
        this.bindConfig();
        this.loadSavedStates();
        this.renderBasesList();
        this.updateView('upload');
    },
    
    bindNavigation() {
        document.querySelectorAll('.nav-item[data-view]').forEach(btn => {
            btn.addEventListener('click', () => this.updateView(btn.dataset.view));
        });
        
        // Sidebar toggle
        document.getElementById('sidebarToggle')?.addEventListener('click', () => {
            document.body.classList.toggle('sidebar-collapsed');
            document.querySelector('.sidebar')?.classList.toggle('collapsed');
        });
    },
    
    bindFileUploads() {
        // Theme toggle
        document.getElementById('themeToggle')?.addEventListener('click', () => {
            document.body.classList.toggle('light-theme');
            localStorage.setItem('flexcrew-theme', document.body.classList.contains('light-theme') ? 'light' : 'dark');
        });
        
        // Load saved theme
        if (localStorage.getItem('flexcrew-theme') === 'light') {
            document.body.classList.add('light-theme');
        }
        
        // ========== MONTH MANAGEMENT ==========
        document.getElementById('addMonthTabBtn')?.addEventListener('click', () => this.showAddMonthModal());
        document.getElementById('deleteMonthBtn')?.addEventListener('click', () => this.deleteCurrentMonth());
        document.getElementById('exportMonthTrackingBtn')?.addEventListener('click', () => this.exportMonthForTracking());
        document.getElementById('exportMonthBtn')?.addEventListener('click', () => ExportManager.exportAllRosters());
        
        // ========== SHAREPOINT / FILE SHARING ==========
        document.getElementById('exportSharePointBtn')?.addEventListener('click', () => StateManager.exportToFile());
        document.getElementById('importSharePointFile')?.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (!file) return;
            try {
                await StateManager.importFromFile(file);
                this.renderMonthTabs();
                if (AppState.activeMonth) {
                    this.switchToMonth(AppState.activeMonth);
                }
                this.updatePeriodLabel();
                this.renderCurrentView();
                document.getElementById('pilotCount').textContent = AppState.pilots.length;
                document.getElementById('rotationCount').textContent = AppState.rotations.length;
            } catch (err) {
                console.error('Import error:', err);
            }
            e.target.value = '';
        });
        
        // ========== BULK ROTATION SELECTION ==========
        document.getElementById('selectAllRotationsBtn')?.addEventListener('click', () => this.toggleSelectAllRotations());
        document.getElementById('bulkUnassignBtn')?.addEventListener('click', () => this.bulkUnassignRotations());
        document.getElementById('bulkDeleteBtn')?.addEventListener('click', () => this.bulkDeleteRotations());
        document.getElementById('clearSelectionBtn')?.addEventListener('click', () => this.clearRotationSelection());
        
        document.getElementById('itineraryFile').addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (!file) return;
            try {
                const result = await DataLoader.loadItinerary(file);
                const flights = result.flights;
                const period = result.period;
                
                document.getElementById('itineraryUpload').classList.add('loaded');
                document.getElementById('itineraryStatus').textContent = `✓ ${flights.length} vuelos`;
                document.getElementById('itineraryStatus').className = 'upload-status success';
                
                // Update month stats if active
                if (AppState.activeMonth) {
                    this.updateMonthStats();
                    this.checkReadyToGenerate();
                } else {
                    document.getElementById('flightCountInfo')?.textContent && (document.getElementById('flightCountInfo').textContent = `${flights.length} vuelos`);
                    this.checkReadyToProcess();
                }
            } catch (error) {
                document.getElementById('itineraryStatus').textContent = `✗ Error`;
                document.getElementById('itineraryStatus').className = 'upload-status error';
            }
        });
        
        document.getElementById('pilotsFile').addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (!file) return;
            try {
                const result = await DataLoader.loadPilots(file);
                const pilots = result.pilots;
                const period = result.month;
                
                document.getElementById('pilotsUpload').classList.add('loaded');
                document.getElementById('pilotsStatus').textContent = `✓ ${pilots.length} pilotos`;
                document.getElementById('pilotsStatus').className = 'upload-status success';
                document.getElementById('pilotCount').textContent = pilots.length;
                
                // Show period badge
                if (period) {
                    const [year, month] = period.split('-');
                    const monthNames = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
                    document.getElementById('pilotsPeriod').textContent = `📅 ${monthNames[parseInt(month) - 1]} ${year}`;
                    document.getElementById('pilotsPeriod').classList.add('visible');
                    AppState.pilotsPeriod = period;
                }
                
                this.updateBaseFilters();
                this.updatePilotDBSelector();
                this.checkReadyToProcess();
                this.checkPeriodMatch();
            } catch (error) {
                document.getElementById('pilotsStatus').textContent = `✗ Error`;
                document.getElementById('pilotsStatus').className = 'upload-status error';
            }
        });
        
        document.getElementById('generateRotationsBtn').addEventListener('click', () => this.generateRotations());
    },
    
    checkPeriodMatch() {
        // Simplified - no warning needed with new month system
    },
    
    checkReadyToProcess() {
        const ready = AppState.itinerary.length > 0 && AppState.pilots.length > 0;
        const processSection = document.getElementById('processSection');
        const generateSection = document.getElementById('generateSection');
        if (processSection) processSection.style.display = ready ? 'block' : 'none';
        if (generateSection) generateSection.style.display = ready ? 'flex' : 'none';
    },
    
    // ========== MONTH MANAGEMENT FUNCTIONS ==========
    showAddMonthModal() {
        const now = new Date();
        const nextMonth = now.getMonth() + 2;
        const year = nextMonth > 12 ? now.getFullYear() + 1 : now.getFullYear();
        const month = nextMonth > 12 ? 1 : nextMonth;
        const defaultMonth = `${year}-${String(month).padStart(2, '0')}`;
        
        const monthKey = prompt('Ingresa el mes a agregar (formato: YYYY-MM)', defaultMonth);
        if (!monthKey) return;
        
        // Validate format
        if (!/^\d{4}-\d{2}$/.test(monthKey)) {
            Toast.show('error', 'Error', 'Formato inválido. Usa YYYY-MM (ej: 2026-01)');
            return;
        }
        
        if (AppState.loadedMonths.has(monthKey)) {
            Toast.show('warning', 'Ya existe', 'Este mes ya está cargado');
            this.switchToMonth(monthKey);
            return;
        }
        
        // Create new month
        AppState.loadedMonths.set(monthKey, {
            flights: [],
            pilots: [],
            rotations: [],
            slots: [],
            assignments: new Map()
        });
        
        this.renderMonthTabs();
        this.switchToMonth(monthKey);
        Toast.show('success', 'Mes agregado', `${this.formatMonthKey(monthKey)} agregado correctamente`);
        Logger.log('month', `Mes agregado: ${monthKey}`);
    },
    
    formatMonthKey(key) {
        const [year, month] = key.split('-');
        const monthNames = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
        return `${monthNames[parseInt(month) - 1]} ${year}`;
    },
    
    renderMonthTabs() {
        const container = document.getElementById('monthTabs');
        if (!container) return;
        
        if (AppState.loadedMonths.size === 0) {
            container.innerHTML = '';
            document.getElementById('monthPanelEmpty').style.display = 'flex';
            document.getElementById('monthPanelContent').style.display = 'none';
            return;
        }
        
        let html = '';
        AppState.loadedMonths.forEach((data, key) => {
            const isActive = key === AppState.activeMonth;
            const hasData = data.flights.length > 0 || data.pilots.length > 0;
            const hasRotations = data.rotations.length > 0;
            const statusClass = hasRotations ? 'complete' : hasData ? 'partial' : '';
            
            html += `
                <div class="month-tab ${isActive ? 'active' : ''}" data-month="${key}">
                    <span class="tab-status ${statusClass}"></span>
                    <span class="tab-name">${this.formatMonthKey(key)}</span>
                </div>
            `;
        });
        
        container.innerHTML = html;
        
        // Bind tab clicks
        container.querySelectorAll('.month-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                const month = tab.dataset.month;
                this.switchToMonth(month);
            });
        });
    },
    
    switchToMonth(monthKey) {
        if (!AppState.loadedMonths.has(monthKey)) return;
        
        // Save current month data
        if (AppState.activeMonth && AppState.loadedMonths.has(AppState.activeMonth)) {
            const current = AppState.loadedMonths.get(AppState.activeMonth);
            current.flights = [...AppState.itinerary];
            current.pilots = [...AppState.pilots];
            current.rotations = [...AppState.rotations];
            current.slots = [...AppState.slots];
            current.assignments = new Map(AppState.assignments);
        }
        
        // Load new month data
        AppState.activeMonth = monthKey;
        const data = AppState.loadedMonths.get(monthKey);
        AppState.itinerary = data.flights;
        AppState.pilots = data.pilots;
        AppState.rotations = data.rotations;
        AppState.slots = data.slots;
        AppState.assignments = data.assignments;
        
        // Update period
        const [year, month] = monthKey.split('-');
        AppState.currentPeriod = { year: parseInt(year), month: parseInt(month) };
        
        // Update UI
        this.renderMonthTabs();
        this.showMonthPanel();
        this.updateMonthStats();
        this.updatePeriodLabel();
        this.checkReadyToProcess();
        
        // Reset upload cards
        document.getElementById('itineraryUpload')?.classList.remove('loaded');
        document.getElementById('pilotsUpload')?.classList.remove('loaded');
        const itinStatus = document.getElementById('itineraryStatus');
        const pilotStatus = document.getElementById('pilotsStatus');
        if (itinStatus) itinStatus.textContent = data.flights.length > 0 ? `✓ ${data.flights.length} vuelos` : '';
        if (pilotStatus) pilotStatus.textContent = data.pilots.length > 0 ? `✓ ${data.pilots.length} pilotos` : '';
        if (data.flights.length > 0) document.getElementById('itineraryUpload')?.classList.add('loaded');
        if (data.pilots.length > 0) document.getElementById('pilotsUpload')?.classList.add('loaded');
        
        // Update counts
        document.getElementById('pilotCount').textContent = data.pilots.length;
        document.getElementById('rotationCount').textContent = data.rotations.length;
    },
    
    showMonthPanel() {
        const empty = document.getElementById('monthPanelEmpty');
        const content = document.getElementById('monthPanelContent');
        const title = document.getElementById('currentMonthTitle');
        
        if (empty) empty.style.display = 'none';
        if (content) content.style.display = 'block';
        if (title) title.textContent = this.formatMonthKey(AppState.activeMonth);
    },
    
    updateMonthStats() {
        const monthFlights = document.getElementById('monthFlights');
        const monthPilots = document.getElementById('monthPilots');
        const monthRotations = document.getElementById('monthRotations');
        const monthSlots = document.getElementById('monthSlots');
        const monthAssigned = document.getElementById('monthAssigned');
        
        if (monthFlights) monthFlights.textContent = AppState.itinerary.length;
        if (monthPilots) monthPilots.textContent = AppState.pilots.length;
        if (monthRotations) monthRotations.textContent = AppState.rotations.length;
        if (monthSlots) monthSlots.textContent = AppState.slots.length;
        
        // Calculate assigned percentage
        const totalSlots = AppState.slots.length;
        const assignedSlots = AppState.slots.filter(s => s.assignedPilot || s.pilotId).length;
        const pct = totalSlots > 0 ? Math.round((assignedSlots / totalSlots) * 100) : 0;
        if (monthAssigned) monthAssigned.textContent = `${pct}%`;
    },
    
    checkReadyToGenerate() {
        this.checkReadyToProcess();
    },
    
    deleteCurrentMonth() {
        if (!AppState.activeMonth) return;
        
        if (!confirm(`¿Eliminar ${this.formatMonthKey(AppState.activeMonth)} y todos sus datos?`)) return;
        
        AppState.loadedMonths.delete(AppState.activeMonth);
        Logger.log('month', `Mes eliminado: ${AppState.activeMonth}`);
        
        // Switch to another month or show empty
        if (AppState.loadedMonths.size > 0) {
            const nextMonth = AppState.loadedMonths.keys().next().value;
            this.switchToMonth(nextMonth);
        } else {
            AppState.activeMonth = null;
            AppState.itinerary = [];
            AppState.pilots = [];
            AppState.rotations = [];
            AppState.slots = [];
            AppState.assignments = new Map();
            this.renderMonthTabs();
        }
        
        Toast.show('success', 'Eliminado', 'Mes eliminado correctamente');
    },
    
    exportMonthForTracking() {
        if (!AppState.activeMonth && AppState.rotations.length === 0) {
            Toast.show('warning', 'Sin datos', 'No hay datos para exportar');
            return;
        }
        
        const period = AppState.activeMonth || `${AppState.currentPeriod.year}-${String(AppState.currentPeriod.month).padStart(2,'0')}`;
        
        const trackingData = {
            version: '1.0',
            system: 'FlexCrewRoster',
            exportDate: new Date().toISOString(),
            period: period,
            pilots: AppState.pilots.map(p => ({
                id: p.id,
                name: p.name,
                nick: p.nick,
                base: p.base,
                role: p.role,
                qualifiedTails: p.qualifiedTails
            })),
            assignments: []
        };
        
        // Export all assignments
        AppState.assignments.forEach((assignments, pilotId) => {
            assignments.forEach(a => {
                trackingData.assignments.push({
                    pilotId,
                    type: a.type,
                    startTime: a.startTime,
                    endTime: a.endTime,
                    origin: a.origin,
                    destination: a.destination,
                    route: a.route,
                    tail: a.tail,
                    ftHours: a.ftHours,
                    stHours: a.stHours,
                    role: a.role,
                    rotationId: a.rotationId,
                    notes: a.notes
                });
            });
        });
        
        const blob = new Blob([JSON.stringify(trackingData, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `FlexCrewRoster_Tracking_${period}.json`;
        a.click();
        URL.revokeObjectURL(url);
        
        Toast.show('success', 'Exportado', 'Archivo de tracking generado');
        Logger.log('export', `Tracking exportado: ${period}`);
    },
    
    // ========== BULK ROTATION SELECTION ==========
    toggleSelectAllRotations() {
        const cards = document.querySelectorAll('.rotation-card');
        const allSelected = AppState.selectedRotations.size === cards.length && cards.length > 0;
        
        if (allSelected) {
            this.clearRotationSelection();
        } else {
            cards.forEach(card => {
                const id = card.dataset.rotationId;
                if (id) {
                    AppState.selectedRotations.add(id);
                    card.classList.add('selected');
                    const checkbox = card.querySelector('.rotation-checkbox');
                    if (checkbox) checkbox.classList.add('checked');
                }
            });
            this.updateBulkActionsBar();
        }
    },
    
    clearRotationSelection() {
        AppState.selectedRotations.clear();
        document.querySelectorAll('.rotation-card.selected').forEach(card => {
            card.classList.remove('selected');
            const checkbox = card.querySelector('.rotation-checkbox');
            if (checkbox) checkbox.classList.remove('checked');
        });
        this.updateBulkActionsBar();
    },
    
    updateBulkActionsBar() {
        const bar = document.getElementById('bulkActionsBar');
        if (!bar) return;
        
        const count = AppState.selectedRotations.size;
        
        if (count > 0) {
            bar.style.display = 'flex';
            document.getElementById('selectedCount').textContent = count;
        } else {
            bar.style.display = 'none';
        }
    },
    
    bulkUnassignRotations() {
        if (AppState.selectedRotations.size === 0) return;
        
        let unassigned = 0;
        AppState.selectedRotations.forEach(rotId => {
            const slots = AppState.slots.filter(s => s.rotationId === rotId);
            slots.forEach(slot => {
                if (slot.assignedPilot || slot.pilotId) {
                    const pilotId = slot.assignedPilot || slot.pilotId;
                    const assignments = AppState.assignments.get(pilotId) || [];
                    const idx = assignments.findIndex(a => a.slotId === slot.id);
                    if (idx !== -1) {
                        assignments.splice(idx, 1);
                        AppState.assignments.set(pilotId, assignments);
                    }
                    slot.assignedPilot = null;
                    slot.pilotId = null;
                    slot.pilotName = null;
                    unassigned++;
                }
            });
        });
        
        this.clearRotationSelection();
        this.renderRotationsList();
        this.updateMonthStats();
        Toast.show('success', 'Desasignados', `${unassigned} slots desasignados`);
        Logger.log('bulk', `Desasignación masiva: ${unassigned} slots`);
    },
    
    bulkDeleteRotations() {
        if (AppState.selectedRotations.size === 0) return;
        
        const count = AppState.selectedRotations.size;
        if (!confirm(`¿Eliminar ${count} rotaciones seleccionadas y sus slots?`)) return;
        
        // First unassign
        this.bulkUnassignRotations();
        
        // Then delete
        const toDelete = new Set(AppState.selectedRotations);
        AppState.rotations = AppState.rotations.filter(r => !toDelete.has(r.id));
        AppState.slots = AppState.slots.filter(s => !toDelete.has(s.rotationId));
        
        this.clearRotationSelection();
        this.renderRotationsList();
        document.getElementById('rotationCount').textContent = AppState.rotations.length;
        this.updateMonthStats();
        Toast.show('success', 'Eliminados', `${count} rotaciones eliminadas`);
        Logger.log('bulk', `Eliminación masiva: ${count} rotaciones`);
    },
    
    generateRotations() {
        const btn = document.getElementById('generateRotationsBtn');
        btn.classList.add('processing');
        btn.disabled = true;
        
        setTimeout(() => {
            const rotations = RotationGenerator.generate(AppState.itinerary);
            btn.classList.remove('processing');
            btn.disabled = false;
            document.getElementById('rotationCount').textContent = rotations.length;
            document.getElementById('autoAssignBtn').disabled = false;
            document.getElementById('validateBtn').disabled = false;
            
            if (rotations.length > 0) {
                const firstDate = new Date(rotations[0].startTime);
                AppState.currentPeriod = { year: firstDate.getFullYear(), month: firstDate.getMonth() + 1 };
                this.updatePeriodLabel();
            }
            
            // Update tail filters with available aircraft
            this.updateTailFilters();
            this.updateOriginFilter();
            
            Logger.log('create', `${rotations.length} rotaciones generadas`, `Período: ${AppState.currentPeriod.month}/${AppState.currentPeriod.year}`);
            Toast.show('success', 'Rotaciones', `${rotations.length} rotaciones generadas`);
            this.updateView('rotations');
        }, 500);
    },
    
    bindActions() {
        document.getElementById('autoAssignBtn').addEventListener('click', () => {
            // Confirm before auto-assigning
            const unassignedCount = AppState.slots.filter(s => !s.pilotId).length;
            if (!confirm(`¿Ejecutar auto-asignación?\n\nEsto asignará automáticamente ${unassignedCount} slots pendientes a los pilotos disponibles según sus horas y habilitaciones.\n\n¿Desea continuar?`)) {
                return;
            }
            
            document.getElementById('autoAssignBtn').disabled = true;
            Toast.show('info', 'Procesando', 'Asignando automáticamente...');
            
            Logger.log('assign', 'Auto-asignación iniciada', `Slots pendientes: ${unassignedCount}`);
            
            setTimeout(() => {
                const results = AutoAssigner.assign('ft_then_seniority');
                document.getElementById('autoAssignBtn').disabled = false;
                document.getElementById('exportBtn').disabled = false;
                document.getElementById('exportRosterBtn').disabled = false;
                document.getElementById('exportAllRostersBtn').disabled = false;
                
                const total = results.assigned + results.unassigned;
                const pct = total > 0 ? Math.round((results.assigned / total) * 100) : 0;
                document.getElementById('assignedStat').textContent = `${pct}%`;
                document.getElementById('coverageStat').textContent = results.assigned;
                
                Logger.log('assign', 'Auto-asignación completada', `Asignados: ${results.assigned}, Pendientes: ${results.unassigned}, DH: ${results.dhUsed}`);
                Toast.show('success', 'Completado', `${results.assigned} asignados, ${results.unassigned} pendientes, ${results.dhUsed} DH`);
                
                // Force refresh all views
                this.renderUnassignedPanel();
                this.renderRotationsList();
                this.renderScheduler();
            }, 800);
        });
        
        document.getElementById('validateBtn').addEventListener('click', () => this.runValidation());
        document.getElementById('saveStateBtn').addEventListener('click', () => this.saveCurrentState());
        document.getElementById('loadStateBtn').addEventListener('click', () => document.getElementById('loadStateFile').click());
        document.getElementById('loadStateFile').addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (!file) return;
            try {
                const text = await file.text();
                const data = JSON.parse(text);
                
                AppState.pilots = data.pilots || [];
                AppState.pilots.forEach(p => {
                    p.freeDays = new Set(p.freeDays || []);
                    p.absences = new Set(p.absences || []);
                    p.training = new Set(p.training || []);
                    p.ftByMonth = p.ftByMonth || {};
                    p.ftByFortnight = p.ftByFortnight || {};
                });
                
                AppState.rotations = (data.rotations || []).map(r => ({
                    ...r,
                    startTime: r.startTime ? new Date(r.startTime) : null,
                    endTime: r.endTime ? new Date(r.endTime) : null
                }));
                
                AppState.slots = (data.slots || []).map(s => {
                    const rotation = AppState.rotations.find(r => r.id === s.rotationId);
                    return { ...s, rotation };
                });
                
                AppState.assignments.clear();
                Object.entries(data.assignments || {}).forEach(([pilotId, assignments]) => {
                    AppState.assignments.set(pilotId, assignments.map(a => ({
                        ...a,
                        startTime: a.startTime ? new Date(a.startTime) : null,
                        endTime: a.endTime ? new Date(a.endTime) : null
                    })));
                });
                
                AppState.currentPeriod = data.currentPeriod || { year: 2026, month: 1 };
                
                this.updateBaseFilters();
                this.updatePeriodLabel();
                document.getElementById('pilotCount').textContent = AppState.pilots.length;
                document.getElementById('rotationCount').textContent = AppState.rotations.length;
                document.getElementById('autoAssignBtn').disabled = false;
                document.getElementById('validateBtn').disabled = false;
                document.getElementById('exportBtn').disabled = false;
                
                Toast.show('success', 'Cargado', 'Estado cargado correctamente');
                this.renderCurrentView();
            } catch (error) {
                Toast.show('error', 'Error', 'No se pudo cargar el archivo');
            }
            e.target.value = '';
        });
        
        document.getElementById('exportBtn').addEventListener('click', () => {
            ExportManager.exportSchedule();
            Toast.show('success', 'Exportado', 'Schedule exportado');
        });
        
        document.getElementById('exportRosterBtn').addEventListener('click', () => this.showRosterModal());
        document.getElementById('exportAllRostersBtn').addEventListener('click', () => {
            ExportManager.exportAllRosters();
            Toast.show('success', 'Exportado', 'Todos los rosters exportados');
        });
        
        document.getElementById('closeValidation')?.addEventListener('click', () => this.closeAllModals());
        
        // Verify All button in scheduler toolbar
        document.getElementById('verifyAllBtn')?.addEventListener('click', () => this.runVerificationAll());
    },
    
    runVerificationAll() {
        // Run comprehensive verification for all pilots
        const allIssues = [];
        
        AppState.pilots.forEach(pilot => {
            const issues = this.getVerificationIssues(pilot);
            if (issues.length > 0) {
                allIssues.push({
                    pilot,
                    issues
                });
            }
        });
        
        // Show results in validation modal
        const totalErrors = allIssues.reduce((sum, p) => sum + p.issues.filter(i => i.type === 'error').length, 0);
        const totalWarnings = allIssues.reduce((sum, p) => sum + p.issues.filter(i => i.type === 'warning').length, 0);
        const pilotsWithIssues = allIssues.length;
        const pilotsOK = AppState.pilots.length - pilotsWithIssues;
        
        document.getElementById('validationSummary').innerHTML = `
            <div class="validation-stat success"><div class="validation-stat-value">${pilotsOK}</div><div class="validation-stat-label">Pilotos OK</div></div>
            <div class="validation-stat warning"><div class="validation-stat-value">${totalWarnings}</div><div class="validation-stat-label">Advertencias</div></div>
            <div class="validation-stat error"><div class="validation-stat-value">${totalErrors}</div><div class="validation-stat-label">Errores</div></div>
        `;
        
        let detailsHTML = '';
        
        if (allIssues.length === 0) {
            detailsHTML = '<div style="text-align:center;color:var(--success);padding:20px;">✅ Todos los pilotos verificados sin problemas</div>';
        } else {
            allIssues.forEach(({ pilot, issues }) => {
                detailsHTML += `<div class="validation-pilot-section">
                    <div class="validation-pilot-header">${pilot.nick || pilot.name} (${pilot.id}) - ${pilot.base}</div>
                    ${issues.map(i => `
                        <div class="validation-item ${i.type}">
                            <span class="validation-icon">${i.type === 'error' ? '❌' : '⚠️'}</span>
                            <span class="validation-message">${i.message}</span>
                        </div>
                    `).join('')}
                </div>`;
            });
        }
        
        document.getElementById('validationDetails').innerHTML = detailsHTML;
        document.getElementById('validationModal').classList.add('active');
    },
    
    getVerificationIssues(pilot) {
        const issues = [];
        const assignments = AppState.assignments.get(pilot.id) || [];
        const sorted = [...assignments].sort((a, b) => new Date(a.startTime) - new Date(b.startTime));
        
        const operationalTypes = new Set(['ROT', 'DH', 'TRN', 'OFI']);
        const nonOperationalTypes = new Set(['OFF', 'VAC', 'FREE', 'LUS', 'INC', 'L']);
        
        let consecutiveDays = 0;
        let lastAssignmentDate = null;
        let daysOutsideBase = 0;
        let lastOutsideDate = null;
        let currentLocation = pilot.base;
        
        sorted.forEach((a, idx) => {
            const date = new Date(a.startTime);
            const dateStr = `${date.getDate()}/${date.getMonth() + 1}`;
            
            if (nonOperationalTypes.has(a.type)) {
                consecutiveDays = 0;
                lastAssignmentDate = null;
                currentLocation = pilot.base;
                daysOutsideBase = 0;
                lastOutsideDate = null;
                return;
            }
            
            if (operationalTypes.has(a.type)) {
                if (lastAssignmentDate) {
                    const dayDiff = Math.round((date - lastAssignmentDate) / (24 * 60 * 60 * 1000));
                    consecutiveDays = dayDiff <= 1 ? consecutiveDays + 1 : 1;
                } else {
                    consecutiveDays = 1;
                }
                lastAssignmentDate = date;
                
                if (consecutiveDays > 6) {
                    issues.push({ type: 'warning', message: `[${dateStr}] ${consecutiveDays} días consecutivos de asignación (máx: 6)` });
                }
            }
            
            if (a.destination) currentLocation = a.destination;
            
            if (currentLocation !== pilot.base) {
                if (lastOutsideDate) {
                    const dayDiff = Math.round((date - lastOutsideDate) / (24 * 60 * 60 * 1000));
                    daysOutsideBase = dayDiff <= 1 ? daysOutsideBase + 1 : 1;
                } else {
                    daysOutsideBase = 1;
                }
                lastOutsideDate = date;
                
                if (daysOutsideBase > 6) {
                    issues.push({ type: 'warning', message: `[${dateStr}] ${daysOutsideBase} días fuera de base (en ${currentLocation})` });
                }
            } else {
                daysOutsideBase = 0;
                lastOutsideDate = null;
            }
            
            // Geographic continuity
            if (a.type === 'ROT' && a.origin) {
                let expectedLoc = currentLocation;
                // Check previous assignment
                if (idx > 0) {
                    for (let k = idx - 1; k >= 0; k--) {
                        if (nonOperationalTypes.has(sorted[k].type)) {
                            expectedLoc = pilot.base;
                            break;
                        }
                        if (sorted[k].destination) {
                            expectedLoc = sorted[k].destination;
                            break;
                        }
                    }
                }
                
                if (a.origin !== expectedLoc) {
                    issues.push({ type: 'warning', message: `[${dateStr}] Continuidad: esperado en ${expectedLoc}, vuelo desde ${a.origin}` });
                }
            }
            
            // Rest validation
            if (idx > 0 && operationalTypes.has(a.type)) {
                let prevOp = null;
                for (let k = idx - 1; k >= 0; k--) {
                    if (operationalTypes.has(sorted[k].type)) { prevOp = sorted[k]; break; }
                    if (nonOperationalTypes.has(sorted[k].type)) break;
                }
                
                if (prevOp) {
                    const restRequired = prevOp.destination === pilot.base ? (prevOp.restBase || 10) : (prevOp.restAway || 12);
                    const actualRest = Utils.hoursBetween(prevOp.endTime, a.startTime);
                    
                    if (actualRest < restRequired) {
                        issues.push({ type: 'error', message: `[${dateStr}] Descanso: ${actualRest.toFixed(1)}h < ${restRequired}h requeridas` });
                    }
                }
            }
        });
        
        return issues;
    },
    
    saveCurrentState() {
        const name = prompt('Nombre:', `${Utils.getMonthName(AppState.currentPeriod.month)} ${AppState.currentPeriod.year}`);
        if (name) {
            StateManager.saveState(name);
            Toast.show('success', 'Guardado', 'Estado guardado');
            this.loadSavedStates();
        }
    },
    
    loadSavedStates() {
        const states = StateManager.getSavedStates();
        const container = document.getElementById('savedStatesList');
        
        if (states.length === 0) {
            container.innerHTML = '<div style="color:var(--text-muted);font-size:11px;">No hay estados guardados</div>';
            return;
        }
        
        container.innerHTML = states.map(s => `
            <div class="saved-state-item" data-state-id="${s.id}">
                <div><div class="saved-state-name">${s.name}</div><div class="saved-state-date">${new Date(s.date).toLocaleDateString('es-ES')}</div></div>
                <button class="saved-state-delete" data-delete-id="${s.id}">&times;</button>
            </div>
        `).join('');
        
        container.querySelectorAll('.saved-state-item').forEach(item => {
            item.addEventListener('click', (e) => {
                if (e.target.classList.contains('saved-state-delete')) {
                    StateManager.deleteState(e.target.dataset.deleteId);
                    this.loadSavedStates();
                } else {
                    if (StateManager.loadState(item.dataset.stateId)) {
                        this.updateBaseFilters();
                        this.updatePeriodLabel();
                        document.getElementById('pilotCount').textContent = AppState.pilots.length;
                        document.getElementById('rotationCount').textContent = AppState.rotations.length;
                        document.getElementById('autoAssignBtn').disabled = false;
                        document.getElementById('validateBtn').disabled = false;
                        document.getElementById('exportBtn').disabled = false;
                        Toast.show('success', 'Cargado', 'Estado restaurado');
                        this.renderCurrentView();
                    }
                }
            });
        });
    },
    
    showRosterModal() {
        const select = document.getElementById('rosterPilotSelect');
        select.innerHTML = AppState.pilots.map(p => `<option value="${p.id}">${p.nick || p.name} (${p.id})</option>`).join('');
        select.onchange = () => this.updateRosterPreview(select.value);
        this.updateRosterPreview(AppState.pilots[0]?.id);
        document.getElementById('downloadRoster').onclick = () => { ExportManager.exportPilotRoster(select.value); this.closeAllModals(); };
        document.getElementById('cancelRoster').onclick = () => this.closeAllModals();
        document.getElementById('rosterModal').classList.add('active');
    },
    
    updateRosterPreview(pilotId) {
        const assignments = AppState.assignments.get(pilotId) || [];
        const { year, month } = AppState.currentPeriod;
        const daysInMonth = Utils.getDaysInMonth(year, month);
        
        let html = '';
        for (let d = 1; d <= daysInMonth; d++) {
            const date = new Date(year, month - 1, d);
            const dateStr = date.toISOString().split('T')[0];
            const dayAssignments = assignments.filter(a => {
                const start = new Date(a.startTime).toISOString().split('T')[0];
                const end = new Date(a.endTime).toISOString().split('T')[0];
                return dateStr >= start && dateStr <= end;
            });
            const events = dayAssignments.length > 0 ? dayAssignments.map(a => `${a.type}${a.type === 'ROT' ? ': ' + a.route : ''}`).join(', ') : '-';
            html += `<div class="roster-row"><div class="roster-date">${d}</div><div class="roster-events">${events}</div></div>`;
        }
        document.getElementById('rosterPreview').innerHTML = html;
    },
    
    bindFilters() {
        document.getElementById('pilotSearch').addEventListener('input', Utils.debounce(() => this.renderPilotsGrid(), 300));
        document.getElementById('baseFilter').addEventListener('change', (e) => { AppState.filters.base = e.target.value; this.renderPilotsGrid(); });
        document.getElementById('roleFilter').addEventListener('change', (e) => { AppState.filters.role = e.target.value; this.renderPilotsGrid(); });
        document.getElementById('rotationSearch').addEventListener('input', Utils.debounce(() => this.renderRotationsList(), 300));
        document.getElementById('assignmentFilter').addEventListener('change', (e) => { AppState.filters.assignment = e.target.value; this.renderRotationsList(); });
        
        document.getElementById('calendarRoleFilter').addEventListener('change', (e) => { AppState.filters.calendarRole = e.target.value; this.renderScheduler(); });
        document.getElementById('calendarBaseFilter').addEventListener('change', (e) => { AppState.filters.calendarBase = e.target.value; this.renderScheduler(); });
        document.getElementById('unassignedRoleFilter').addEventListener('change', (e) => { AppState.filters.unassignedRole = e.target.value; this.renderUnassignedPanel(); });
        
        // Sort filter for unassigned panel
        const sortFilter = document.getElementById('unassignedSortFilter');
        if (sortFilter) {
            sortFilter.addEventListener('change', (e) => { AppState.filters.unassignedSort = e.target.value; this.renderUnassignedPanel(); });
        }
        
        // Tail filter for unassigned panel
        const tailFilter = document.getElementById('unassignedTailFilter');
        if (tailFilter) {
            tailFilter.addEventListener('change', (e) => { 
                AppState.filters.tailFilter = e.target.value; 
                this.renderUnassignedPanel(); 
                this.renderRotationsList();
            });
        }
        
        // Date filter for unassigned panel
        document.getElementById('unassignedDateFilter')?.addEventListener('change', (e) => {
            AppState.filters.unassignedDate = e.target.value;
            this.renderUnassignedPanel();
        });
        
        // Origin filter for unassigned panel
        document.getElementById('unassignedOriginFilter')?.addEventListener('change', (e) => {
            AppState.filters.unassignedOrigin = e.target.value;
            this.renderUnassignedPanel();
        });
        
        // Pilot search in calendar
        document.getElementById('calendarPilotSearch')?.addEventListener('input', (e) => {
            AppState.filters.calendarPilotSearch = e.target.value.toLowerCase();
            this.renderScheduler();
        });
        
        // Rotations view filters
        document.getElementById('rotationsTailFilter')?.addEventListener('change', (e) => {
            AppState.filters.rotationsTail = e.target.value;
            this.renderRotationsList();
        });
        
        document.getElementById('rotationsOriginFilter')?.addEventListener('change', (e) => {
            AppState.filters.rotationsOrigin = e.target.value;
            this.renderRotationsList();
        });
        
        document.getElementById('rotationsDateFilter')?.addEventListener('change', (e) => {
            AppState.filters.rotationsDate = e.target.value;
            this.renderRotationsList();
        });
        
    },
    
    updateOriginFilter() {
        // Get unique origins from rotations
        const origins = [...new Set(AppState.rotations.map(r => r.origin).filter(o => o))].sort();
        const options = '<option value="">Origen</option>' + origins.map(o => `<option value="${o}">${o}</option>`).join('');
        
        // Update all origin filters
        ['unassignedOriginFilter', 'rotationsOriginFilter'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.innerHTML = options;
        });
    },
    
    updateBaseFilters() {
        const bases = [...new Set(AppState.pilots.map(p => p.base))].sort();
        const options = '<option value="">Todas las bases</option>' + bases.map(b => `<option value="${b}">${b}</option>`).join('');
        ['baseFilter', 'calendarBaseFilter'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.innerHTML = options;
        });
    },
    
    updateTailFilters() {
        // Get unique tails from rotations
        const tails = [...new Set(AppState.rotations.map(r => r.tail).filter(t => t))].sort();
        const options = '<option value="">Aeronave</option>' + tails.map(t => `<option value="${t}">${t}</option>`).join('');
        
        // Update all tail filters
        ['unassignedTailFilter', 'rotationsTailFilter'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.innerHTML = options;
        });
    },
    
    updatePilotDBSelector() {
        // Update any pilot DB selectors with available months
        const months = Object.keys(AppState.pilotDBsByMonth).sort();
        const monthNames = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
        
        const options = months.map(m => {
            const [year, month] = m.split('-');
            return `<option value="${m}">${monthNames[parseInt(month) - 1]} ${year}</option>`;
        }).join('');
        
        // Update any DB selectors (if they exist)
        document.querySelectorAll('.pilot-db-selector').forEach(sel => {
            sel.innerHTML = options;
        });
        
        console.log('Pilot DBs available:', months);
    },
    
    bindPeriodControls() {
        document.getElementById('prevPeriod').addEventListener('click', () => {
            AppState.currentPeriod.month--;
            if (AppState.currentPeriod.month < 1) { AppState.currentPeriod.month = 12; AppState.currentPeriod.year--; }
            this.updatePeriodLabel();
            this.renderCurrentView();
        });
        document.getElementById('nextPeriod').addEventListener('click', () => {
            AppState.currentPeriod.month++;
            if (AppState.currentPeriod.month > 12) { AppState.currentPeriod.month = 1; AppState.currentPeriod.year++; }
            this.updatePeriodLabel();
            this.renderCurrentView();
        });
        document.querySelectorAll('.toggle-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.toggle-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                AppState.viewRange = btn.dataset.range;
                this.renderCurrentView();
            });
        });
    },
    
    updatePeriodLabel() {
        document.getElementById('currentPeriod').textContent = `${Utils.getMonthName(AppState.currentPeriod.month)} ${AppState.currentPeriod.year}`;
    },
    
    bindZoomControls() {
        document.getElementById('zoomIn').addEventListener('click', () => this.setZoom(AppState.zoomLevel + CONFIG.ZOOM.step));
        document.getElementById('zoomOut').addEventListener('click', () => this.setZoom(AppState.zoomLevel - CONFIG.ZOOM.step));
        document.getElementById('zoomReset').addEventListener('click', () => this.setZoom(CONFIG.ZOOM.default));
    },
    
    setZoom(level) {
        AppState.zoomLevel = Math.max(CONFIG.ZOOM.min, Math.min(CONFIG.ZOOM.max, level));
        document.getElementById('zoomLevel').textContent = Math.round(AppState.zoomLevel * 100) + '%';
        document.documentElement.style.setProperty('--zoom-level', AppState.zoomLevel);
        this.renderCurrentView();
    },
    
    bindFontControls() {
        // Load saved font scale
        const savedScale = localStorage.getItem('flexcrew-fontscale');
        if (savedScale) {
            this.fontScale = parseFloat(savedScale);
            this.applyFontScale();
        }
        
        document.getElementById('fontIncrease')?.addEventListener('click', () => {
            this.fontScale = Math.min(1.5, this.fontScale + 0.1);
            this.applyFontScale();
            localStorage.setItem('flexcrew-fontscale', this.fontScale);
        });
        
        document.getElementById('fontDecrease')?.addEventListener('click', () => {
            this.fontScale = Math.max(0.7, this.fontScale - 0.1);
            this.applyFontScale();
            localStorage.setItem('flexcrew-fontscale', this.fontScale);
        });
    },
    
    applyFontScale() {
        document.documentElement.style.setProperty('--font-scale', this.fontScale);
        document.getElementById('fontSizeLabel').textContent = Math.round(this.fontScale * 100) + '%';
        
        // Apply to body for calendar scaling
        document.body.dataset.fontScale = this.fontScale.toFixed(1);
        
        // Apply to scheduler elements
        const root = document.documentElement;
        root.style.fontSize = (this.fontScale * 100) + '%';
    },
    
    bindLogsView() {
        // Filter logs by type
        document.getElementById('logsTypeFilter')?.addEventListener('change', (e) => {
            this.renderLogs(e.target.value);
        });
        
        // Clear logs - only admin
        document.getElementById('clearLogsBtn')?.addEventListener('click', () => {
            if (!Auth.isAdmin()) {
                Toast.show('error', 'Sin permiso', 'Solo administradores pueden borrar logs');
                return;
            }
            if (confirm('¿Eliminar todo el historial de actividades?')) {
                if (Logger.clear()) {
                    this.renderLogs();
                    Toast.show('success', 'Limpiado', 'Historial eliminado');
                }
            }
        });
        
        // Export logs
        document.getElementById('exportLogsBtn')?.addEventListener('click', () => {
            Logger.export();
            Toast.show('success', 'Exportado', 'Logs exportados a CSV');
        });
    },
    
    renderLogs(typeFilter = '') {
        const container = document.getElementById('logsList');
        if (!container) return;
        
        let logs = Logger.getLogs();
        if (typeFilter) {
            logs = logs.filter(l => l.type === typeFilter);
        }
        
        if (logs.length === 0) {
            container.innerHTML = '<div class="logs-empty">No hay actividades registradas</div>';
            return;
        }
        
        const icons = {
            login: '🔐',
            assign: '✈️',
            create: '➕',
            delete: '🗑️',
            edit: '✏️',
            export: '📤'
        };
        
        container.innerHTML = logs.map(log => {
            const date = new Date(log.timestamp);
            const timeStr = date.toLocaleString('es-ES', { 
                day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' 
            });
            
            return `<div class="log-item">
                <div class="log-icon ${log.type}">${icons[log.type] || '📋'}</div>
                <div class="log-content">
                    <div class="log-action">${log.action}</div>
                    ${log.details ? `<div class="log-details">${log.details}</div>` : ''}
                </div>
                <div class="log-time">${timeStr}<span class="log-user">${log.user}</span></div>
            </div>`;
        }).join('');
    },
    
    bindModals() {
        document.querySelectorAll('.modal-close, .modal-overlay').forEach(el => {
            el.addEventListener('click', () => this.closeAllModals());
        });
        document.getElementById('cancelEvent').addEventListener('click', () => this.closeAllModals());
        document.getElementById('saveEvent').addEventListener('click', () => this.saveEvent());
        
        document.querySelectorAll('.event-type').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.event-type').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                document.getElementById('eventForm').dataset.type = btn.dataset.type;
            });
        });
    },
    
    closeAllModals() {
        document.querySelectorAll('.modal').forEach(m => m.classList.remove('active'));
    },
    
    updateView(viewName) {
        AppState.currentView = viewName;
        document.querySelectorAll('.nav-item[data-view]').forEach(btn => btn.classList.toggle('active', btn.dataset.view === viewName));
        document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
        document.getElementById(`${viewName}View`).classList.add('active');
        
        // Update header title
        const titles = {
            'upload': 'Avianca Cargo',
            'pilots': 'Pilotos',
            'rotations': 'Rotaciones',
            'scheduler': 'Calendario',
            'config': 'Configuración',
            'logs': 'Historial'
        };
        document.getElementById('viewTitle').textContent = titles[viewName] || 'Avianca Cargo';
        
        document.getElementById('zoomControls').style.display = viewName === 'scheduler' ? 'flex' : 'none';
        this.renderCurrentView();
    },
    
    renderCurrentView() {
        // Update filters when switching views
        if (AppState.rotations.length > 0) {
            this.updateTailFilters();
            this.updateOriginFilter();
        }
        
        switch (AppState.currentView) {
            case 'pilots': this.renderPilotsGrid(); break;
            case 'rotations': this.renderRotationsList(); break;
            case 'scheduler': this.renderScheduler(); this.renderUnassignedPanel(); break;
            case 'config': this.renderConfig(); break;
            case 'logs': this.renderLogs(); break;
        }
    },
    
    getPilotHours(pilot) {
        const { year, month } = AppState.currentPeriod;
        const monthKey = `${year}-${month - 1}`;
        const q1Key = `${year}-${month - 1}-1`;
        const q2Key = `${year}-${month - 1}-2`;
        return { month: pilot.ftByMonth[monthKey] || 0, q1: pilot.ftByFortnight[q1Key] || 0, q2: pilot.ftByFortnight[q2Key] || 0 };
    },
    
    renderPilotsGrid() {
        const container = document.getElementById('pilotsGrid');
        const searchTerm = document.getElementById('pilotSearch').value.toLowerCase();
        
        let pilots = [...AppState.pilots];
        if (searchTerm) pilots = pilots.filter(p => p.name.toLowerCase().includes(searchTerm) || p.id.toLowerCase().includes(searchTerm));
        if (AppState.filters.base) pilots = pilots.filter(p => p.base === AppState.filters.base);
        if (AppState.filters.role) pilots = pilots.filter(p => p.role.includes(AppState.filters.role));
        
        container.innerHTML = pilots.map(pilot => {
            const hours = this.getPilotHours(pilot);
            const assignments = AppState.assignments.get(pilot.id) || [];
            return `<div class="pilot-card" data-pilot-id="${pilot.id}">
                <div class="pilot-card-header">
                    <div class="pilot-avatar">${Utils.getInitials(pilot.nick || pilot.name)}</div>
                    <div class="pilot-card-info"><div class="pilot-card-name">${pilot.name}</div><div class="pilot-card-id">${pilot.id}</div></div>
                </div>
                <div class="pilot-card-badges"><span class="pilot-badge base">${pilot.base}</span><span class="pilot-badge role">${pilot.role.split(',')[0]}</span></div>
                <div class="pilot-card-stats">
                    <div class="pilot-stat"><div class="pilot-stat-value">${Math.round(hours.month)}</div><div class="pilot-stat-label">Hrs</div></div>
                    <div class="pilot-stat"><div class="pilot-stat-value">${assignments.filter(a => a.type === 'ROT').length}</div><div class="pilot-stat-label">Rots</div></div>
                    <div class="pilot-stat"><div class="pilot-stat-value">${pilot.seniority}</div><div class="pilot-stat-label">Sen</div></div>
                </div>
            </div>`;
        }).join('');
        
        container.querySelectorAll('.pilot-card').forEach(card => {
            card.addEventListener('click', () => this.showPilotModal(card.dataset.pilotId));
        });
    },
    
    renderRotationsList() {
        const container = document.getElementById('rotationsList');
        const searchTerm = document.getElementById('rotationSearch')?.value.toLowerCase() || '';
        const roleFilter = document.getElementById('rotationRoleFilter')?.value || '';
        
        let slots = [...AppState.slots];
        if (searchTerm) slots = slots.filter(s => s.id.toLowerCase().includes(searchTerm) || s.rotation?.route.toLowerCase().includes(searchTerm));
        if (AppState.filters.assignment === 'assigned') slots = slots.filter(s => s.pilotId);
        else if (AppState.filters.assignment === 'unassigned') slots = slots.filter(s => !s.pilotId);
        
        // Apply role filter
        if (roleFilter) {
            slots = slots.filter(s => s.role === roleFilter);
        }
        
        // Apply tail filter (from rotations view)
        if (AppState.filters.rotationsTail) {
            slots = slots.filter(s => s.rotation?.tail === AppState.filters.rotationsTail);
        }
        
        // Apply origin filter (from rotations view)
        if (AppState.filters.rotationsOrigin) {
            slots = slots.filter(s => s.rotation?.origin === AppState.filters.rotationsOrigin);
        }
        
        // Apply date filter (from rotations view)
        if (AppState.filters.rotationsDate) {
            const filterDate = new Date(AppState.filters.rotationsDate);
            slots = slots.filter(s => {
                const rotDate = new Date(s.rotation?.startTime);
                return rotDate.toDateString() === filterDate.toDateString();
            });
        }
        
        // Sort by date
        slots.sort((a, b) => new Date(a.rotation?.startTime) - new Date(b.rotation?.startTime));
        
        container.innerHTML = slots.map(slot => {
            const r = slot.rotation;
            if (!r) return '';
            const nightClass = r.isNight ? 'style="color:var(--event-rotation-night)"' : '';
            const isAssigned = !!slot.pilotId;
            const pilotDisplay = isAssigned ? slot.pilotName?.split(' ')[0] || slot.pilotId : 'Sin asignar';
            const isSelected = AppState.selectedRotations.has(r.id);
            
            // Calculate ST Gap (Max ST allowed - actual ST)
            const crew = r.crew || 2;
            const deptHour = new Date(r.startTime).getHours() + new Date(r.startTime).getMinutes() / 60;
            const isDayWindow = deptHour >= CONFIG.DAY_WINDOW.start && deptHour <= CONFIG.DAY_WINDOW.end;
            let maxST;
            if (crew >= 4) maxST = isDayWindow ? CONFIG.LIMITS.CREW_4.ST_DAY : CONFIG.LIMITS.CREW_4.ST_NIGHT;
            else if (crew >= 3) maxST = isDayWindow ? CONFIG.LIMITS.CREW_3.ST_DAY : CONFIG.LIMITS.CREW_3.ST_NIGHT;
            else maxST = isDayWindow ? CONFIG.LIMITS.CREW_2.ST_DAY : CONFIG.LIMITS.CREW_2.ST_NIGHT;
            
            const stGap = maxST - (r.stTotal || 0);
            const stGapColor = stGap < 0 ? '#ef4444' : stGap < 1 ? '#f59e0b' : '#10b981';
            
            return `<div class="rotation-card ${isSelected ? 'selected' : ''}" data-rotation-id="${r.id}">
                <div class="rotation-checkbox ${isSelected ? 'checked' : ''}" data-rotation-id="${r.id}"></div>
                <div class="rotation-item">
                    <div class="rotation-id" ${nightClass}>${r.id}<br><span style="font-size:9px;color:var(--text-muted)">${slot.role}${r.isNight ? ' 🌙' : ''}</span></div>
                    <div class="rotation-route">
                        <span class="rotation-station">${r.origin}</span><span class="rotation-arrow">→</span><span class="rotation-station">${r.destination}</span>
                        <span class="rotation-route-detail">${r.route}</span>
                        <span class="rotation-tail">✈ ${r.tail || 'N/A'}</span>
                    </div>
                    <div class="rotation-times">
                        <div class="rotation-time"><span class="rotation-time-label">Sal:</span>${Utils.formatDate(r.startTime, 'full')}</div>
                        <div class="rotation-time"><span class="rotation-time-label">Lleg:</span>${Utils.formatDate(r.endTime, 'full')}</div>
                    </div>
                    <div class="rotation-hours">
                        <div class="rotation-hour"><div class="rotation-hour-value">${r.ftTotal?.toFixed(2)}</div><div class="rotation-hour-label">FT</div></div>
                        <div class="rotation-hour"><div class="rotation-hour-value">${r.stTotal?.toFixed(2)}</div><div class="rotation-hour-label">ST</div></div>
                        <div class="rotation-hour"><div class="rotation-hour-value" style="color:${stGapColor}">${stGap.toFixed(2)}</div><div class="rotation-hour-label">ST Gap</div></div>
                        <div class="rotation-hour"><div class="rotation-hour-value">${r.restBase}/${r.restAway}</div><div class="rotation-hour-label">Rest</div></div>
                    </div>
                    <div><span class="status-badge ${isAssigned ? 'assigned' : 'unassigned'}">${pilotDisplay}</span></div>
                </div>
            </div>`;
        }).join('');
        
        // Add checkbox click handlers
        container.querySelectorAll('.rotation-checkbox').forEach(checkbox => {
            checkbox.addEventListener('click', (e) => {
                e.stopPropagation();
                const rotationId = checkbox.dataset.rotationId;
                const card = checkbox.closest('.rotation-card');
                
                if (AppState.selectedRotations.has(rotationId)) {
                    AppState.selectedRotations.delete(rotationId);
                    checkbox.classList.remove('checked');
                    card.classList.remove('selected');
                } else {
                    AppState.selectedRotations.add(rotationId);
                    checkbox.classList.add('checked');
                    card.classList.add('selected');
                }
                
                this.updateBulkActionsBar();
            });
        });
        
        // Add click handlers for editing rotations (on the item, not checkbox)
        container.querySelectorAll('.rotation-item').forEach(item => {
            item.addEventListener('click', () => {
                const rotationId = item.closest('.rotation-card').dataset.rotationId;
                this.showRotationEditModal(rotationId);
            });
        });
    },

    // Show only UNASSIGNED slots in panel - sorted by date
    renderUnassignedPanel() {
        const { year, month } = AppState.currentPeriod;
        
        // CRITICAL: Filter to get ONLY unassigned slots (pilotId is null/undefined)
        let unassigned = AppState.slots.filter(s => !s.pilotId && s.pilotId !== 0);
        
        // Filter by period
        unassigned = unassigned.filter(s => {
            if (!s.rotation) return false;
            const d = new Date(s.rotation.startTime);
            return d.getFullYear() === year && d.getMonth() === month - 1;
        });
        
        // Apply role filter
        if (AppState.filters.unassignedRole) {
            unassigned = unassigned.filter(s => s.role === AppState.filters.unassignedRole);
        }
        
        // Apply tail filter
        if (AppState.filters.tailFilter) {
            unassigned = unassigned.filter(s => s.rotation?.tail === AppState.filters.tailFilter);
        }
        
        // Apply date filter
        if (AppState.filters.unassignedDate) {
            const filterDate = new Date(AppState.filters.unassignedDate);
            unassigned = unassigned.filter(s => {
                const rotDate = new Date(s.rotation?.startTime);
                return rotDate.toDateString() === filterDate.toDateString();
            });
        }
        
        // Apply origin filter
        if (AppState.filters.unassignedOrigin) {
            unassigned = unassigned.filter(s => s.rotation?.origin === AppState.filters.unassignedOrigin);
        }
        
        // Sort by date (default) or by other criteria
        const sortBy = AppState.filters.unassignedSort || 'date';
        unassigned.sort((a, b) => {
            if (sortBy === 'date') {
                return new Date(a.rotation.startTime) - new Date(b.rotation.startTime);
            } else if (sortBy === 'ft') {
                return b.rotation.ftTotal - a.rotation.ftTotal;
            } else if (sortBy === 'route') {
                return a.rotation.route.localeCompare(b.rotation.route);
            }
            return new Date(a.rotation.startTime) - new Date(b.rotation.startTime);
        });
        
        document.getElementById('unassignedCount').textContent = unassigned.length;
        
        const container = document.getElementById('unassignedList');
        
        if (unassigned.length === 0) {
            container.innerHTML = '<div class="empty-state">Todas las rotaciones asignadas</div>';
            return;
        }
        
        container.innerHTML = unassigned.map(slot => {
            const r = slot.rotation;
            const nightClass = r.isNight ? 'night' : '';
            return `<div class="unassigned-slot ${nightClass}" draggable="true" data-slot-id="${slot.id}">
                <div class="unassigned-slot-header">
                    <span class="unassigned-slot-id">${r.id}</span>
                    <span class="unassigned-slot-role">${slot.role}</span>
                </div>
                <div class="unassigned-slot-route">${r.route}</div>
                <div class="unassigned-slot-tail">✈ ${r.tail || 'N/A'}</div>
                <div class="unassigned-slot-times">${Utils.formatDate(r.startTime, 'short')} ${Utils.formatDate(r.startTime, 'time')}→${Utils.formatDate(r.endTime, 'time')}</div>
                <div class="unassigned-slot-hours">FT: ${r.ftTotal?.toFixed(1)}h | Rest: ${r.restBase}h/${r.restAway}h</div>
            </div>`;
        }).join('');
        
        container.querySelectorAll('.unassigned-slot').forEach(el => {
            el.addEventListener('dragstart', (e) => {
                AppState.draggedSlot = AppState.slots.find(s => s.id === el.dataset.slotId);
                el.classList.add('dragging');
                e.dataTransfer.effectAllowed = 'move';
            });
            el.addEventListener('dragend', () => { el.classList.remove('dragging'); AppState.draggedSlot = null; });
        });
    },
    
    renderScheduler() {
        const { year, month } = AppState.currentPeriod;
        const daysInMonth = Utils.getDaysInMonth(year, month);
        const dayNames = ['D', 'L', 'M', 'X', 'J', 'V', 'S'];
        
        // Determine day range based on viewRange
        let startDay = 1;
        let endDay = daysInMonth;
        const today = new Date();
        const currentDay = today.getDate();
        
        if (AppState.viewRange === 'week') {
            // Show current week (7 days centered on today if same month)
            if (today.getMonth() + 1 === month && today.getFullYear() === year) {
                startDay = Math.max(1, currentDay - 3);
                endDay = Math.min(daysInMonth, startDay + 6);
            } else {
                startDay = 1;
                endDay = 7;
            }
        } else if (AppState.viewRange === 'fortnight') {
            // Show current fortnight
            if (today.getMonth() + 1 === month && today.getFullYear() === year) {
                if (currentDay <= 15) {
                    startDay = 1;
                    endDay = 15;
                } else {
                    startDay = 16;
                    endDay = daysInMonth;
                }
            } else {
                startDay = 1;
                endDay = 15;
            }
        }
        // else 'month' - show all days (default)
        
        let pilots = [...AppState.pilots];
        if (AppState.filters.calendarRole) pilots = pilots.filter(p => p.role.includes(AppState.filters.calendarRole));
        if (AppState.filters.calendarBase) pilots = pilots.filter(p => p.base === AppState.filters.calendarBase);
        
        // Apply pilot search filter
        if (AppState.filters.calendarPilotSearch) {
            const search = AppState.filters.calendarPilotSearch;
            pilots = pilots.filter(p => 
                p.name.toLowerCase().includes(search) || 
                p.id.toLowerCase().includes(search) ||
                (p.nick && p.nick.toLowerCase().includes(search))
            );
        }
        
        // Sidebar with sticky header
        const sidebar = document.getElementById('pilotSidebar');
        sidebar.innerHTML = `<div class="pilot-sidebar-header">Pilotos (${pilots.length})</div>
            ${pilots.map(pilot => {
                const hours = this.getPilotHours(pilot);
                const monthClass = hours.month >= 85 ? 'danger' : hours.month >= 70 ? 'warning' : '';
                return `<div class="pilot-row" data-pilot-id="${pilot.id}">
                    <div class="pilot-row-avatar">${Utils.getInitials(pilot.nick || pilot.name)}</div>
                    <div class="pilot-row-info"><div class="pilot-row-name">${pilot.nick || pilot.name.split(' ')[0]}</div><div class="pilot-row-meta">${pilot.base} • ${pilot.role.split(',')[0]}</div></div>
                    <div class="pilot-row-hours"><span class="pilot-hours-month ${monthClass}">${Math.round(hours.month)}h</span><span class="pilot-hours-fortnight">Q1:${Math.round(hours.q1)} Q2:${Math.round(hours.q2)}</span></div>
                </div>`;
            }).join('')}`;
        
        // Calendar with sticky header - only show days in range
        let calendarHTML = '<div class="calendar-header">';
        for (let d = startDay; d <= endDay; d++) {
            const date = new Date(year, month - 1, d);
            const dow = date.getDay();
            const isWeekend = dow === 0 || dow === 6;
            const isToday = Utils.isSameDay(date, new Date());
            const isQ1End = d === 15;
            
            // Check if holiday
            const dateStr = `${year}-${String(month).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
            const isHoliday = AppState.holidays.has(dateStr);
            const holidayName = isHoliday ? AppState.holidays.get(dateStr) : '';
            
            calendarHTML += `<div class="calendar-day-header ${isWeekend ? 'weekend' : ''} ${isToday ? 'today' : ''} ${isQ1End ? 'q1-end' : ''} ${isHoliday ? 'holiday' : ''}" ${isHoliday ? `title="${holidayName}"` : ''}>
                <div class="day-name">${dayNames[dow]}${isHoliday ? ' 🎉' : ''}</div><div class="day-number">${d}</div>
            </div>`;
        }
        calendarHTML += '</div><div class="calendar-body">';
        
        pilots.forEach(pilot => {
            calendarHTML += `<div class="calendar-row" data-pilot-id="${pilot.id}">`;
            for (let d = startDay; d <= endDay; d++) {
                const date = new Date(year, month - 1, d);
                const dow = date.getDay();
                const isWeekend = dow === 0 || dow === 6;
                const isQ1End = d === 15;
                
                // Check if holiday
                const dateStr = `${year}-${String(month).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
                const isHoliday = AppState.holidays.has(dateStr);
                
                calendarHTML += `<div class="calendar-cell ${isWeekend ? 'weekend' : ''} ${isQ1End ? 'q1-end' : ''} ${isHoliday ? 'holiday' : ''}" 
                    data-date="${dateStr}" data-pilot-id="${pilot.id}"></div>`;
            }
            calendarHTML += '</div>';
        });
        calendarHTML += '</div>';
        
        document.getElementById('calendarGrid').innerHTML = calendarHTML;
        this.renderCalendarEvents(pilots, daysInMonth, startDay, endDay);
        
        // Bind events
        sidebar.querySelectorAll('.pilot-row').forEach(row => {
            row.addEventListener('click', () => this.showPilotModal(row.dataset.pilotId));
        });
        document.querySelectorAll('.calendar-cell').forEach(cell => {
            cell.addEventListener('dblclick', () => this.openCreateEventModal(cell.dataset.pilotId, cell.dataset.date));
        });
    },
    
    renderCalendarEvents(pilots, daysInMonth, rangeStart = 1, rangeEnd = null) {
        const { year, month } = AppState.currentPeriod;
        const visibleDays = (rangeEnd || daysInMonth) - rangeStart + 1;
        
        pilots.forEach(pilot => {
            const assignments = AppState.assignments.get(pilot.id) || [];
            const row = document.querySelector(`.calendar-row[data-pilot-id="${pilot.id}"]`);
            if (!row) return;
            
            const sorted = [...assignments].sort((a, b) => new Date(a.startTime) - new Date(b.startTime));
            
            // Group assignments by start day to detect overlaps
            const dayGroups = new Map();
            sorted.forEach((assignment, idx) => {
                const start = new Date(assignment.startTime);
                const dayKey = `${start.getFullYear()}-${start.getMonth()}-${start.getDate()}`;
                if (!dayGroups.has(dayKey)) dayGroups.set(dayKey, []);
                dayGroups.get(dayKey).push({ assignment, idx });
            });
            
            sorted.forEach((assignment, idx) => {
                const start = new Date(assignment.startTime);
                const end = new Date(assignment.endTime);
                
                // Check if in current month
                const startMonth = start.getMonth() + 1;
                const endMonth = end.getMonth() + 1;
                const startYear = start.getFullYear();
                const endYear = end.getFullYear();
                
                if ((startYear !== year || startMonth !== month) && (endYear !== year || endMonth !== month)) return;
                
                let startDay = start.getDate();
                let endDay = end.getDate();
                if (startYear < year || (startYear === year && startMonth < month)) startDay = 1;
                if (endYear > year || (endYear === year && endMonth > month)) endDay = daysInMonth;
                
                // Check if within visible range
                if (endDay < rangeStart || startDay > (rangeEnd || daysInMonth)) return;
                
                // Adjust to visible range
                const visStartDay = Math.max(startDay, rangeStart);
                const visEndDay = Math.min(endDay, rangeEnd || daysInMonth);
                
                const cellWidth = 100 / visibleDays;
                const left = (visStartDay - rangeStart) * cellWidth;
                const width = (visEndDay - visStartDay + 1) * cellWidth;
                
                const isNight = assignment.isNight || Utils.isNightRotation(start, end);
                const nightClass = isNight ? 'night' : '';
                
                // Check for same-day assignments (stacking)
                const dayKey = `${startYear}-${start.getMonth()}-${start.getDate()}`;
                const dayAssignments = dayGroups.get(dayKey) || [];
                const myIndex = dayAssignments.findIndex(d => d.assignment === assignment);
                const totalSameDay = dayAssignments.length;
                
                // Calculate vertical position for stacking
                let topOffset = 2;
                let heightPct = 100;
                if (totalSameDay > 1) {
                    heightPct = 100 / totalSameDay;
                    topOffset = myIndex * heightPct;
                }
                
                // Calculate gap from previous OPERATIONAL assignment (for tooltip and between-block indicator)
                const operationalTypes = new Set(['ROT', 'DH', 'TRN', 'OFI']);
                let gapValue = 0;
                let gapClass = '';
                let prevAssignment = null;
                
                // Only show gap if CURRENT assignment is operational
                if (operationalTypes.has(assignment.type) && idx > 0) {
                    // Find previous OPERATIONAL assignment
                    for (let i = idx - 1; i >= 0; i--) {
                        if (operationalTypes.has(sorted[i].type)) {
                            prevAssignment = sorted[i];
                            break;
                        }
                    }
                    
                    if (prevAssignment) {
                        gapValue = Utils.hoursBetween(prevAssignment.endTime, assignment.startTime);
                        const restReq = prevAssignment.destination === pilot.base ? (prevAssignment.restBase || 10) : (prevAssignment.restAway || 12);
                        gapClass = gapValue < restReq ? 'gap-danger' : gapValue < restReq + 2 ? 'gap-warning' : 'gap-ok';
                    }
                }
                
                const block = document.createElement('div');
                block.className = `event-block ${assignment.type} ${nightClass}`;
                block.style.left = `${left}%`;
                block.style.width = `calc(${width}% - 4px)`;
                
                // Apply stacking styles
                if (totalSameDay > 1) {
                    block.style.top = `${topOffset}%`;
                    block.style.height = `calc(${heightPct}% - 2px)`;
                    block.classList.add('stacked');
                }
                
                block.draggable = true;
                block.dataset.assignmentId = assignment.slotId || assignment.id;
                block.dataset.pilotId = pilot.id;
                block.dataset.type = assignment.type;
                block.dataset.gapValue = gapValue;
                block.dataset.gapClass = gapClass;
                
                let content = '';
                if (assignment.type === 'ROT') {
                    content = `<div class="event-block-content">
                        <div class="event-route">${assignment.route || ''}</div>
                        <div class="event-tail">✈ ${assignment.tail || ''}</div>
                        <div class="event-times">${Utils.formatDate(start, 'time')}→${Utils.formatDate(end, 'time')}</div>
                    </div>`;
                } else if (assignment.type === 'DH') {
                    const notesDisplay = assignment.notes ? `<div class="event-notes">${assignment.notes}</div>` : '';
                    content = `<div class="event-block-content">
                        <div class="event-route">DH ${assignment.origin}→${assignment.destination}</div>
                        <div class="event-times">${Utils.formatDate(start, 'time')}→${Utils.formatDate(end, 'time')}</div>
                        ${notesDisplay}
                    </div>`;
                } else if (assignment.type === 'TRN' || assignment.type === 'OFI') {
                    const notesDisplay = assignment.notes ? `<div class="event-notes">${assignment.notes}</div>` : '';
                    const timeDisplay = assignment.stHours ? `<div class="event-times">${Utils.formatDate(start, 'time')}→${Utils.formatDate(end, 'time')}</div>` : '';
                    content = `<div class="event-block-content">
                        <div class="event-route">${assignment.type}</div>
                        ${timeDisplay}
                        ${notesDisplay}
                    </div>`;
                } else {
                    // OFF, VAC, FREE, LUS, INC
                    const notesDisplay = assignment.notes ? `<div class="event-notes">${assignment.notes}</div>` : '';
                    content = `<div class="event-block-content">
                        <div class="event-route">${assignment.type}</div>
                        ${notesDisplay}
                    </div>`;
                }
                block.innerHTML = content;
                row.appendChild(block);
                
                // Show gap BETWEEN operational blocks only
                if (prevAssignment && operationalTypes.has(assignment.type) && gapValue > 0 && gapValue < 72) {
                    const gapEl = document.createElement('div');
                    gapEl.className = 'event-gap';
                    if (gapClass === 'gap-danger') gapEl.classList.add('danger');
                    else if (gapClass === 'gap-warning') gapEl.classList.add('warning');
                    gapEl.textContent = Utils.formatHours(gapValue);
                    gapEl.style.left = `calc(${left}% - 22px)`;
                    row.appendChild(gapEl);
                }
                
                block.addEventListener('contextmenu', (e) => { e.preventDefault(); this.showContextMenu(e, assignment, pilot.id); });
                block.addEventListener('mouseenter', (e) => this.showTooltip(e, assignment, pilot, gapValue, gapClass, prevAssignment));
                block.addEventListener('mouseleave', () => this.hideTooltip());
                
                // Double-click to edit non-ROT events
                if (assignment.type !== 'ROT') {
                    block.addEventListener('dblclick', (e) => {
                        e.stopPropagation();
                        this.showEditEventModal(assignment, pilot);
                    });
                    block.style.cursor = 'pointer';
                    block.title = 'Doble clic para editar';
                }
            });
        });
        
        // After rendering events, add visual indicators
        this.renderCalendarIndicators(pilots, daysInMonth, rangeStart, rangeEnd);
    },
    
    renderCalendarIndicators(pilots, daysInMonth, rangeStart = 1, rangeEnd = null) {
        const { year, month } = AppState.currentPeriod;
        const operationalTypes = new Set(['ROT', 'DH', 'TRN', 'OFI']);
        const nonOperationalTypes = new Set(['OFF', 'VAC', 'FREE', 'LUS', 'INC', 'L']);
        
        pilots.forEach(pilot => {
            const assignments = AppState.assignments.get(pilot.id) || [];
            const sorted = [...assignments].sort((a, b) => new Date(a.startTime) - new Date(b.startTime));
            
            // Create a map of which days have operational/non-operational assignments
            // A rotation that spans multiple days should mark ALL those days
            const dayInfo = new Map(); // { dateStr: { hasOp: bool, hasNonOp: bool, destinations: [] } }
            
            sorted.forEach(a => {
                const startDate = new Date(a.startTime);
                const endDate = new Date(a.endTime);
                
                // Iterate through all calendar days this assignment covers
                let current = new Date(startDate);
                current.setHours(0, 0, 0, 0);
                
                const endDay = new Date(endDate);
                endDay.setHours(23, 59, 59, 999);
                
                while (current <= endDay) {
                    const dayKey = `${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2,'0')}-${String(current.getDate()).padStart(2,'0')}`;
                    
                    if (!dayInfo.has(dayKey)) {
                        dayInfo.set(dayKey, { hasOp: false, hasNonOp: false, destinations: [] });
                    }
                    
                    const info = dayInfo.get(dayKey);
                    
                    if (nonOperationalTypes.has(a.type)) {
                        info.hasNonOp = true;
                    }
                    if (operationalTypes.has(a.type)) {
                        info.hasOp = true;
                        if (a.destination) {
                            info.destinations.push(a.destination);
                        }
                    }
                    
                    current.setDate(current.getDate() + 1);
                }
            });
            
            // Track state day by day for the entire month
            let currentLocation = pilot.base;
            let consecutiveDays = 0;
            let daysFromBase = 0;
            
            for (let d = 1; d <= daysInMonth; d++) {
                const dateStr = `${year}-${String(month).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
                const info = dayInfo.get(dateStr) || { hasOp: false, hasNonOp: false, destinations: [] };
                
                if (info.hasNonOp) {
                    // Non-operational day: reset everything, pilot is at base
                    consecutiveDays = 0;
                    daysFromBase = 0;
                    currentLocation = pilot.base;
                } else if (info.hasOp) {
                    // Operational day (even if just part of multi-day rotation): increment consecutive days
                    consecutiveDays++;
                    
                    // Update location based on last destination of the day
                    if (info.destinations.length > 0) {
                        currentLocation = info.destinations[info.destinations.length - 1];
                    }
                    
                    // Track DFB
                    if (currentLocation !== pilot.base) {
                        daysFromBase++;
                    } else {
                        daysFromBase = 0;
                    }
                } else {
                    // No assignment day: 
                    // - consecutive days resets (no operational assignment)
                    // - DFB continues if pilot is still outside base
                    consecutiveDays = 0;
                    
                    if (currentLocation !== pilot.base) {
                        daysFromBase++;
                    }
                }
                
                // Only render if in visible range
                if (d >= rangeStart && d <= (rangeEnd || daysInMonth)) {
                    const cell = document.querySelector(`.calendar-cell[data-pilot-id="${pilot.id}"][data-date="${dateStr}"]`);
                    if (!cell) continue;
                    
                    // Add consecutive days badge (top right) - only if has operational assignment
                    if (consecutiveDays > 0 && info.hasOp) {
                        const badge = document.createElement('div');
                        badge.className = 'day-consecutive-badge';
                        if (consecutiveDays >= 6) {
                            badge.classList.add('danger');
                        } else if (consecutiveDays >= 5) {
                            badge.classList.add('warning');
                        }
                        badge.textContent = consecutiveDays;
                        badge.title = `${consecutiveDays} días calendario con asignación operacional`;
                        cell.appendChild(badge);
                    }
                    
                    // Add DFB badge (bottom right) - show if outside base
                    if (daysFromBase > 0) {
                        const dfbBadge = document.createElement('div');
                        dfbBadge.className = 'day-dfb-badge';
                        if (daysFromBase >= 6) {
                            dfbBadge.classList.add('danger');
                        } else if (daysFromBase >= 5) {
                            dfbBadge.classList.add('warning');
                        }
                        dfbBadge.textContent = `DFB:${daysFromBase}`;
                        dfbBadge.title = `${daysFromBase} días fuera de base (${pilot.base}). Ubicación: ${currentLocation}`;
                        cell.appendChild(dfbBadge);
                    }
                }
            }
        });
    },
    
    showEditEventModal(assignment, pilot) {
        // Create or show edit modal
        let modal = document.getElementById('editEventModal');
        if (!modal) {
            modal = document.createElement('div');
            modal.className = 'modal';
            modal.id = 'editEventModal';
            modal.innerHTML = `
                <div class="modal-overlay"></div>
                <div class="modal-content">
                    <button class="modal-close">&times;</button>
                    <div class="modal-header"><h2>Editar Evento</h2></div>
                    <div class="modal-body">
                        <div class="form-grid">
                            <div class="form-group">
                                <label>Tipo</label>
                                <select id="editEventType">
                                    <option value="DH">DH - Dead Head</option>
                                    <option value="TRN">TRN - Entrenamiento</option>
                                    <option value="OFI">OFI - Oficina</option>
                                    <option value="OFF">OFF - Día Libre</option>
                                    <option value="FREE">FREE - Libre</option>
                                    <option value="VAC">VAC - Vacaciones</option>
                                    <option value="LUS">LUS - Lustro</option>
                                    <option value="INC">INC - Incapacidad</option>
                                </select>
                            </div>
                            <div class="form-group">
                                <label>Fecha Inicio</label>
                                <input type="date" id="editEventStartDate">
                            </div>
                            <div class="form-group">
                                <label>Fecha Fin</label>
                                <input type="date" id="editEventEndDate">
                            </div>
                            <div class="form-group edit-dh-only">
                                <label>Origen</label>
                                <input type="text" id="editEventOrigin" maxlength="4">
                            </div>
                            <div class="form-group edit-dh-only">
                                <label>Destino</label>
                                <input type="text" id="editEventDestination" maxlength="4">
                            </div>
                            <div class="form-group edit-time-only">
                                <label>Hora Inicio</label>
                                <input type="time" id="editEventStartTime">
                            </div>
                            <div class="form-group edit-time-only">
                                <label>Hora Fin</label>
                                <input type="time" id="editEventEndTime">
                            </div>
                            <div class="form-group full-width">
                                <label>Notas</label>
                                <textarea id="editEventNotes" rows="2"></textarea>
                            </div>
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button class="btn-danger" id="deleteEventBtn">Eliminar</button>
                        <button class="btn-secondary" id="cancelEditEvent">Cancelar</button>
                        <button class="btn-primary" id="saveEditEvent">Guardar</button>
                    </div>
                </div>
            `;
            document.body.appendChild(modal);
            
            // Bind close handlers
            modal.querySelector('.modal-close').addEventListener('click', () => modal.classList.remove('active'));
            modal.querySelector('.modal-overlay').addEventListener('click', () => modal.classList.remove('active'));
            modal.querySelector('#cancelEditEvent').addEventListener('click', () => modal.classList.remove('active'));
            
            // Type change handler
            modal.querySelector('#editEventType').addEventListener('change', (e) => {
                const type = e.target.value;
                const showTime = ['DH', 'TRN', 'OFI'].includes(type);
                const showDH = type === 'DH';
                modal.querySelectorAll('.edit-time-only').forEach(el => el.style.display = showTime ? 'block' : 'none');
                modal.querySelectorAll('.edit-dh-only').forEach(el => el.style.display = showDH ? 'block' : 'none');
            });
        }
        
        // Populate modal with assignment data
        const start = new Date(assignment.startTime);
        const end = new Date(assignment.endTime);
        
        document.getElementById('editEventType').value = assignment.type;
        document.getElementById('editEventStartDate').value = start.toISOString().split('T')[0];
        document.getElementById('editEventEndDate').value = end.toISOString().split('T')[0];
        document.getElementById('editEventNotes').value = assignment.notes || '';
        
        // Time fields
        const showTime = ['DH', 'TRN', 'OFI'].includes(assignment.type);
        const showDH = assignment.type === 'DH';
        modal.querySelectorAll('.edit-time-only').forEach(el => el.style.display = showTime ? 'block' : 'none');
        modal.querySelectorAll('.edit-dh-only').forEach(el => el.style.display = showDH ? 'block' : 'none');
        
        if (showTime) {
            document.getElementById('editEventStartTime').value = `${String(start.getHours()).padStart(2,'0')}:${String(start.getMinutes()).padStart(2,'0')}`;
            document.getElementById('editEventEndTime').value = `${String(end.getHours()).padStart(2,'0')}:${String(end.getMinutes()).padStart(2,'0')}`;
        }
        
        if (showDH) {
            document.getElementById('editEventOrigin').value = assignment.origin || '';
            document.getElementById('editEventDestination').value = assignment.destination || '';
        }
        
        // Store reference
        modal.dataset.assignmentId = assignment.id;
        modal.dataset.pilotId = pilot.id;
        
        // Bind save handler
        const saveBtn = document.getElementById('saveEditEvent');
        const newSaveBtn = saveBtn.cloneNode(true);
        saveBtn.parentNode.replaceChild(newSaveBtn, saveBtn);
        newSaveBtn.addEventListener('click', () => this.saveEditedEvent(modal, assignment, pilot));
        
        // Bind delete handler
        const deleteBtn = document.getElementById('deleteEventBtn');
        const newDeleteBtn = deleteBtn.cloneNode(true);
        deleteBtn.parentNode.replaceChild(newDeleteBtn, deleteBtn);
        newDeleteBtn.addEventListener('click', () => {
            if (confirm('¿Eliminar este evento?')) {
                const assignments = AppState.assignments.get(pilot.id) || [];
                const idx = assignments.findIndex(a => a.id === assignment.id);
                if (idx !== -1) {
                    assignments.splice(idx, 1);
                    AppState.assignments.set(pilot.id, assignments);
                    Logger.log('delete', `Evento eliminado: ${assignment.type}`, `Piloto: ${pilot.nick || pilot.name}`);
                    Toast.show('success', 'Eliminado', 'Evento eliminado');
                    modal.classList.remove('active');
                    this.renderScheduler();
                }
            }
        });
        
        modal.classList.add('active');
    },
    
    saveEditedEvent(modal, oldAssignment, pilot) {
        const type = document.getElementById('editEventType').value;
        const startDateStr = document.getElementById('editEventStartDate').value;
        const endDateStr = document.getElementById('editEventEndDate').value;
        const notes = document.getElementById('editEventNotes').value;
        
        const [sy, sm, sd] = startDateStr.split('-').map(Number);
        const [ey, em, ed] = endDateStr.split('-').map(Number);
        
        let startDate, endDate;
        
        if (['DH', 'TRN', 'OFI'].includes(type)) {
            const startTime = document.getElementById('editEventStartTime').value || '08:00';
            const endTime = document.getElementById('editEventEndTime').value || '16:00';
            const [sh, smin] = startTime.split(':').map(Number);
            const [eh, emin] = endTime.split(':').map(Number);
            
            startDate = new Date(sy, sm - 1, sd, sh, smin);
            endDate = new Date(ey, em - 1, ed, eh, emin);
        } else {
            startDate = new Date(sy, sm - 1, sd, 0, 0);
            endDate = new Date(ey, em - 1, ed, 23, 59, 59);
        }
        
        // Update assignment
        const assignments = AppState.assignments.get(pilot.id) || [];
        const idx = assignments.findIndex(a => a.id === oldAssignment.id);
        
        if (idx !== -1) {
            const updated = { ...assignments[idx] };
            updated.type = type;
            updated.startTime = startDate;
            updated.endTime = endDate;
            updated.notes = notes;
            
            if (type === 'DH') {
                updated.origin = document.getElementById('editEventOrigin').value.toUpperCase();
                updated.destination = document.getElementById('editEventDestination').value.toUpperCase();
                updated.stHours = Utils.hoursBetween(startDate, endDate);
                updated.dutyHours = updated.stHours;
            } else if (['TRN', 'OFI'].includes(type)) {
                updated.stHours = Utils.hoursBetween(startDate, endDate);
                updated.dutyHours = updated.stHours;
            }
            
            assignments[idx] = updated;
            AppState.assignments.set(pilot.id, assignments);
            
            Logger.log('edit', `Evento editado: ${type}`, `Piloto: ${pilot.nick || pilot.name}, Notas: ${notes || 'N/A'}`);
            Toast.show('success', 'Actualizado', 'Evento actualizado');
            modal.classList.remove('active');
            this.renderScheduler();
        }
    },
    
    showPilotModal(pilotId) {
        const pilot = AppState.pilots.find(p => p.id === pilotId);
        if (!pilot) return;
        
        // Store current pilot for actions
        AppState.selectedPilot = pilotId;
        
        const hours = this.getPilotHours(pilot);
        
        document.getElementById('modalPilotAvatar').textContent = Utils.getInitials(pilot.nick || pilot.name);
        document.getElementById('modalPilotName').textContent = pilot.name;
        document.getElementById('modalPilotId').textContent = pilot.id;
        document.getElementById('modalPilotBase').textContent = pilot.base;
        document.getElementById('modalPilotRole').textContent = pilot.role;
        
        document.getElementById('modalMonthHours').textContent = Math.round(hours.month);
        document.getElementById('modalQ1Hours').textContent = Math.round(hours.q1);
        document.getElementById('modalQ2Hours').textContent = Math.round(hours.q2);
        
        const monthPct = Math.min((hours.month / 90) * 100, 100);
        const q1Pct = Math.min((hours.q1 / 50) * 100, 100);
        const q2Pct = Math.min((hours.q2 / 50) * 100, 100);
        
        document.getElementById('modalMonthBar').style.width = `${monthPct}%`;
        document.getElementById('modalMonthBar').className = 'hours-fill' + (monthPct >= 95 ? ' danger' : monthPct >= 80 ? ' warning' : '');
        document.getElementById('modalQ1Bar').style.width = `${q1Pct}%`;
        document.getElementById('modalQ1Bar').className = 'hours-fill' + (q1Pct >= 95 ? ' danger' : q1Pct >= 80 ? ' warning' : '');
        document.getElementById('modalQ2Bar').style.width = `${q2Pct}%`;
        document.getElementById('modalQ2Bar').className = 'hours-fill' + (q2Pct >= 95 ? ' danger' : q2Pct >= 80 ? ' warning' : '');
        
        document.getElementById('modalTails').innerHTML = pilot.qualifiedTails.map(t => `<span class="tail-badge">${t}</span>`).join('');
        
        const assignments = AppState.assignments.get(pilotId) || [];
        const sorted = [...assignments].sort((a, b) => new Date(a.startTime) - new Date(b.startTime));
        
        // Calculate statistics
        const daysOffTypes = new Set(['OFF', 'VAC', 'FREE', 'LUS', 'INC', 'L']);
        let daysOff = 0;
        let rotations = 0;
        let dhCount = 0;
        let trainingCount = 0;
        
        sorted.forEach(a => {
            if (daysOffTypes.has(a.type)) {
                // Count actual days
                const start = new Date(a.startTime);
                const end = new Date(a.endTime);
                const days = Math.ceil((end - start) / (24 * 60 * 60 * 1000)) + 1;
                daysOff += Math.max(1, days);
            } else if (a.type === 'ROT') {
                rotations++;
            } else if (a.type === 'DH') {
                dhCount++;
            } else if (a.type === 'TRN' || a.type === 'OFI') {
                trainingCount++;
            }
        });
        
        document.getElementById('modalDaysOff').textContent = daysOff;
        document.getElementById('modalRotations').textContent = rotations;
        document.getElementById('modalDH').textContent = dhCount;
        document.getElementById('modalTraining').textContent = trainingCount;
        
        // Reset verification results
        document.getElementById('pilotVerificationResults').style.display = 'none';
        document.getElementById('pilotVerificationResults').innerHTML = '';
        
        let html = '';
        sorted.forEach((a, idx) => {
            const isNight = a.isNight || (a.type === 'ROT' && Utils.isNightRotation(a.startTime, a.endTime));
            const preloadedBadge = a.preloaded ? '<span class="preloaded-badge">DB</span>' : '';
            let gapHTML = '';
            if (idx > 0) {
                const prev = sorted[idx - 1];
                const gap = Utils.hoursBetween(prev.endTime, a.startTime);
                gapHTML = `<span class="assignment-gap">${Utils.formatHours(gap)}</span>`;
            }
            html += `<div class="assignment-item">
                <div class="assignment-type ${a.type} ${isNight ? 'night' : ''}"></div>
                <div class="assignment-info">
                    <div class="assignment-label">${a.type === 'ROT' ? `${a.role || ''} ${a.route || ''}` : a.type === 'DH' ? `DH ${a.origin}→${a.destination}` : a.type} ${preloadedBadge}</div>
                    <div class="assignment-date">${Utils.formatDate(a.startTime, 'full')} - ${Utils.formatDate(a.endTime, 'full')}</div>
                </div>
                ${gapHTML}
            </div>`;
        });
        
        document.getElementById('modalAssignments').innerHTML = html || '<div style="color:var(--text-muted);font-size:11px;">Sin asignaciones</div>';
        
        // Bind verify button
        const verifyBtn = document.getElementById('verifyPilotBtn');
        if (verifyBtn) {
            const newVerifyBtn = verifyBtn.cloneNode(true);
            verifyBtn.parentNode.replaceChild(newVerifyBtn, verifyBtn);
            newVerifyBtn.addEventListener('click', () => this.verifyPilot(pilotId));
        }
        
        // Bind export button
        const exportBtn = document.getElementById('exportPilotRosterBtn');
        if (exportBtn) {
            const newExportBtn = exportBtn.cloneNode(true);
            exportBtn.parentNode.replaceChild(newExportBtn, exportBtn);
            newExportBtn.addEventListener('click', () => this.exportPilotRoster(pilotId));
        }
        
        // Bind clear assignments button
        const clearBtn = document.getElementById('clearPilotAssignments');
        if (clearBtn) {
            const newClearBtn = clearBtn.cloneNode(true);
            clearBtn.parentNode.replaceChild(newClearBtn, clearBtn);
            newClearBtn.addEventListener('click', () => this.clearPilotAssignments(pilotId));
        }
        
        document.getElementById('pilotModal').classList.add('active');
    },
    
    verifyPilot(pilotId) {
        const pilot = AppState.pilots.find(p => p.id === pilotId);
        if (!pilot) return;
        
        const issues = [];
        const assignments = AppState.assignments.get(pilotId) || [];
        const sorted = [...assignments].sort((a, b) => new Date(a.startTime) - new Date(b.startTime));
        
        const operationalTypes = new Set(['ROT', 'DH', 'TRN', 'OFI']);
        const nonOperationalTypes = new Set(['OFF', 'VAC', 'FREE', 'LUS', 'INC', 'L']);
        
        // Track consecutive assignment days
        let consecutiveDays = 0;
        let lastAssignmentDate = null;
        
        // Track consecutive days outside base
        let daysOutsideBase = 0;
        let lastOutsideDate = null;
        let currentLocation = pilot.base;
        
        // Process assignments
        sorted.forEach((a, idx) => {
            const date = new Date(a.startTime);
            const dateStr = `${date.getDate()}/${date.getMonth() + 1}`;
            
            // Reset counters on non-operational days
            if (nonOperationalTypes.has(a.type)) {
                consecutiveDays = 0;
                lastAssignmentDate = null;
                // Location resets to base after days off
                currentLocation = pilot.base;
                daysOutsideBase = 0;
                lastOutsideDate = null;
                return;
            }
            
            // Track consecutive operational days
            if (operationalTypes.has(a.type)) {
                if (lastAssignmentDate) {
                    const dayDiff = Math.round((date - lastAssignmentDate) / (24 * 60 * 60 * 1000));
                    if (dayDiff <= 1) {
                        consecutiveDays++;
                    } else {
                        consecutiveDays = 1;
                    }
                } else {
                    consecutiveDays = 1;
                }
                lastAssignmentDate = date;
                
                // Check >6 consecutive days
                if (consecutiveDays > 6) {
                    issues.push({
                        type: 'warning',
                        message: `[${dateStr}] ${consecutiveDays} días consecutivos con asignación operacional (máx: 6)`
                    });
                }
            }
            
            // Track location and days outside base
            if (a.destination) {
                currentLocation = a.destination;
            }
            
            if (currentLocation !== pilot.base) {
                if (lastOutsideDate) {
                    const dayDiff = Math.round((date - lastOutsideDate) / (24 * 60 * 60 * 1000));
                    if (dayDiff <= 1) {
                        daysOutsideBase++;
                    } else {
                        daysOutsideBase = 1;
                    }
                } else {
                    daysOutsideBase = 1;
                }
                lastOutsideDate = date;
                
                // Check >6 days outside base
                if (daysOutsideBase > 6) {
                    issues.push({
                        type: 'warning',
                        message: `[${dateStr}] ${daysOutsideBase} días fuera de base ${pilot.base} (en ${currentLocation})`
                    });
                }
            } else {
                daysOutsideBase = 0;
                lastOutsideDate = null;
            }
            
            // Check geographic continuity
            if (a.type === 'ROT' && a.origin && a.origin !== currentLocation) {
                // Check if there was a DH before
                let foundDH = false;
                for (let k = idx - 1; k >= 0; k--) {
                    if (nonOperationalTypes.has(sorted[k].type)) break;
                    if (sorted[k].type === 'DH' && sorted[k].destination === a.origin) {
                        foundDH = true;
                        break;
                    }
                }
                if (!foundDH) {
                    issues.push({
                        type: 'warning',
                        message: `[${dateStr}] Continuidad: piloto en ${currentLocation}, vuelo desde ${a.origin}`
                    });
                }
            }
            
            // Check rest between operational assignments
            if (idx > 0 && operationalTypes.has(a.type)) {
                let prevOp = null;
                for (let k = idx - 1; k >= 0; k--) {
                    if (operationalTypes.has(sorted[k].type)) {
                        prevOp = sorted[k];
                        break;
                    }
                    if (nonOperationalTypes.has(sorted[k].type)) break;
                }
                
                if (prevOp) {
                    const restRequired = prevOp.destination === pilot.base ? (prevOp.restBase || 10) : (prevOp.restAway || 12);
                    const actualRest = Utils.hoursBetween(prevOp.endTime, a.startTime);
                    
                    if (actualRest < restRequired) {
                        issues.push({
                            type: 'error',
                            message: `[${dateStr}] Descanso insuficiente: ${actualRest.toFixed(1)}h < ${restRequired}h requeridas`
                        });
                    }
                }
            }
        });
        
        // Display results
        const container = document.getElementById('pilotVerificationResults');
        
        if (issues.length === 0) {
            container.innerHTML = `
                <div class="verification-status ok">
                    ✅ Sin problemas detectados
                </div>
                <div style="font-size:10px;color:var(--text-muted);">
                    Continuidad geográfica, días consecutivos y descansos verificados.
                </div>
            `;
        } else {
            const errors = issues.filter(i => i.type === 'error');
            const warnings = issues.filter(i => i.type === 'warning');
            
            container.innerHTML = `
                <div class="verification-status ${errors.length > 0 ? 'error' : 'warning'}">
                    ${errors.length > 0 ? '❌' : '⚠️'} ${issues.length} ${issues.length === 1 ? 'problema' : 'problemas'} detectados
                    (${errors.length} errores, ${warnings.length} advertencias)
                </div>
                <div class="verification-issues">
                    ${issues.map(i => `
                        <div class="verification-issue ${i.type}">
                            <span class="verification-issue-icon">${i.type === 'error' ? '❌' : '⚠️'}</span>
                            <span class="verification-issue-text">${i.message}</span>
                        </div>
                    `).join('')}
                </div>
            `;
        }
        
        container.style.display = 'block';
    },
    
    exportPilotRoster(pilotId) {
        const pilot = AppState.pilots.find(p => p.id === pilotId);
        if (!pilot) return;
        
        const { year, month } = AppState.currentPeriod;
        const assignments = AppState.assignments.get(pilotId) || [];
        const sorted = [...assignments].sort((a, b) => new Date(a.startTime) - new Date(b.startTime));
        
        // Create workbook
        const wb = XLSX.utils.book_new();
        
        // Header info
        const rosterData = [];
        rosterData.push({ 'A': `ROSTER - ${pilot.name}`, 'B': '', 'C': '', 'D': '', 'E': '', 'F': '' });
        rosterData.push({ 'A': 'Período:', 'B': `${Utils.getMonthName(month)} ${year}`, 'C': 'Base:', 'D': pilot.base, 'E': 'Rol:', 'F': pilot.role });
        rosterData.push({ 'A': 'ID:', 'B': pilot.id, 'C': '', 'D': '', 'E': '', 'F': '' });
        rosterData.push({});
        rosterData.push({ 'A': 'FECHA', 'B': 'TIPO', 'C': 'RUTA', 'D': 'INICIO', 'E': 'FIN', 'F': 'FT', 'G': 'NOTAS' });
        
        sorted.forEach(a => {
            const startDate = new Date(a.startTime);
            const endDate = new Date(a.endTime);
            rosterData.push({
                'A': startDate.toLocaleDateString('es-CO'),
                'B': a.type,
                'C': a.route || (a.origin && a.destination ? `${a.origin}-${a.destination}` : ''),
                'D': `${String(startDate.getHours()).padStart(2,'0')}:${String(startDate.getMinutes()).padStart(2,'0')}`,
                'E': `${String(endDate.getHours()).padStart(2,'0')}:${String(endDate.getMinutes()).padStart(2,'0')}`,
                'F': a.ftHours?.toFixed(2) || '',
                'G': a.notes || ''
            });
        });
        
        const ws = XLSX.utils.json_to_sheet(rosterData, { skipHeader: true });
        XLSX.utils.book_append_sheet(wb, ws, 'Roster');
        
        const filename = `Roster_${pilot.id}_${month}_${year}.xlsx`;
        XLSX.writeFile(wb, filename);
        
        Toast.show('success', 'Exportado', `Roster de ${pilot.nick || pilot.name} exportado`);
        Logger.log('export', `Roster exportado: ${pilot.name}`, `Período: ${month}/${year}`);
    },
    
    clearPilotAssignments(pilotId) {
        const pilot = AppState.pilots.find(p => p.id === pilotId);
        if (!pilot) return;
        
        const assignments = AppState.assignments.get(pilotId) || [];
        
        // Keep only preloaded events, remove ROT and DH
        const toRemove = assignments.filter(a => a.type === 'ROT' || a.type === 'DH');
        const toKeep = assignments.filter(a => a.preloaded === true);
        
        // Return slots to pool
        toRemove.forEach(a => {
            if (a.slotId) {
                const slot = AppState.slots.find(s => s.id === a.slotId);
                if (slot) {
                    slot.pilotId = null;
                    slot.pilotName = null;
                }
            }
        });
        
        // Reset pilot FT counters
        pilot.ftByMonth = {};
        pilot.ftByFortnight = {};
        pilot.currentLocation = pilot.base;
        
        AppState.assignments.set(pilotId, toKeep);
        
        Toast.show('success', 'Limpiado', `Se eliminaron ${toRemove.length} asignaciones de ${pilot.nick || pilot.name}`);
        this.closeAllModals();
        this.renderCurrentView();
    },
    
    openCreateEventModal(pilotId, dateStr) {
        AppState.selectedPilot = pilotId;
        document.getElementById('eventStartDate').value = dateStr;
        document.getElementById('eventEndDate').value = dateStr;
        
        const rotSelect = document.getElementById('eventRotation');
        rotSelect.innerHTML = '<option value="">Seleccionar...</option>' +
            AppState.slots.filter(s => !s.pilotId).map(s => `<option value="${s.id}">${s.rotation?.id || ''} - ${s.rotation?.route || ''} (${s.role})</option>`).join('');
        
        const stations = [...CONFIG.VALID_BASES].sort();
        const stationOptions = stations.map(s => `<option value="${s}">${s}</option>`).join('');
        document.getElementById('dhOrigin').innerHTML = stationOptions;
        document.getElementById('dhDestination').innerHTML = stationOptions;
        
        document.getElementById('assignmentModal').classList.add('active');
    },
    
    saveEvent() {
        const pilotId = AppState.selectedPilot;
        const pilot = AppState.pilots.find(p => p.id === pilotId);
        if (!pilot) return;
        
        const eventType = document.querySelector('.event-type.active').dataset.type;
        
        // Parse dates correctly using local time
        const startDateStr = document.getElementById('eventStartDate').value;
        const endDateStr = document.getElementById('eventEndDate').value;
        
        const [sy, sm, sd] = startDateStr.split('-').map(Number);
        const [ey, em, ed] = endDateStr.split('-').map(Number);
        
        if (eventType === 'ROT') {
            const slotId = document.getElementById('eventRotation').value;
            if (!slotId) { Toast.show('error', 'Error', 'Selecciona una rotación'); return; }
            const slot = AppState.slots.find(s => s.id === slotId);
            if (!slot) return;
            
            const validation = PilotValidator.validateAssignment(pilot, slot, true);
            if (!validation.valid) { 
                Toast.show('error', 'Validación', validation.errors.join(', ')); 
                return; 
            }
            
            // If needs DH, add it first
            if (validation.needsDH && validation.dhInfo) {
                const dhDate = PilotValidator.findDHDate(pilot, slot.rotation);
                if (dhDate) {
                    AutoAssigner.registerDH(pilot, validation.dhInfo.origin, validation.dhInfo.destination, dhDate, slot);
                }
            }
            
            AutoAssigner.registerAssignment(pilot, slot);
            Logger.log('assign', `Rotación asignada: ${slot.rotation.id}`, `Piloto: ${pilot.nick || pilot.name}, Ruta: ${slot.rotation.route}`);
            Toast.show('success', 'Asignado', `${slot.rotation.id} asignada`);
        } else if (eventType === 'DH') {
            // DH with specific times and flight time
            const deptTimeStr = document.getElementById('dhDeptTime').value;
            const arvlTimeStr = document.getElementById('dhArvlTime').value;
            const ftHours = parseFloat(document.getElementById('dhFlightTime').value) || 0;
            const stHours = parseFloat(document.getElementById('dhServiceTime').value) || 0;
            
            const [deptH, deptM] = deptTimeStr.split(':').map(Number);
            const [arvlH, arvlM] = arvlTimeStr.split(':').map(Number);
            
            const startDate = new Date(sy, sm - 1, sd, deptH, deptM, 0, 0);
            const endDate = new Date(ey, em - 1, ed, arvlH, arvlM, 0, 0);
            
            // Use user-provided Service Time
            const dutyHours = stHours > 0 ? stHours : Utils.hoursBetween(startDate, endDate);
            
            // Validate daily duty limits before adding DH
            const existingDuty = PilotValidator.getDailyDuty(pilot, startDate);
            const existingFT = PilotValidator.getDailyFT(pilot, startDate);
            
            // Check if adding this DH would exceed limits
            const isNight = deptH < 6 || deptH >= 22 || arvlH < 6 || arvlH >= 22;
            const stLimit = isNight ? CONFIG.LIMITS.CREW_2.ST_NIGHT : CONFIG.LIMITS.CREW_2.ST_DAY;
            const ftLimit = CONFIG.LIMITS.CREW_2.FT;
            
            if (existingDuty + dutyHours > stLimit) {
                Toast.show('error', 'Excede Duty', `Duty diario: ${(existingDuty + dutyHours).toFixed(1)}h > ${stLimit}h`);
                return;
            }
            
            if (existingFT + ftHours > ftLimit) {
                Toast.show('error', 'Excede FT', `FT diario: ${(existingFT + ftHours).toFixed(1)}h > ${ftLimit}h`);
                return;
            }
            
            // Calculate required rest based on FT
            const restBase = ftHours <= 4 ? 8 : ftHours <= 9 ? 10 : ftHours <= 12 ? 12 : ftHours <= 14 ? 14 : 16;
            const restAway = ftHours <= 4 ? 10 : ftHours <= 9 ? 12 : ftHours <= 12 ? 18 : 24;
            
            const assignment = {
                type: 'DH',
                id: Utils.generateId('DH-'),
                origin: document.getElementById('dhOrigin').value,
                destination: document.getElementById('dhDestination').value,
                startTime: startDate,
                endTime: endDate,
                ftHours: ftHours,
                dutyHours: dutyHours,
                stHours: dutyHours, // For consistency with ROT
                restBase: restBase,
                restAway: restAway,
                notes: document.getElementById('eventNotes').value
            };
            
            const assignments = AppState.assignments.get(pilotId) || [];
            assignments.push(assignment);
            assignments.sort((a, b) => new Date(a.startTime) - new Date(b.startTime));
            AppState.assignments.set(pilotId, assignments);
            
            // Update pilot FT counters
            if (ftHours > 0) {
                const month = startDate.getMonth();
                const year = startDate.getFullYear();
                const day = startDate.getDate();
                const monthKey = `${year}-${month}`;
                const fortnightKey = `${year}-${month}-${day <= 15 ? 1 : 2}`;
                pilot.ftByMonth[monthKey] = (pilot.ftByMonth[monthKey] || 0) + ftHours;
                pilot.ftByFortnight[fortnightKey] = (pilot.ftByFortnight[fortnightKey] || 0) + ftHours;
            }
            
            // Update pilot location
            pilot.currentLocation = assignment.destination;
            
            Logger.log('create', `DH creado: ${assignment.origin}→${assignment.destination}`, `Piloto: ${pilot.nick || pilot.name}, Duty: ${dutyHours.toFixed(1)}h`);
            Toast.show('success', 'Creado', `DH ${assignment.origin}→${assignment.destination} (${dutyHours.toFixed(1)}h duty, ${ftHours}h FT)`);
        } else if (eventType === 'TRN' || eventType === 'OFI') {
            // Training and Office with specific times
            const startTimeStr = document.getElementById('trnStartTime').value;
            const endTimeStr = document.getElementById('trnEndTime').value;
            
            const [startH, startM] = startTimeStr.split(':').map(Number);
            const [endH, endM] = endTimeStr.split(':').map(Number);
            
            const startDate = new Date(sy, sm - 1, sd, startH, startM, 0, 0);
            const endDate = new Date(ey, em - 1, ed, endH, endM, 0, 0);
            
            // Calculate duty time
            const dutyHours = Utils.hoursBetween(startDate, endDate);
            
            // Calculate required rest based on duty
            const restBase = dutyHours <= 6 ? 10 : dutyHours <= 9 ? 10 : 12;
            const restAway = restBase + 2;
            
            const assignment = {
                type: eventType,
                id: Utils.generateId(eventType + '-'),
                startTime: startDate,
                endTime: endDate,
                stHours: dutyHours,
                dutyHours: dutyHours,
                ftHours: 0, // No flight time for TRN/OFI
                restBase: restBase,
                restAway: restAway,
                notes: document.getElementById('eventNotes').value,
                origin: pilot.base,
                destination: pilot.base
            };
            
            const assignments = AppState.assignments.get(pilotId) || [];
            assignments.push(assignment);
            assignments.sort((a, b) => new Date(a.startTime) - new Date(b.startTime));
            AppState.assignments.set(pilotId, assignments);
            Logger.log('create', `${eventType} creado`, `Piloto: ${pilot.nick || pilot.name}, Duty: ${dutyHours.toFixed(1)}h`);
            Toast.show('success', 'Creado', `${eventType} agregado (${dutyHours.toFixed(1)}h duty)`);
        } else {
            // Non-operational types (OFF, VAC, LUS, FREE, INC)
            const startDate = new Date(sy, sm - 1, sd, 0, 0, 0, 0);
            const endDate = new Date(ey, em - 1, ed, 23, 59, 59, 999);
            
            const assignment = {
                type: eventType,
                id: Utils.generateId(eventType + '-'),
                startTime: startDate,
                endTime: endDate,
                notes: document.getElementById('eventNotes').value,
                // Non-operational types don't need rest calculation
                restBase: 0,
                restAway: 0
            };
            
            const assignments = AppState.assignments.get(pilotId) || [];
            assignments.push(assignment);
            assignments.sort((a, b) => new Date(a.startTime) - new Date(b.startTime));
            AppState.assignments.set(pilotId, assignments);
            Logger.log('create', `${eventType} creado`, `Piloto: ${pilot.nick || pilot.name}`);
            Toast.show('success', 'Creado', `${eventType} agregado`);
        }
        
        this.closeAllModals();
        this.renderCurrentView();
    },
    
    showTooltip(e, assignment, pilot, gapValue = 0, gapClass = '', prevAssignment = null) {
        const tooltip = document.getElementById('eventTooltip');
        let content = `<div class="tooltip-header"><span class="tooltip-type">${assignment.type}</span><span class="tooltip-id">${assignment.rotationId || assignment.id || ''}</span></div>`;
        
        // Show gap from previous assignment (only for operational types)
        const operationalTypes = new Set(['ROT', 'DH', 'TRN', 'OFI']);
        if (gapValue > 0 && prevAssignment && operationalTypes.has(prevAssignment.type)) {
            const restReq = prevAssignment.destination === pilot.base ? (prevAssignment.restBase || 10) : (prevAssignment.restAway || 12);
            const gapColorStyle = gapClass === 'gap-danger' ? 'color: #ef4444' : gapClass === 'gap-warning' ? 'color: #f59e0b' : 'color: #10b981';
            content += `<div class="tooltip-row" style="${gapColorStyle};font-weight:700">
                <span class="tooltip-label">⏱ Descanso:</span>
                <span class="tooltip-value">${Utils.formatHours(gapValue)} (req: ${restReq}h)</span>
            </div>`;
        }
        
        if (assignment.type === 'ROT') {
            // Calculate Max ST based on departure hour and crew size
            const deptHour = new Date(assignment.startTime).getHours() + new Date(assignment.startTime).getMinutes() / 60;
            const isDayWindow = deptHour >= CONFIG.DAY_WINDOW.start && deptHour <= CONFIG.DAY_WINDOW.end;
            const crew = assignment.crew || 2;
            
            let maxST;
            if (crew >= 4) maxST = isDayWindow ? CONFIG.LIMITS.CREW_4.ST_DAY : CONFIG.LIMITS.CREW_4.ST_NIGHT;
            else if (crew >= 3) maxST = isDayWindow ? CONFIG.LIMITS.CREW_3.ST_DAY : CONFIG.LIMITS.CREW_3.ST_NIGHT;
            else maxST = isDayWindow ? CONFIG.LIMITS.CREW_2.ST_DAY : CONFIG.LIMITS.CREW_2.ST_NIGHT;
            
            const stGap = maxST - (assignment.stHours || 0);
            const stGapColor = stGap < 0 ? '#ef4444' : stGap < 1 ? '#f59e0b' : '#10b981';
            const windowType = isDayWindow ? 'Día' : 'Noche';
            
            content += `<div class="tooltip-row"><span class="tooltip-label">Ruta:</span><span class="tooltip-value">${assignment.route || ''}</span></div>
                <div class="tooltip-row"><span class="tooltip-label">Aeronave:</span><span class="tooltip-value" style="color:#ef4444;font-weight:700">${assignment.tail || 'N/A'}</span></div>
                <div class="tooltip-row"><span class="tooltip-label">Salida:</span><span class="tooltip-value">${Utils.formatDate(assignment.startTime, 'full')}</span></div>
                <div class="tooltip-row"><span class="tooltip-label">Llegada:</span><span class="tooltip-value">${Utils.formatDate(assignment.endTime, 'full')}</span></div>
                <div class="tooltip-row"><span class="tooltip-label">Tripulación:</span><span class="tooltip-value">${crew} pilotos (${windowType})</span></div>
                <div class="tooltip-row"><span class="tooltip-label">FT:</span><span class="tooltip-value">${assignment.ftHours?.toFixed(2) || '-'}h</span></div>
                <div class="tooltip-row"><span class="tooltip-label">ST:</span><span class="tooltip-value">${assignment.stHours?.toFixed(2) || '-'}h</span></div>
                <div class="tooltip-row"><span class="tooltip-label">Max ST:</span><span class="tooltip-value">${maxST}h</span></div>
                <div class="tooltip-row"><span class="tooltip-label">ST Gap:</span><span class="tooltip-value" style="color:${stGapColor};font-weight:700">${stGap.toFixed(2)}h</span></div>
                <div class="tooltip-row"><span class="tooltip-label">Rest Base/Away:</span><span class="tooltip-value">${assignment.restBase || '-'}h / ${assignment.restAway || '-'}h</span></div>`;
        } else if (assignment.type === 'DH') {
            content += `<div class="tooltip-row"><span class="tooltip-label">Ruta:</span><span class="tooltip-value">${assignment.origin} → ${assignment.destination}</span></div>
                <div class="tooltip-row"><span class="tooltip-label">Salida:</span><span class="tooltip-value">${Utils.formatDate(assignment.startTime, 'time')}</span></div>
                <div class="tooltip-row"><span class="tooltip-label">Llegada:</span><span class="tooltip-value">${Utils.formatDate(assignment.endTime, 'time')}</span></div>
                <div class="tooltip-row"><span class="tooltip-label">FT:</span><span class="tooltip-value">${assignment.ftHours?.toFixed(2) || '0'}h</span></div>
                <div class="tooltip-row"><span class="tooltip-label">Duty:</span><span class="tooltip-value">${assignment.dutyHours?.toFixed(2) || assignment.stHours?.toFixed(2) || '-'}h</span></div>`;
        }
        
        tooltip.innerHTML = content;
        tooltip.style.left = (e.clientX + 15) + 'px';
        tooltip.style.top = (e.clientY + 15) + 'px';
        tooltip.classList.add('active');
    },
    
    hideTooltip() {
        document.getElementById('eventTooltip').classList.remove('active');
    },
    
    showContextMenu(e, assignment, pilotId) {
        const menu = document.getElementById('contextMenu');
        menu.style.left = `${e.clientX}px`;
        menu.style.top = `${e.clientY}px`;
        menu.classList.add('active');
        
        AppState.selectedEvent = { assignment, pilotId };
        
        const closeMenu = (ev) => { if (!menu.contains(ev.target)) { menu.classList.remove('active'); document.removeEventListener('click', closeMenu); } };
        setTimeout(() => document.addEventListener('click', closeMenu), 0);
        
        menu.querySelector('[data-action="unassign"]').onclick = () => { this.unassignEvent(assignment, pilotId); menu.classList.remove('active'); };
        menu.querySelector('[data-action="delete"]').onclick = () => { this.deleteEvent(assignment, pilotId); menu.classList.remove('active'); };
    },
    
    unassignEvent(assignment, pilotId) {
        if (assignment.type === 'ROT' && assignment.slotId) {
            const slot = AppState.slots.find(s => s.id === assignment.slotId);
            if (slot) {
                AutoAssigner.unassignSlot(slot);
                Toast.show('success', 'Desasignado', 'Rotación devuelta al pool');
            }
        }
        this.renderCurrentView();
    },
    
    deleteEvent(assignment, pilotId) {
        const assignments = AppState.assignments.get(pilotId) || [];
        const idx = assignments.findIndex(a => (a.slotId || a.id) === (assignment.slotId || assignment.id));
        if (idx > -1) {
            const removed = assignments.splice(idx, 1)[0];
            
            if (removed.slotId) {
                const slot = AppState.slots.find(s => s.id === removed.slotId);
                if (slot) { slot.pilotId = null; slot.pilotName = null; }
            }
            
            // Update FT
            if (removed.type === 'ROT' && removed.ftHours) {
                const pilot = AppState.pilots.find(p => p.id === pilotId);
                if (pilot) {
                    const start = new Date(removed.startTime);
                    const monthKey = `${start.getFullYear()}-${start.getMonth()}`;
                    const fortnightKey = `${start.getFullYear()}-${start.getMonth()}-${start.getDate() <= 15 ? 1 : 2}`;
                    pilot.ftByMonth[monthKey] = Math.max(0, (pilot.ftByMonth[monthKey] || 0) - removed.ftHours);
                    pilot.ftByFortnight[fortnightKey] = Math.max(0, (pilot.ftByFortnight[fortnightKey] || 0) - removed.ftHours);
                }
            }
            
            Toast.show('success', 'Eliminado', 'Evento eliminado');
            this.renderCurrentView();
        }
    },
    
    bindDragAndDrop() {
        document.addEventListener('dragstart', (e) => {
            if (e.target.classList.contains('event-block')) {
                e.target.classList.add('dragging');
                AppState.draggedEvent = { assignmentId: e.target.dataset.assignmentId, pilotId: e.target.dataset.pilotId, type: e.target.dataset.type };
                e.dataTransfer.effectAllowed = 'move';
            }
        });
        
        document.addEventListener('dragend', (e) => {
            if (e.target.classList.contains('event-block') || e.target.classList.contains('unassigned-slot')) e.target.classList.remove('dragging');
            document.querySelectorAll('.drop-target, .drop-invalid').forEach(el => el.classList.remove('drop-target', 'drop-invalid'));
            AppState.draggedSlot = null;
            AppState.draggedEvent = null;
        });
        
        document.addEventListener('dragover', (e) => {
            const cell = e.target.closest('.calendar-cell');
            const row = e.target.closest('.calendar-row');
            if (cell && row && (AppState.draggedSlot || AppState.draggedEvent)) {
                e.preventDefault();
                const targetPilotId = row.dataset.pilotId;
                const pilot = AppState.pilots.find(p => p.id === targetPilotId);
                
                let isValid = true;
                if (AppState.draggedSlot && pilot) {
                    const validation = PilotValidator.validateAssignment(pilot, AppState.draggedSlot, true);
                    isValid = validation.valid;
                }
                
                cell.classList.remove('drop-target', 'drop-invalid');
                cell.classList.add(isValid ? 'drop-target' : 'drop-invalid');
            }
        });
        
        document.addEventListener('dragleave', (e) => {
            const cell = e.target.closest('.calendar-cell');
            if (cell) cell.classList.remove('drop-target', 'drop-invalid');
        });
        
        document.addEventListener('drop', (e) => {
            const cell = e.target.closest('.calendar-cell');
            const row = e.target.closest('.calendar-row');
            if (!cell || !row) return;
            
            e.preventDefault();
            cell.classList.remove('drop-target', 'drop-invalid');
            
            const targetPilotId = row.dataset.pilotId;
            const targetPilot = AppState.pilots.find(p => p.id === targetPilotId);
            if (!targetPilot) return;
            
            if (AppState.draggedSlot) {
                const slot = AppState.draggedSlot;
                const validation = PilotValidator.validateAssignment(targetPilot, slot, true);
                if (!validation.valid) { Toast.show('error', 'No válido', validation.errors.join(', ')); return; }
                
                // Add DH if needed
                if (validation.needsDH && validation.dhInfo) {
                    const dhDate = PilotValidator.findDHDate(targetPilot, slot.rotation);
                    if (dhDate) {
                        AutoAssigner.registerDH(targetPilot, validation.dhInfo.origin, validation.dhInfo.destination, dhDate, slot);
                    }
                }
                
                AutoAssigner.registerAssignment(targetPilot, slot);
                Toast.show('success', 'Asignado', `${slot.rotation.id} asignada`);
                this.renderCurrentView();
            } else if (AppState.draggedEvent) {
                const { assignmentId, pilotId: sourcePilotId, type } = AppState.draggedEvent;
                if (sourcePilotId === targetPilotId) return;
                
                const sourceAssignments = AppState.assignments.get(sourcePilotId) || [];
                const assignment = sourceAssignments.find(a => (a.slotId || a.id) === assignmentId);
                if (!assignment) return;
                
                if (type === 'ROT') {
                    const slot = AppState.slots.find(s => s.id === assignment.slotId);
                    if (!slot) return;
                    
                    const validation = PilotValidator.validateAssignment(targetPilot, slot, true, assignment.slotId);
                    if (!validation.valid) { Toast.show('error', 'No válido', validation.errors.join(', ')); return; }
                    
                    AutoAssigner.unassignSlot(slot);
                    
                    if (validation.needsDH && validation.dhInfo) {
                        const dhDate = PilotValidator.findDHDate(targetPilot, slot.rotation);
                        if (dhDate) {
                            AutoAssigner.registerDH(targetPilot, validation.dhInfo.origin, validation.dhInfo.destination, dhDate, slot);
                        }
                    }
                    
                    AutoAssigner.registerAssignment(targetPilot, slot);
                    Toast.show('success', 'Movido', `Rotación reasignada`);
                } else {
                    const idx = sourceAssignments.findIndex(a => a.id === assignmentId);
                    if (idx > -1) {
                        sourceAssignments.splice(idx, 1);
                        const targetAssignments = AppState.assignments.get(targetPilotId) || [];
                        targetAssignments.push(assignment);
                        targetAssignments.sort((a, b) => new Date(a.startTime) - new Date(b.startTime));
                        AppState.assignments.set(targetPilotId, targetAssignments);
                        Toast.show('success', 'Movido', `${type} reasignado`);
                    }
                }
                this.renderCurrentView();
            }
        });
    },
    
    // ========== CONFIGURATION FUNCTIONS ==========
    
    bindConfig() {
        // Add base button
        document.getElementById('addBaseBtn')?.addEventListener('click', () => this.addBase());
        document.getElementById('newBaseInput')?.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.addBase();
        });
        
        // Add holiday button
        document.getElementById('addHolidayBtn')?.addEventListener('click', () => this.addHoliday());
        document.getElementById('newHolidayName')?.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.addHoliday();
        });
        
        // Load holidays on init
        this.loadHolidays();
        
        // Add leg button
        document.getElementById('addLegBtn')?.addEventListener('click', () => this.addLeg());
        
        // Create rotation button
        document.getElementById('createRotationBtn')?.addEventListener('click', () => this.createManualRotation());
        
        // UTC toggle for calendar
        document.getElementById('calendarUtcToggle')?.addEventListener('change', (e) => {
            AppState.showUTC = e.target.checked;
            this.renderScheduler();
        });
    },
    
    renderConfig() {
        this.renderBasesList();
        this.renderHolidaysList();
        this.updateSystemStatus();
    },
    
    renderHolidaysList() {
        const container = document.getElementById('holidaysList');
        if (!container) return;
        
        // Load holidays from localStorage
        this.loadHolidays();
        
        if (AppState.holidays.size === 0) {
            container.innerHTML = '<div class="empty-state" style="font-size:11px;color:var(--text-muted)">No hay festivos configurados</div>';
            return;
        }
        
        const sortedHolidays = [...AppState.holidays.entries()].sort((a, b) => a[0].localeCompare(b[0]));
        
        container.innerHTML = sortedHolidays.map(([date, name]) => {
            const d = new Date(date + 'T12:00:00');
            const dateStr = d.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' });
            return `<div class="holiday-item" data-date="${date}">
                <span class="holiday-date">${dateStr}</span>
                <span class="holiday-name">${name}</span>
                <button class="remove-holiday">×</button>
            </div>`;
        }).join('');
        
        // Bind remove buttons
        container.querySelectorAll('.remove-holiday').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const date = e.target.closest('.holiday-item').dataset.date;
                this.removeHoliday(date);
            });
        });
    },
    
    loadHolidays() {
        try {
            const saved = localStorage.getItem('flexcrew-holidays');
            if (saved) {
                const holidays = JSON.parse(saved);
                AppState.holidays = new Map(Object.entries(holidays));
            }
        } catch (e) { console.error('Error loading holidays:', e); }
    },
    
    saveHolidays() {
        const obj = Object.fromEntries(AppState.holidays);
        localStorage.setItem('flexcrew-holidays', JSON.stringify(obj));
    },
    
    addHoliday() {
        const dateInput = document.getElementById('newHolidayDate');
        const nameInput = document.getElementById('newHolidayName');
        
        const date = dateInput.value;
        const name = nameInput.value.trim();
        
        if (!date) {
            Toast.show('error', 'Error', 'Seleccione una fecha');
            return;
        }
        if (!name) {
            Toast.show('error', 'Error', 'Ingrese el nombre del festivo');
            return;
        }
        
        if (AppState.holidays.has(date)) {
            Toast.show('warning', 'Existe', 'Ya existe un festivo en esa fecha');
            return;
        }
        
        AppState.holidays.set(date, name);
        this.saveHolidays();
        
        dateInput.value = '';
        nameInput.value = '';
        
        this.renderHolidaysList();
        Logger.log('create', `Festivo añadido: ${name}`, `Fecha: ${date}`);
        Toast.show('success', 'Agregado', `Festivo "${name}" agregado`);
    },
    
    removeHoliday(date) {
        const name = AppState.holidays.get(date);
        AppState.holidays.delete(date);
        this.saveHolidays();
        this.renderHolidaysList();
        Logger.log('delete', `Festivo eliminado: ${name}`, `Fecha: ${date}`);
        Toast.show('success', 'Eliminado', 'Festivo eliminado');
    },
    
    renderBasesList() {
        const container = document.getElementById('basesList');
        if (!container) return;
        
        container.innerHTML = [...AppState.validBases].sort().map(base => 
            `<span class="base-tag">
                ${base}
                <button class="remove-base" data-base="${base}">×</button>
            </span>`
        ).join('');
        
        // Bind remove buttons
        container.querySelectorAll('.remove-base').forEach(btn => {
            btn.addEventListener('click', () => this.removeBase(btn.dataset.base));
        });
    },
    
    addBase() {
        const input = document.getElementById('newBaseInput');
        const code = input.value.trim().toUpperCase();
        
        if (!code || code.length < 2 || code.length > 4) {
            Toast.show('error', 'Error', 'Código de base inválido (2-4 caracteres)');
            return;
        }
        
        if (AppState.validBases.has(code)) {
            Toast.show('warning', 'Existe', `La base ${code} ya está en la lista`);
            return;
        }
        
        AppState.validBases.add(code);
        input.value = '';
        this.renderBasesList();
        this.updateSystemStatus();
        Toast.show('success', 'Agregada', `Base ${code} agregada`);
    },
    
    removeBase(code) {
        if (AppState.validBases.size <= 1) {
            Toast.show('error', 'Error', 'Debe haber al menos una base');
            return;
        }
        
        AppState.validBases.delete(code);
        this.renderBasesList();
        this.updateSystemStatus();
        Toast.show('success', 'Eliminada', `Base ${code} eliminada`);
    },
    
    addLeg() {
        const container = document.getElementById('manualLegs');
        const today = new Date().toISOString().split('T')[0];
        
        const legDiv = document.createElement('div');
        legDiv.className = 'leg-item';
        legDiv.innerHTML = `
            <input type="text" placeholder="Origen" class="leg-origin" maxlength="4">
            <span>→</span>
            <input type="text" placeholder="Destino" class="leg-dest" maxlength="4">
            <input type="date" class="leg-date" value="${today}">
            <input type="time" class="leg-dept" value="06:00">
            <input type="time" class="leg-arvl" value="10:00">
            <button class="btn-remove-leg">✕</button>
        `;
        
        legDiv.querySelector('.btn-remove-leg').addEventListener('click', () => legDiv.remove());
        container.appendChild(legDiv);
    },
    
    createManualRotation() {
        const rotId = document.getElementById('manualRotId').value.trim() || `ROT-M${Date.now()}`;
        const tail = document.getElementById('manualRotTail').value.trim() || 'N/A';
        
        const legItems = document.querySelectorAll('#manualLegs .leg-item');
        const legs = [];
        
        legItems.forEach(item => {
            const origin = item.querySelector('.leg-origin').value.trim().toUpperCase();
            const dest = item.querySelector('.leg-dest').value.trim().toUpperCase();
            const dateStr = item.querySelector('.leg-date').value;
            const deptTime = item.querySelector('.leg-dept').value;
            const arvlTime = item.querySelector('.leg-arvl').value;
            
            if (origin && dest && dateStr && deptTime && arvlTime) {
                legs.push({ origin, dest, dateStr, deptTime, arvlTime });
            }
        });
        
        if (legs.length === 0) {
            Toast.show('error', 'Error', 'Agrega al menos un tramo válido');
            return;
        }
        
        // Validate: first leg origin and last leg dest should be valid bases
        const firstOrigin = legs[0].origin;
        const lastDest = legs[legs.length - 1].dest;
        
        if (!AppState.validBases.has(firstOrigin)) {
            Toast.show('warning', 'Advertencia', `${firstOrigin} no es una base válida`);
        }
        if (!AppState.validBases.has(lastDest)) {
            Toast.show('warning', 'Advertencia', `${lastDest} no es una base válida`);
        }
        
        // Build rotation
        const [sy, sm, sd] = legs[0].dateStr.split('-').map(Number);
        const [dh, dm] = legs[0].deptTime.split(':').map(Number);
        const startTime = new Date(sy, sm - 1, sd, dh, dm, 0);
        
        const lastLeg = legs[legs.length - 1];
        const [ey, em, ed] = lastLeg.dateStr.split('-').map(Number);
        const [ah, am] = lastLeg.arvlTime.split(':').map(Number);
        const endTime = new Date(ey, em - 1, ed, ah, am, 0);
        
        // Calculate total FT (sum of each leg)
        let ftTotal = 0;
        legs.forEach(leg => {
            const [dh, dm] = leg.deptTime.split(':').map(Number);
            const [ah, am] = leg.arvlTime.split(':').map(Number);
            const dept = dh * 60 + dm;
            let arvl = ah * 60 + am;
            if (arvl < dept) arvl += 1440; // Next day
            ftTotal += (arvl - dept) / 60;
        });
        
        // Calculate ST = elapsed time + 1.5h (or +1h for domestic)
        const elapsedTime = Utils.hoursBetween(startTime, endTime);
        const routeKey = `${firstOrigin}${lastDest}`;
        const stAdd = CONFIG.DOMESTIC_ROUTES.has(routeKey) ? CONFIG.ST_ADD_DOMESTIC : CONFIG.ST_ADD_INTERNATIONAL;
        const stTotal = elapsedTime + stAdd;
        
        const route = legs.map(l => l.origin).join('-') + '-' + lastDest;
        
        // Determine crew size
        const deptHour = dh + dm / 60;
        const isDayWindow = deptHour >= CONFIG.DAY_WINDOW.start && deptHour <= CONFIG.DAY_WINDOW.end;
        const crewInfo = RotationGenerator.determineCrewSize(ftTotal, stTotal, isDayWindow);
        
        const rotation = {
            id: rotId,
            origin: firstOrigin,
            destination: lastDest,
            route: route,
            startTime: startTime,
            endTime: endTime,
            ftTotal: Math.round(ftTotal * 100) / 100,
            stTotal: Math.round(stTotal * 100) / 100,
            legs: legs.length,
            tail: tail,
            crew: crewInfo.crew,
            distribution: crewInfo.distribution,
            restBase: ftTotal <= 4 ? 8 : ftTotal <= 9 ? 10 : ftTotal <= 12 ? 12 : 14,
            restAway: ftTotal <= 4 ? 10 : ftTotal <= 9 ? 12 : ftTotal <= 12 ? 18 : 24,
            isNight: Utils.isNightRotation(startTime, endTime),
            manual: true
        };
        
        AppState.rotations.push(rotation);
        
        // Create slots
        const crewRoles = ['CAP', 'COP'];
        crewRoles.forEach(role => {
            AppState.slots.push({
                id: `${rotId}-${role}`,
                rotationId: rotId,
                rotation: rotation,
                role: role,
                pilotId: null,
                pilotName: null
            });
        });
        
        document.getElementById('rotationCount').textContent = AppState.rotations.length;
        Toast.show('success', 'Creada', `Rotación ${rotId} creada con ${legs.length} tramo(s)`);
        
        // Clear form
        document.getElementById('manualRotId').value = '';
        document.querySelectorAll('#manualLegs .leg-item:not(:first-child)').forEach(el => el.remove());
        
        this.updateSystemStatus();
    },
    
    updateSystemStatus() {
        const statusItinerary = document.getElementById('statusItinerary');
        const statusPilots = document.getElementById('statusPilots');
        const statusRotations = document.getElementById('statusRotations');
        const statusSlots = document.getElementById('statusSlots');
        const statusBases = document.getElementById('statusBases');
        
        if (statusItinerary) {
            statusItinerary.textContent = AppState.itinerary.length > 0 
                ? `${AppState.itinerary.length} vuelos (${AppState.itineraryPeriod || 'N/A'})`
                : 'No cargado';
        }
        if (statusPilots) {
            statusPilots.textContent = AppState.pilots.length > 0 
                ? `${AppState.pilots.length} pilotos (${AppState.pilotsPeriod || 'N/A'})`
                : 'No cargado';
        }
        if (statusRotations) statusRotations.textContent = AppState.rotations.length;
        if (statusSlots) statusSlots.textContent = AppState.slots.length;
        if (statusBases) statusBases.textContent = [...AppState.validBases].sort().join(', ');
    },
    
    // Show modal to edit rotation
    showRotationEditModal(rotationId) {
        const rotation = AppState.rotations.find(r => r.id === rotationId);
        if (!rotation) return;
        
        const slots = AppState.slots.filter(s => s.rotationId === rotationId);
        
        // Store current rotation being edited
        AppState.editingRotationId = rotationId;
        AppState.editingRotation = JSON.parse(JSON.stringify(rotation)); // Deep copy
        
        // Populate Info tab
        document.getElementById('editRotationIdInput').value = rotation.id;
        document.getElementById('editRotationTail').value = rotation.tail || '';
        document.getElementById('editRotationRoute').textContent = `Ruta: ${rotation.origin} → ${rotation.destination} (${rotation.route})`;
        document.getElementById('editRotationTimes').textContent = `${Utils.formatDate(rotation.startTime, 'full')} → ${Utils.formatDate(rotation.endTime, 'full')}`;
        document.getElementById('editRotationFT').textContent = `FT: ${rotation.ftTotal?.toFixed(2)}h`;
        document.getElementById('editRotationST').textContent = `ST: ${rotation.stTotal?.toFixed(2)}h`;
        
        // Calculate ST Gap
        const crew = rotation.crew || 2;
        const deptHour = new Date(rotation.startTime).getHours() + new Date(rotation.startTime).getMinutes() / 60;
        const isDayWindow = deptHour >= CONFIG.DAY_WINDOW.start && deptHour <= CONFIG.DAY_WINDOW.end;
        let maxST;
        if (crew >= 4) maxST = isDayWindow ? CONFIG.LIMITS.CREW_4.ST_DAY : CONFIG.LIMITS.CREW_4.ST_NIGHT;
        else if (crew >= 3) maxST = isDayWindow ? CONFIG.LIMITS.CREW_3.ST_DAY : CONFIG.LIMITS.CREW_3.ST_NIGHT;
        else maxST = isDayWindow ? CONFIG.LIMITS.CREW_2.ST_DAY : CONFIG.LIMITS.CREW_2.ST_NIGHT;
        const stGap = maxST - (rotation.stTotal || 0);
        document.getElementById('editRotationSTGap').textContent = `ST Gap: ${stGap.toFixed(2)}h`;
        
        // Render Legs tab
        this.renderLegsEditor(rotation);
        
        // Render Crew tab
        this.renderSlotsEditor(slots);
        
        // Reset to first tab
        document.querySelectorAll('.edit-tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.edit-tab-content').forEach(t => t.classList.remove('active'));
        document.querySelector('.edit-tab[data-tab="info"]').classList.add('active');
        document.getElementById('tabInfo').classList.add('active');
        
        // Show modal
        document.getElementById('rotationEditModal').classList.add('active');
    },
    
    renderLegsEditor(rotation) {
        const container = document.getElementById('legsEditor');
        
        // Get legs from itinerary that match this rotation
        const legs = AppState.itinerary.filter(f => {
            const fStart = Utils.combineDateTime(f.day, f.deptTime);
            const fEnd = Utils.combineDateTime(f.day, f.arvlTime);
            return f.tail === rotation.tail && 
                   fStart >= new Date(rotation.startTime).getTime() - 60000 && 
                   fEnd <= new Date(rotation.endTime).getTime() + 60000;
        }).sort((a, b) => Utils.combineDateTime(a.day, a.deptTime) - Utils.combineDateTime(b.day, b.deptTime));
        
        if (legs.length === 0) {
            // No legs found, show manual entry
            container.innerHTML = `<div style="padding: 20px; text-align: center; color: var(--text-muted);">
                No se encontraron tramos detallados para esta rotación.
                <br><small>Ruta: ${rotation.route}</small>
            </div>`;
            return;
        }
        
        container.innerHTML = legs.map((leg, idx) => {
            const date = new Date(leg.day).toISOString().split('T')[0];
            const deptTime = `${String(leg.deptTime.hours).padStart(2,'0')}:${String(leg.deptTime.minutes).padStart(2,'0')}`;
            const arvlTime = `${String(leg.arvlTime.hours).padStart(2,'0')}:${String(leg.arvlTime.minutes).padStart(2,'0')}`;
            
            return `<div class="leg-edit-item" data-leg-idx="${idx}">
                <span class="leg-number">#${idx + 1}</span>
                <input type="text" value="${leg.deptSta}" class="leg-origin" maxlength="3" style="text-transform:uppercase">
                <input type="text" value="${leg.arvlSta}" class="leg-dest" maxlength="3" style="text-transform:uppercase">
                <input type="date" value="${date}" class="leg-date">
                <input type="time" value="${deptTime}" class="leg-dept">
                <input type="time" value="${arvlTime}" class="leg-arvl">
            </div>`;
        }).join('');
    },
    
    renderSlotsEditor(slots) {
        const container = document.getElementById('slotsEditor');
        
        container.innerHTML = slots.map(slot => {
            const isAssigned = !!slot.pilotId;
            const pilotDisplay = isAssigned ? (slot.pilotName || slot.pilotId) : 'Sin asignar';
            const roleClass = slot.role.toLowerCase();
            
            return `<div class="slot-edit-item" data-slot-id="${slot.id}">
                <span class="slot-edit-role ${roleClass}">${slot.role}</span>
                <span class="slot-edit-pilot ${isAssigned ? 'assigned' : ''}">${pilotDisplay}</span>
                <button class="slot-remove-btn" data-slot-id="${slot.id}" ${isAssigned ? 'disabled title="Desasigna el piloto primero"' : ''}>
                    Eliminar
                </button>
            </div>`;
        }).join('');
        
        // Add remove handlers
        container.querySelectorAll('.slot-remove-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const slotId = btn.dataset.slotId;
                this.removeSlotFromRotation(slotId);
            });
        });
    },
    
    removeSlotFromRotation(slotId) {
        const slot = AppState.slots.find(s => s.id === slotId);
        if (!slot) return;
        
        if (slot.pilotId) {
            Toast.show('warning', 'No permitido', 'Desasigna el piloto antes de eliminar el slot');
            return;
        }
        
        // Remove slot
        const idx = AppState.slots.findIndex(s => s.id === slotId);
        if (idx > -1) {
            AppState.slots.splice(idx, 1);
            
            // Update rotation distribution
            const rotation = AppState.rotations.find(r => r.id === slot.rotationId);
            if (rotation) {
                const remainingSlots = AppState.slots.filter(s => s.rotationId === rotation.id);
                const caps = remainingSlots.filter(s => s.role === 'CAP').length;
                const cops = remainingSlots.filter(s => s.role === 'COP').length;
                const crps = remainingSlots.filter(s => s.role === 'CRP').length;
                rotation.crew = caps + cops + crps;
                rotation.distribution = `${caps} CAP, ${cops} COP` + (crps > 0 ? `, ${crps} CRP` : '');
            }
            
            // Re-render
            const slots = AppState.slots.filter(s => s.rotationId === AppState.editingRotationId);
            this.renderSlotsEditor(slots);
            Toast.show('success', 'Eliminado', 'Slot eliminado de la rotación');
        }
    },
    
    addSlotToRotation(role) {
        const rotationId = AppState.editingRotationId;
        const rotation = AppState.rotations.find(r => r.id === rotationId);
        if (!rotation) return;
        
        // Count existing slots of this role
        const existingSlots = AppState.slots.filter(s => s.rotationId === rotationId && s.role === role);
        const slotNumber = existingSlots.length + 1;
        
        const newSlot = {
            id: `${rotationId}-${role}-${slotNumber}`,
            rotationId: rotationId,
            role: role,
            slotNumber: slotNumber,
            rotation: rotation,
            pilotId: null,
            pilotName: null
        };
        
        AppState.slots.push(newSlot);
        
        // Update rotation distribution
        const allSlots = AppState.slots.filter(s => s.rotationId === rotationId);
        const caps = allSlots.filter(s => s.role === 'CAP').length;
        const cops = allSlots.filter(s => s.role === 'COP').length;
        const crps = allSlots.filter(s => s.role === 'CRP').length;
        rotation.crew = caps + cops + crps;
        rotation.distribution = `${caps} CAP, ${cops} COP` + (crps > 0 ? `, ${crps} CRP` : '');
        
        // Re-render
        const slots = AppState.slots.filter(s => s.rotationId === rotationId);
        this.renderSlotsEditor(slots);
        Toast.show('success', 'Agregado', `Slot ${role} agregado a la rotación`);
    },
    
    bindRotationEditModal() {
        const modal = document.getElementById('rotationEditModal');
        
        modal.querySelector('.modal-close')?.addEventListener('click', () => modal.classList.remove('active'));
        modal.querySelector('.modal-overlay')?.addEventListener('click', () => modal.classList.remove('active'));
        document.getElementById('cancelRotationEdit')?.addEventListener('click', () => modal.classList.remove('active'));
        
        document.getElementById('addCapSlot')?.addEventListener('click', () => this.addSlotToRotation('CAP'));
        document.getElementById('addCopSlot')?.addEventListener('click', () => this.addSlotToRotation('COP'));
        document.getElementById('addCrpSlot')?.addEventListener('click', () => this.addSlotToRotation('CRP'));
        
        // Tab switching
        document.querySelectorAll('.edit-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                document.querySelectorAll('.edit-tab').forEach(t => t.classList.remove('active'));
                document.querySelectorAll('.edit-tab-content').forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                document.getElementById('tab' + tab.dataset.tab.charAt(0).toUpperCase() + tab.dataset.tab.slice(1))?.classList.add('active');
            });
        });
        
        // Delete rotation
        document.getElementById('deleteRotationBtn')?.addEventListener('click', () => {
            if (!confirm('¿Eliminar esta rotación? Se eliminarán todos los slots asociados.')) return;
            this.deleteRotation(AppState.editingRotationId);
            modal.classList.remove('active');
        });
        
        // Save rotation changes
        document.getElementById('saveRotationEdit')?.addEventListener('click', () => {
            // Update rotation ID and tail if changed
            const rotation = AppState.rotations.find(r => r.id === AppState.editingRotationId);
            if (rotation) {
                const newId = document.getElementById('editRotationIdInput').value.trim();
                const newTail = document.getElementById('editRotationTail').value.trim();
                
                if (newId && newId !== rotation.id) {
                    // Update all related slots
                    AppState.slots.forEach(s => {
                        if (s.rotationId === rotation.id) {
                            s.rotationId = newId;
                            s.id = s.id.replace(rotation.id, newId);
                        }
                    });
                    rotation.id = newId;
                }
                if (newTail) rotation.tail = newTail;
            }
            
            modal.classList.remove('active');
            this.renderRotationsList();
            this.renderUnassignedPanel();
            Toast.show('success', 'Guardado', 'Cambios guardados correctamente');
        });
        
        // Role filter for rotations
        document.getElementById('rotationRoleFilter')?.addEventListener('change', () => this.renderRotationsList());
        
        // Merge rotations button
        document.getElementById('mergeRotationsBtn')?.addEventListener('click', () => this.showMergeRotationsModal());
        
        // Merge modal
        const mergeModal = document.getElementById('mergeRotationsModal');
        mergeModal?.querySelector('.modal-close')?.addEventListener('click', () => mergeModal.classList.remove('active'));
        mergeModal?.querySelector('.modal-overlay')?.addEventListener('click', () => mergeModal.classList.remove('active'));
        document.getElementById('cancelMerge')?.addEventListener('click', () => mergeModal.classList.remove('active'));
        document.getElementById('confirmMerge')?.addEventListener('click', () => this.mergeRotations());
        
        document.getElementById('mergeRotation1')?.addEventListener('change', () => this.updateMergePreview());
        document.getElementById('mergeRotation2')?.addEventListener('change', () => this.updateMergePreview());
    },
    
    deleteRotation(rotationId) {
        // Remove all slots for this rotation
        AppState.slots = AppState.slots.filter(s => s.rotationId !== rotationId);
        
        // Remove rotation
        const idx = AppState.rotations.findIndex(r => r.id === rotationId);
        if (idx > -1) AppState.rotations.splice(idx, 1);
        
        this.renderRotationsList();
        this.renderUnassignedPanel();
        Toast.show('success', 'Eliminado', 'Rotación eliminada');
    },
    
    showMergeRotationsModal() {
        const rotations = [...AppState.rotations].sort((a, b) => new Date(a.startTime) - new Date(b.startTime));
        
        const select1 = document.getElementById('mergeRotation1');
        const select2 = document.getElementById('mergeRotation2');
        
        const options = rotations.map(r => 
            `<option value="${r.id}">${r.id} - ${r.route} (${Utils.formatDate(r.startTime, 'short')})</option>`
        ).join('');
        
        select1.innerHTML = '<option value="">Seleccionar...</option>' + options;
        select2.innerHTML = '<option value="">Seleccionar...</option>' + options;
        
        document.getElementById('mergePreview').innerHTML = '';
        document.getElementById('mergeRotationsModal').classList.add('active');
    },
    
    updateMergePreview() {
        const rot1Id = document.getElementById('mergeRotation1').value;
        const rot2Id = document.getElementById('mergeRotation2').value;
        const preview = document.getElementById('mergePreview');
        
        if (!rot1Id || !rot2Id || rot1Id === rot2Id) {
            preview.innerHTML = '<span style="color:var(--text-muted)">Selecciona dos rotaciones diferentes</span>';
            return;
        }
        
        const rot1 = AppState.rotations.find(r => r.id === rot1Id);
        const rot2 = AppState.rotations.find(r => r.id === rot2Id);
        
        if (!rot1 || !rot2) return;
        
        // Check if they can be merged (same tail or consecutive)
        const newFT = (rot1.ftTotal || 0) + (rot2.ftTotal || 0);
        const newST = (rot1.stTotal || 0) + (rot2.stTotal || 0);
        const newRoute = rot1.route.split('-').concat(rot2.route.split('-').slice(1)).join('-');
        
        preview.innerHTML = `
            <div><strong>Nueva Rotación:</strong></div>
            <div>Ruta: ${newRoute}</div>
            <div>FT Total: ${newFT.toFixed(2)}h | ST Total: ${newST.toFixed(2)}h</div>
            <div>Inicio: ${Utils.formatDate(rot1.startTime, 'full')}</div>
            <div>Fin: ${Utils.formatDate(rot2.endTime, 'full')}</div>
        `;
    },
    
    mergeRotations() {
        const rot1Id = document.getElementById('mergeRotation1').value;
        const rot2Id = document.getElementById('mergeRotation2').value;
        
        if (!rot1Id || !rot2Id || rot1Id === rot2Id) {
            Toast.show('error', 'Error', 'Selecciona dos rotaciones diferentes');
            return;
        }
        
        const rot1 = AppState.rotations.find(r => r.id === rot1Id);
        const rot2 = AppState.rotations.find(r => r.id === rot2Id);
        
        if (!rot1 || !rot2) return;
        
        // Determine which is first
        const [first, second] = new Date(rot1.startTime) < new Date(rot2.startTime) ? [rot1, rot2] : [rot2, rot1];
        
        // Create merged rotation
        const newRoute = first.route.split('-').concat(second.route.split('-').slice(1)).join('-');
        const newFT = (first.ftTotal || 0) + (second.ftTotal || 0);
        
        // Calculate new ST
        const elapsedTime = Utils.hoursBetween(first.startTime, second.endTime);
        const routeKey = `${first.origin}${second.destination}`;
        const stAdd = CONFIG.DOMESTIC_ROUTES.has(routeKey) ? CONFIG.ST_ADD_DOMESTIC : CONFIG.ST_ADD_INTERNATIONAL;
        const newST = elapsedTime + stAdd;
        
        // Update first rotation
        first.destination = second.destination;
        first.route = newRoute;
        first.endTime = new Date(second.endTime);
        first.ftTotal = Math.round(newFT * 100) / 100;
        first.stTotal = Math.round(newST * 100) / 100;
        first.legs = (first.legs || 1) + (second.legs || 1);
        
        // Recalculate crew and rest
        const deptHour = new Date(first.startTime).getHours() + new Date(first.startTime).getMinutes() / 60;
        const isDayWindow = deptHour >= CONFIG.DAY_WINDOW.start && deptHour <= CONFIG.DAY_WINDOW.end;
        const crewInfo = RotationGenerator.determineCrewSize(newFT, newST, isDayWindow);
        first.crew = crewInfo.crew;
        first.distribution = crewInfo.distribution;
        first.restBase = RotationGenerator.calculateRestBase(newFT);
        first.restAway = RotationGenerator.calculateRestAway(newFT);
        
        // Move slots from second to first
        AppState.slots.forEach(s => {
            if (s.rotationId === second.id) {
                s.rotationId = first.id;
                s.rotation = first;
            }
        });
        
        // Remove second rotation
        const idx = AppState.rotations.findIndex(r => r.id === second.id);
        if (idx > -1) AppState.rotations.splice(idx, 1);
        
        document.getElementById('mergeRotationsModal').classList.remove('active');
        this.renderRotationsList();
        this.renderUnassignedPanel();
        Toast.show('success', 'Unidas', `Rotaciones unidas en ${first.id}`);
    }
};

// ============================================
// TOAST
// ============================================
const Toast = {
    show(type, title, message) {
        const container = document.getElementById('toastContainer');
        const icons = {
            success: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>',
            error: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>',
            warning: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/></svg>',
            info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>'
        };
        
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.innerHTML = `<div class="toast-icon">${icons[type]}</div><div class="toast-content"><div class="toast-title">${title}</div><div class="toast-message">${message}</div></div>`;
        container.appendChild(toast);
        setTimeout(() => { toast.classList.add('removing'); setTimeout(() => toast.remove(), 300); }, 4000);
    }
};

// ============================================
// INIT
// ============================================
document.addEventListener('DOMContentLoaded', () => {
    // Check for existing session
    if (Auth.init()) {
        // User already logged in
        showApp();
    } else {
        // Show login screen
        document.getElementById('loginScreen').style.display = 'flex';
        document.getElementById('appContainer').style.display = 'none';
    }
    
    // Bind login form
    document.getElementById('loginForm').addEventListener('submit', (e) => {
        e.preventDefault();
        const username = document.getElementById('loginUser').value;
        const password = document.getElementById('loginPassword').value;
        
        if (Auth.login(username, password)) {
            showApp();
        } else {
            document.getElementById('loginError').textContent = 'Usuario o contraseña incorrectos';
        }
    });
    
    // Bind logout
    document.getElementById('logoutBtn')?.addEventListener('click', () => {
        Auth.logout();
        location.reload();
    });
    
    function showApp() {
        document.getElementById('loginScreen').style.display = 'none';
        document.getElementById('appContainer').style.display = 'flex';
        
        // Update user info in sidebar
        const user = Auth.getUser();
        if (user) {
            document.getElementById('userAvatar').textContent = user.name.charAt(0).toUpperCase();
            document.getElementById('userName').textContent = user.name;
            
            // Set role on body for CSS visibility
            document.body.dataset.role = user.role;
        }
        
        UIController.init();
        UIController.bindRotationEditModal();
        UIController.bindLogsView();
        UIController.bindUserManagement();
    }
});

// ============================================
// USER MANAGEMENT
// ============================================
UIController.bindUserManagement = function() {
    // Render users list
    this.renderUsersList();
    
    // Create user button
    document.getElementById('createUserBtn')?.addEventListener('click', () => {
        const username = document.getElementById('newUsername').value.trim();
        const password = document.getElementById('newUserPassword').value;
        const name = document.getElementById('newUserName').value.trim();
        const role = document.getElementById('newUserRole').value;
        
        if (!username || !password || !name) {
            Toast.show('error', 'Error', 'Complete todos los campos');
            return;
        }
        
        const result = Auth.createUser(username, password, name, role);
        if (result.success) {
            Toast.show('success', 'Creado', `Usuario ${name} creado`);
            document.getElementById('newUsername').value = '';
            document.getElementById('newUserPassword').value = '';
            document.getElementById('newUserName').value = '';
            this.renderUsersList();
        } else {
            Toast.show('error', 'Error', result.error);
        }
    });
};

UIController.renderUsersList = function() {
    const container = document.getElementById('usersList');
    if (!container) return;
    
    const users = Auth.getAllUsers();
    
    container.innerHTML = Object.entries(users).map(([username, user]) => `
        <div class="user-item" data-username="${username}">
            <div class="user-item-avatar">${user.name.charAt(0).toUpperCase()}</div>
            <div class="user-item-info">
                <div class="user-item-name">${user.name}</div>
                <div class="user-item-meta">@${username}</div>
            </div>
            <span class="user-item-role ${user.role}">${user.role}</span>
            <div class="user-item-actions">
                ${username !== 'admin' ? `
                    <button class="edit-btn" title="Editar">✏️</button>
                    <button class="delete-btn" title="Eliminar">🗑️</button>
                ` : '<span style="font-size:10px;color:var(--text-muted)">Protegido</span>'}
            </div>
        </div>
    `).join('');
    
    // Bind edit and delete buttons
    container.querySelectorAll('.delete-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const username = e.target.closest('.user-item').dataset.username;
            if (confirm(`¿Eliminar usuario ${username}?`)) {
                const result = Auth.deleteUser(username);
                if (result.success) {
                    Toast.show('success', 'Eliminado', 'Usuario eliminado');
                    this.renderUsersList();
                } else {
                    Toast.show('error', 'Error', result.error);
                }
            }
        });
    });
    
    container.querySelectorAll('.edit-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const username = e.target.closest('.user-item').dataset.username;
            const users = Auth.getAllUsers();
            const user = users[username];
            
            const newName = prompt('Nuevo nombre:', user.name);
            if (newName && newName !== user.name) {
                Auth.updateUser(username, { name: newName });
                Toast.show('success', 'Actualizado', 'Usuario actualizado');
                this.renderUsersList();
            }
            
            const newPassword = prompt('Nueva contraseña (dejar vacío para no cambiar):');
            if (newPassword) {
                Auth.updateUser(username, { password: newPassword });
                Toast.show('success', 'Actualizado', 'Contraseña actualizada');
            }
        });
    });
};
