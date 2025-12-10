// ============================================
// FLEX CREW TRACKING - Sistema Plan vs Ejecución
// ============================================

const TState = {
    currentPeriod: { year: 2025, month: 12 },
    trackingWindow: { start: null, end: null },
    pilots: [],
    plannedRotations: [],
    plannedAssignments: new Map(),
    trackingRotations: [],
    trackingSlots: [],
    trackingAssignments: new Map(),
    deviations: [],
    currentView: 'calendar',
    filters: { role: '', base: '', pilotSearch: '', deviationType: '' },
    validBases: new Set(['MDE', 'BOG', 'MIA', 'VCP', 'SCL', 'EZE', 'GRU', 'UIO', 'GYE', 'CLO', 'CTG'])
};

const TUtils = {
    formatDate(date, fmt = 'short') {
        if (!date) return '';
        const d = new Date(date);
        if (isNaN(d)) return '';
        const day = d.getDate(), mon = d.getMonth() + 1, yr = d.getFullYear();
        const hh = String(d.getHours()).padStart(2, '0'), mm = String(d.getMinutes()).padStart(2, '0');
        if (fmt === 'short') return `${day}/${mon}`;
        if (fmt === 'time') return `${hh}:${mm}`;
        if (fmt === 'full') return `${day}/${mon} ${hh}:${mm}`;
        if (fmt === 'iso') return `${yr}-${String(mon).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
        return `${day}/${mon}/${yr}`;
    },
    getMonthName(m) { return ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'][m-1]; },
    getDaysInMonth(y, m) { return new Date(y, m, 0).getDate(); },
    getDayName(d) { return ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'][new Date(d).getDay()]; },
    isWeekend(d) { const w = new Date(d).getDay(); return w === 0 || w === 6; },
    getInitials(n) { return n ? n.split(' ').map(x => x[0]).join('').substring(0,2).toUpperCase() : '?'; },
    parseExcelDate(v) {
        if (!v) return null;
        if (v instanceof Date) return v;
        if (typeof v === 'number') return new Date((v - 25569) * 86400000);
        // Parse "07Dec" format
        const match = String(v).match(/(\d{1,2})([A-Za-z]{3})/);
        if (match) {
            const months = {jan:0,feb:1,mar:2,apr:3,may:4,jun:5,jul:6,aug:7,sep:8,oct:9,nov:10,dec:11};
            const day = parseInt(match[1]);
            const mon = months[match[2].toLowerCase()];
            if (mon !== undefined) return new Date(TState.currentPeriod.year, mon, day);
        }
        const p = new Date(v);
        return isNaN(p) ? null : p;
    },
    parseExcelTime(v) {
        if (!v) return null;
        // Parse "07Dec 06:40" format
        const match = String(v).match(/(\d{1,2}):(\d{2})/);
        if (match) return { hours: parseInt(match[1]), minutes: parseInt(match[2]) };
        if (typeof v === 'number') {
            const mins = Math.round(v * 24 * 60);
            return { hours: Math.floor(mins / 60) % 24, minutes: mins % 60 };
        }
        return null;
    },
    combineDateTime(day, time) {
        if (!day || !time) return null;
        const d = new Date(day);
        d.setHours(time.hours || 0, time.minutes || 0, 0, 0);
        return d.getTime();
    }
};

const TToast = {
    show(type, title, msg) {
        const c = document.getElementById('toastContainer');
        const t = document.createElement('div');
        t.className = `toast ${type}`;
        t.innerHTML = `<div class="toast-icon">${type === 'success' ? '✓' : type === 'error' ? '✗' : 'ℹ'}</div>
            <div class="toast-content"><div class="toast-title">${title}</div><div class="toast-message">${msg}</div></div>`;
        c.appendChild(t);
        setTimeout(() => t.classList.add('show'), 10);
        setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300); }, 3000);
    }
};

const TDataLoader = {
    async loadPlan(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const data = JSON.parse(e.target.result);
                    TState.pilots = (data.pilots || []).map(p => ({
                        ...p,
                        freeDays: new Set(p.freeDays || []),
                        absences: new Set(p.absences || []),
                        training: new Set(p.training || []),
                        qualifiedTails: p.qualifiedTails || [],
                        doNotFlyWith: p.doNotFlyWith || [],
                        limitedAirports: p.limitedAirports || [],
                        restrictedAircraft: p.restrictedAircraft || []
                    }));
                    TState.plannedRotations = data.rotations || [];
                    TState.plannedAssignments.clear();
                    TState.trackingAssignments.clear();
                    
                    if (data.assignments) {
                        Object.entries(data.assignments).forEach(([pid, assigns]) => {
                            const planned = assigns.map(a => ({
                                ...a,
                                startTime: a.startTime ? new Date(a.startTime) : null,
                                endTime: a.endTime ? new Date(a.endTime) : null
                            }));
                            TState.plannedAssignments.set(pid, planned);
                            // Copy non-ROT to tracking (OFF, VAC, TRN, OFI, INC, LUS, FREE)
                            const nonRot = planned.filter(a => !['ROT', 'DH'].includes(a.type));
                            if (nonRot.length > 0) TState.trackingAssignments.set(pid, [...nonRot]);
                        });
                    }
                    if (data.currentPeriod) TState.currentPeriod = data.currentPeriod;
                    TUI.updateBaseFilter();
                    resolve({ pilots: TState.pilots.length, rotations: TState.plannedRotations.length });
                } catch (err) { reject(new Error('Error JSON: ' + err.message)); }
            };
            reader.onerror = () => reject(new Error('Error leyendo archivo'));
            reader.readAsText(file);
        });
    },
    
    async load9DayItinerary(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const data = new Uint8Array(e.target.result);
                    const wb = XLSX.read(data, { type: 'array' });
                    const sheet = wb.Sheets[wb.SheetNames[0]];
                    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });
                    
                    const flights = [];
                    let minDate = null, maxDate = null;
                    
                    // Format: [idx, FlightNum, Date(07Dec), State, STD_label, STD, STA, BestDT, BestAT, From, To, Reg, ...]
                    for (let i = 1; i < rows.length; i++) {
                        const row = rows[i];
                        if (!row || row.length < 12) continue;
                        
                        const flightNum = String(row[1] || '').trim();
                        const dateStr = String(row[2] || '');
                        const from = String(row[9] || '').toUpperCase().trim();
                        const to = String(row[10] || '').toUpperCase().trim();
                        const reg = String(row[11] || '').toUpperCase().trim();
                        const stdStr = String(row[5] || ''); // "07Dec 06:40"
                        const staStr = String(row[6] || ''); // "07Dec 10:20"
                        
                        if (!flightNum || !from || !to) continue;
                        
                        const day = TUtils.parseExcelDate(dateStr);
                        if (!day) continue;
                        
                        const deptTime = TUtils.parseExcelTime(stdStr);
                        const arvlTime = TUtils.parseExcelTime(staStr);
                        if (!deptTime || !arvlTime) continue;
                        
                        if (!minDate || day < minDate) minDate = new Date(day);
                        if (!maxDate || day > maxDate) maxDate = new Date(day);
                        
                        flights.push({ day, flightNum, from, to, reg, deptTime, arvlTime });
                    }
                    
                    TState.actualItinerary = flights;
                    if (minDate && maxDate) {
                        TState.trackingWindow = { start: minDate, end: maxDate };
                        TState.currentPeriod = { year: minDate.getFullYear(), month: minDate.getMonth() + 1 };
                        document.getElementById('windowStartDate').value = TUtils.formatDate(minDate, 'iso');
                        document.getElementById('windowEndDate').textContent = TUtils.formatDate(maxDate, 'short');
                    }
                    resolve({ flights: flights.length, start: minDate, end: maxDate });
                } catch (err) { reject(new Error('Error Excel: ' + err.message)); }
            };
            reader.onerror = () => reject(new Error('Error leyendo archivo'));
            reader.readAsArrayBuffer(file);
        });
    }
};

const TRotationGen = {
    generate(flights) {
        if (!flights || !flights.length) return [];
        const sorted = [...flights].sort((a, b) => TUtils.combineDateTime(a.day, a.deptTime) - TUtils.combineDateTime(b.day, b.deptTime));
        const byTail = new Map();
        sorted.forEach(f => { if (!byTail.has(f.reg)) byTail.set(f.reg, []); byTail.get(f.reg).push(f); });
        
        const rotations = [];
        let rotId = 1;
        
        byTail.forEach((tailFlights, tail) => {
            let current = null;
            tailFlights.forEach(f => {
                const start = TUtils.combineDateTime(f.day, f.deptTime);
                let end = TUtils.combineDateTime(f.day, f.arvlTime);
                if (end < start) end += 24 * 60 * 60 * 1000; // overnight
                
                if (!current) {
                    current = this.create(rotId++, f, start, end);
                } else {
                    const gap = (start - current.endTime) / 3600000;
                    if (gap <= 24 && gap >= 0 && f.from === current.destination) {
                        current.endTime = end;
                        current.destination = f.to;
                        current.route += '-' + f.to;
                        current.flights.push(f);
                        current.ftTotal += (end - start) / 3600000;
                    } else {
                        current.stTotal = current.ftTotal + 1.5;
                        rotations.push(current);
                        current = this.create(rotId++, f, start, end);
                    }
                }
            });
            if (current) { current.stTotal = current.ftTotal + 1.5; rotations.push(current); }
        });
        
        // Generate slots
        const slots = [];
        rotations.forEach(r => {
            for (let i = 0; i < 2; i++) {
                slots.push({ id: `${r.id}-S${i+1}`, rotationId: r.id, position: i+1, role: i === 0 ? 'CAP' : 'COP', pilotId: null, pilotName: null });
            }
        });
        
        TState.trackingRotations = rotations;
        TState.trackingSlots = slots;
        return rotations;
    },
    create(id, f, start, end) {
        return {
            id: `TRK-${String(id).padStart(3, '0')}`,
            origin: f.from, destination: f.to, route: `${f.from}-${f.to}`,
            startTime: new Date(start), endTime: new Date(end),
            tail: f.reg, flights: [f], ftTotal: (end - start) / 3600000, stTotal: 0, crew: 2
        };
    }
};

const TValidator = {
    canAssign(pilot, rotation, slot) {
        const errors = [];
        
        // 1. Check qualified tails
        if (pilot.qualifiedTails && pilot.qualifiedTails.length > 0) {
            if (!pilot.qualifiedTails.includes(rotation.tail)) {
                errors.push(`No habilitado para ${rotation.tail}`);
            }
        }
        
        // 2. Check restricted aircraft
        if (pilot.restrictedAircraft && pilot.restrictedAircraft.includes(rotation.tail)) {
            errors.push(`Aeronave restringida: ${rotation.tail}`);
        }
        
        // 3. Check limited airports
        if (pilot.limitedAirports && pilot.limitedAirports.length > 0) {
            const routeStations = rotation.route.split('-');
            const restricted = routeStations.filter(s => pilot.limitedAirports.includes(s));
            if (restricted.length > 0) {
                errors.push(`Aeropuertos restringidos: ${restricted.join(', ')}`);
            }
        }
        
        // 4. Check do not fly with
        if (pilot.doNotFlyWith && pilot.doNotFlyWith.length > 0) {
            const otherSlots = TState.trackingSlots.filter(s => s.rotationId === rotation.id && s.pilotId);
            const conflicts = otherSlots.filter(s => pilot.doNotFlyWith.includes(s.pilotId));
            if (conflicts.length > 0) {
                errors.push(`No puede volar con: ${conflicts.map(s => s.pilotName || s.pilotId).join(', ')}`);
            }
        }
        
        // 5. Check role match
        if (slot.role !== pilot.role) {
            errors.push(`Rol ${pilot.role} no coincide con slot ${slot.role}`);
        }
        
        // 6. Check free days / absences
        const rotDay = new Date(rotation.startTime).getDate();
        if (pilot.freeDays?.has(rotDay)) {
            errors.push('Día libre asignado');
        }
        if (pilot.absences?.has(rotDay)) {
            errors.push('Ausencia programada');
        }
        
        return { valid: errors.length === 0, errors };
    }
};

const TUI = {
    init() {
        this.bindNav();
        this.bindFiles();
        this.bindPeriod();
        this.bindActions();
        this.bindFilters();
        this.bindModals();
        this.updatePeriodLabel();
        this.setDefaultWindow();
    },
    bindNav() {
        document.querySelectorAll('.nav-item[data-view]').forEach(btn => {
            btn.addEventListener('click', () => this.switchView(btn.dataset.view));
        });
    },
    switchView(view) {
        TState.currentView = view;
        document.querySelectorAll('.nav-item[data-view]').forEach(b => b.classList.toggle('active', b.dataset.view === view));
        document.querySelectorAll('.view-section').forEach(s => s.classList.toggle('active', s.id === `${view}View`));
        const titles = { calendar: 'Calendario Dual', deviations: 'Desviaciones', rotations: 'Rotaciones 9D', pilots: 'Pilotos' };
        document.getElementById('viewTitle').textContent = titles[view] || view;
        this.render();
    },
    render() {
        switch (TState.currentView) {
            case 'calendar': this.renderCalendar(); break;
            case 'deviations': this.renderDeviations(); break;
            case 'rotations': this.renderRotations(); break;
            case 'pilots': this.renderPilots(); break;
        }
    },
    bindFiles() {
        document.getElementById('loadPlanBtn').addEventListener('click', () => document.getElementById('planFile').click());
        document.getElementById('planFile').addEventListener('change', async (e) => {
            const file = e.target.files[0]; if (!file) return;
            try {
                const r = await TDataLoader.loadPlan(file);
                document.getElementById('planLoadedBadge').style.display = 'inline';
                document.getElementById('pilotsCount').textContent = r.pilots;
                this.updatePeriodLabel();
                TToast.show('success', 'Plan cargado', `${r.pilots} pilotos`);
                this.render();
            } catch (err) { TToast.show('error', 'Error', err.message); }
            e.target.value = '';
        });
        document.getElementById('load9DayBtn').addEventListener('click', () => document.getElementById('itinerary9DayFile').click());
        document.getElementById('itinerary9DayFile').addEventListener('change', async (e) => {
            const file = e.target.files[0]; if (!file) return;
            try {
                const r = await TDataLoader.load9DayItinerary(file);
                document.getElementById('itineraryLoadedBadge').style.display = 'inline';
                this.updatePeriodLabel();
                TToast.show('success', 'Itinerario cargado', `${r.flights} vuelos`);
            } catch (err) { TToast.show('error', 'Error', err.message); }
            e.target.value = '';
        });
    },
    bindPeriod() {
        document.getElementById('prevPeriod').addEventListener('click', () => {
            TState.currentPeriod.month--;
            if (TState.currentPeriod.month < 1) { TState.currentPeriod.month = 12; TState.currentPeriod.year--; }
            this.updatePeriodLabel(); this.render();
        });
        document.getElementById('nextPeriod').addEventListener('click', () => {
            TState.currentPeriod.month++;
            if (TState.currentPeriod.month > 12) { TState.currentPeriod.month = 1; TState.currentPeriod.year++; }
            this.updatePeriodLabel(); this.render();
        });
        document.getElementById('windowStartDate').addEventListener('change', (e) => {
            const start = new Date(e.target.value);
            if (!isNaN(start)) {
                const end = new Date(start); end.setDate(end.getDate() + 8);
                TState.trackingWindow = { start, end };
                document.getElementById('windowEndDate').textContent = TUtils.formatDate(end, 'short');
                this.render();
            }
        });
    },
    bindActions() {
        document.getElementById('generateTrackingBtn').addEventListener('click', () => {
            if (!TState.actualItinerary?.length) { TToast.show('error', 'Error', 'Cargue el itinerario de 9 días'); return; }
            const rots = TRotationGen.generate(TState.actualItinerary);
            document.getElementById('rotationsCount').textContent = rots.length;
            TToast.show('success', 'Rotaciones', `${rots.length} generadas`);
            this.render();
        });
        document.getElementById('analyzeDeviationsBtn').addEventListener('click', () => this.analyzeDeviations());
        document.getElementById('exportTrackingBtn').addEventListener('click', () => this.exportTracking());
        document.getElementById('saveTrackingBtn').addEventListener('click', () => this.saveState());
    },
    bindFilters() {
        document.getElementById('calendarRoleFilter')?.addEventListener('change', (e) => { TState.filters.role = e.target.value; this.renderCalendar(); });
        document.getElementById('calendarBaseFilter')?.addEventListener('change', (e) => { TState.filters.base = e.target.value; this.renderCalendar(); });
        document.getElementById('calendarPilotSearch')?.addEventListener('input', (e) => { TState.filters.pilotSearch = e.target.value.toLowerCase(); this.renderCalendar(); });
        document.getElementById('deviationTypeFilter')?.addEventListener('change', (e) => { TState.filters.deviationType = e.target.value; this.renderDeviations(); });
    },
    bindModals() {
        document.querySelectorAll('.modal-close, .modal-overlay').forEach(el => {
            el.addEventListener('click', () => document.querySelectorAll('.modal').forEach(m => m.classList.remove('active')));
        });
    },
    updatePeriodLabel() {
        document.getElementById('currentPeriod').textContent = `${TUtils.getMonthName(TState.currentPeriod.month)} ${TState.currentPeriod.year}`;
    },
    setDefaultWindow() {
        const { year, month } = TState.currentPeriod;
        const start = new Date(year, month - 1, 1), end = new Date(year, month - 1, 9);
        TState.trackingWindow = { start, end };
        document.getElementById('windowStartDate').value = TUtils.formatDate(start, 'iso');
        document.getElementById('windowEndDate').textContent = TUtils.formatDate(end, 'short');
    },
    updateBaseFilter() {
        const bases = [...new Set(TState.pilots.map(p => p.base).filter(b => b))].sort();
        const opts = '<option value="">Todas las bases</option>' + bases.map(b => `<option value="${b}">${b}</option>`).join('');
        const el = document.getElementById('calendarBaseFilter');
        if (el) el.innerHTML = opts;
    },
    renderCalendar() {
        const container = document.getElementById('pilotsDualCalendar');
        const header = document.getElementById('calendarHeader');
        const view = document.getElementById('calendarView');
        
        if (!TState.pilots.length) {
            view.classList.add('empty');
            return;
        }
        view.classList.remove('empty');
        
        const { year, month } = TState.currentPeriod;
        const days = TUtils.getDaysInMonth(year, month);
        const { start: wStart, end: wEnd } = TState.trackingWindow;
        
        // Header
        let hdr = '<div class="pilot-info-header">Piloto</div>';
        for (let d = 1; d <= days; d++) {
            const date = new Date(year, month - 1, d);
            const wknd = TUtils.isWeekend(date);
            const inW = wStart && wEnd && date >= wStart && date <= wEnd;
            hdr += `<div class="day-header ${wknd ? 'weekend' : ''} ${inW ? 'in-window' : ''}">
                <span class="day-name">${TUtils.getDayName(date)}</span><span class="day-number">${d}</span></div>`;
        }
        header.innerHTML = hdr;
        
        // Filter pilots
        let pilots = [...TState.pilots];
        if (TState.filters.role) pilots = pilots.filter(p => p.role === TState.filters.role);
        if (TState.filters.base) pilots = pilots.filter(p => p.base === TState.filters.base);
        if (TState.filters.pilotSearch) pilots = pilots.filter(p => 
            (p.name?.toLowerCase().includes(TState.filters.pilotSearch)) || (p.nick?.toLowerCase().includes(TState.filters.pilotSearch)));
        
        // Render pilots
        let html = '';
        pilots.forEach(pilot => {
            const planned = TState.plannedAssignments.get(pilot.id) || [];
            const tracking = TState.trackingAssignments.get(pilot.id) || [];
            
            html += `<div class="pilot-dual-row" data-pilot="${pilot.id}">
                <div class="pilot-info-cell">
                    <div class="pilot-info" onclick="TUI.showPilotModal('${pilot.id}')">
                        <div class="pilot-name">${pilot.nick || pilot.name}</div>
                        <div class="pilot-meta"><span class="pilot-role-badge ${pilot.role?.toLowerCase()}">${pilot.role}</span>${pilot.base}</div>
                    </div>
                    <div class="calendar-lines">
                        <div class="calendar-line plan-line">`;
            
            // Plan line (readonly)
            for (let d = 1; d <= days; d++) {
                const date = new Date(year, month - 1, d);
                const wknd = TUtils.isWeekend(date);
                const inW = wStart && wEnd && date >= wStart && date <= wEnd;
                const dayPlan = planned.filter(a => new Date(a.startTime).getDate() === d);
                
                html += `<div class="day-cell ${wknd ? 'weekend' : ''} ${inW ? 'in-window' : ''}">`;
                if (pilot.freeDays?.has(d)) html += `<div class="calendar-event free">OFF</div>`;
                else if (pilot.absences?.has(d)) html += `<div class="calendar-event absence">AUS</div>`;
                else {
                    dayPlan.forEach(a => {
                        const cls = a.type === 'ROT' ? 'rotation' : a.type === 'DH' ? 'deadhead' : a.type === 'TRN' || a.type === 'OFI' ? 'training' : 'free';
                        const lbl = a.type === 'ROT' ? (a.route?.split('-').slice(0,2).join('-') || 'ROT') : a.type;
                        html += `<div class="calendar-event ${cls}" title="${a.route || a.type}">${lbl}</div>`;
                    });
                }
                html += '</div>';
            }
            
            html += `</div><div class="calendar-line tracking-line">`;
            
            // Tracking line (editable)
            for (let d = 1; d <= days; d++) {
                const date = new Date(year, month - 1, d);
                const wknd = TUtils.isWeekend(date);
                const inW = wStart && wEnd && date >= wStart && date <= wEnd;
                const dayTrack = tracking.filter(a => new Date(a.startTime).getDate() === d);
                
                html += `<div class="day-cell ${wknd ? 'weekend' : ''} ${inW ? 'in-window' : ''}" data-day="${d}" data-pilot="${pilot.id}">`;
                // Copy non-ROT from plan (OFF, VAC, TRN, etc)
                if (pilot.freeDays?.has(d)) html += `<div class="calendar-event free locked">OFF</div>`;
                else if (pilot.absences?.has(d)) html += `<div class="calendar-event absence locked">AUS</div>`;
                else {
                    // Show TRN/OFI/INC/LUS/VAC from plan as locked
                    const lockedTypes = ['TRN', 'OFI', 'INC', 'LUS', 'VAC'];
                    const locked = dayTrack.filter(a => lockedTypes.includes(a.type));
                    locked.forEach(a => {
                        html += `<div class="calendar-event training locked">${a.type}</div>`;
                    });
                    // Show assigned rotations
                    const rots = dayTrack.filter(a => a.type === 'ROT');
                    rots.forEach(a => {
                        html += `<div class="calendar-event rotation" title="${a.route}">${a.route?.split('-').slice(0,2).join('-') || 'ROT'}</div>`;
                    });
                }
                html += '</div>';
            }
            
            html += '</div></div></div></div>';
        });
        
        container.innerHTML = html;
        this.bindTrackingCells();
    },
    bindTrackingCells() {
        document.querySelectorAll('.tracking-line .day-cell').forEach(cell => {
            cell.addEventListener('click', () => {
                const day = parseInt(cell.dataset.day);
                const pilotId = cell.dataset.pilot;
                const pilot = TState.pilots.find(p => p.id === pilotId);
                // Don't allow if locked (free/absence/training)
                if (pilot?.freeDays?.has(day) || pilot?.absences?.has(day)) return;
                const tracking = TState.trackingAssignments.get(pilotId) || [];
                const hasLocked = tracking.some(a => new Date(a.startTime).getDate() === day && ['TRN','OFI','INC','LUS','VAC'].includes(a.type));
                if (hasLocked) return;
                this.showAssignModal(pilotId, day);
            });
        });
    },
    showAssignModal(pilotId, day) {
        const modal = document.getElementById('trackingAssignModal');
        const info = document.getElementById('trackingRotationInfo');
        const list = document.getElementById('trackingAvailablePilots');
        const pilot = TState.pilots.find(p => p.id === pilotId);
        
        info.innerHTML = `<p><strong>Piloto:</strong> ${pilot?.nick || pilot?.name} (${pilot?.role})</p><p><strong>Día:</strong> ${day}</p>`;
        
        // Get rotations for that day
        const { year, month } = TState.currentPeriod;
        const rots = TState.trackingRotations.filter(r => new Date(r.startTime).getDate() === day);
        
        if (!rots.length) {
            list.innerHTML = '<div class="empty-state">No hay rotaciones para este día</div>';
        } else {
            list.innerHTML = rots.map(r => {
                // Get available slot for pilot's role
                const slot = TState.trackingSlots.find(s => s.rotationId === r.id && s.role === pilot?.role && !s.pilotId);
                const validation = TValidator.canAssign(pilot, r, slot || { role: pilot?.role });
                const disabled = !slot || !validation.valid;
                const errMsg = !slot ? 'Slot ocupado' : validation.errors.join(', ');
                
                return `<div class="rotation-option ${disabled ? 'disabled' : ''}" onclick="${disabled ? '' : `TUI.assignRotation('${pilotId}', '${r.id}')`}">
                    <div class="rotation-option-main">
                        <span class="rotation-route">${r.route}</span>
                        <span class="rotation-time">${TUtils.formatDate(r.startTime, 'time')} - ${r.tail}</span>
                    </div>
                    ${disabled ? `<div class="rotation-error">${errMsg}</div>` : ''}
                </div>`;
            }).join('');
        }
        
        modal.classList.add('active');
    },
    assignRotation(pilotId, rotationId) {
        const pilot = TState.pilots.find(p => p.id === pilotId);
        const rotation = TState.trackingRotations.find(r => r.id === rotationId);
        const slot = TState.trackingSlots.find(s => s.rotationId === rotationId && s.role === pilot?.role && !s.pilotId);
        
        if (!pilot || !rotation || !slot) return;
        
        // Validate
        const validation = TValidator.canAssign(pilot, rotation, slot);
        if (!validation.valid) {
            TToast.show('error', 'No permitido', validation.errors.join(', '));
            return;
        }
        
        // Assign
        slot.pilotId = pilotId;
        slot.pilotName = pilot.nick || pilot.name;
        
        if (!TState.trackingAssignments.has(pilotId)) TState.trackingAssignments.set(pilotId, []);
        TState.trackingAssignments.get(pilotId).push({
            type: 'ROT', rotationId: rotation.id, route: rotation.route,
            startTime: rotation.startTime, endTime: rotation.endTime,
            origin: rotation.origin, destination: rotation.destination, tail: rotation.tail
        });
        
        document.getElementById('trackingAssignModal').classList.remove('active');
        TToast.show('success', 'Asignado', `${rotation.route} → ${pilot.nick || pilot.name}`);
        this.renderCalendar();
    },
    showPilotModal(pilotId) {
        const modal = document.getElementById('pilotModal');
        const header = document.getElementById('pilotModalHeader');
        const schedule = document.getElementById('pilotDualSchedule');
        const pilot = TState.pilots.find(p => p.id === pilotId);
        if (!pilot) return;
        
        header.innerHTML = `<div class="pilot-avatar">${TUtils.getInitials(pilot.nick || pilot.name)}</div>
            <div class="pilot-details"><h2>${pilot.name}</h2><p>${pilot.role} - Base: ${pilot.base} - ID: ${pilot.id}</p></div>`;
        
        const { year, month } = TState.currentPeriod;
        const days = TUtils.getDaysInMonth(year, month);
        const planned = TState.plannedAssignments.get(pilotId) || [];
        const tracking = TState.trackingAssignments.get(pilotId) || [];
        
        let html = '<div class="schedule-header"><div class="schedule-col">Día</div><div class="schedule-col">PLAN</div><div class="schedule-col">TRACKING</div></div>';
        for (let d = 1; d <= days; d++) {
            const date = new Date(year, month - 1, d);
            const dayPlan = planned.filter(a => new Date(a.startTime).getDate() === d);
            const dayTrack = tracking.filter(a => new Date(a.startTime).getDate() === d);
            const planStr = dayPlan.length ? dayPlan.map(a => a.route || a.type).join(', ') : '-';
            const trackStr = dayTrack.length ? dayTrack.map(a => a.route || a.type).join(', ') : '-';
            
            html += `<div class="schedule-row"><div class="schedule-date"><span class="day-num">${d}</span>${TUtils.getDayName(date)}</div>
                <div class="schedule-plan">${planStr}</div><div class="schedule-tracking">${trackStr}</div></div>`;
        }
        schedule.innerHTML = html;
        modal.classList.add('active');
    },
    analyzeDeviations() {
        const { start, end } = TState.trackingWindow;
        if (!start || !end) { TToast.show('error', 'Error', 'No hay ventana definida'); return; }
        
        const deviations = [];
        TState.plannedAssignments.forEach((planned, pilotId) => {
            const tracking = TState.trackingAssignments.get(pilotId) || [];
            
            planned.filter(a => a.type === 'ROT').forEach(p => {
                const pDate = new Date(p.startTime);
                if (pDate < start || pDate > end) return;
                
                const match = tracking.find(t => t.type === 'ROT' && t.route === p.route && Math.abs(new Date(t.startTime) - pDate) < 4 * 3600000);
                if (!match) {
                    deviations.push({ type: 'cancelled', pilotId, planned: p, actual: null, desc: `Cancelado: ${p.route}` });
                } else if (Math.abs(new Date(match.startTime) - pDate) > 30 * 60000) {
                    deviations.push({ type: 'modified', pilotId, planned: p, actual: match, desc: `Modificado: ${p.route}` });
                }
            });
            
            tracking.filter(a => a.type === 'ROT').forEach(t => {
                const tDate = new Date(t.startTime);
                if (tDate < start || tDate > end) return;
                const match = planned.find(p => p.type === 'ROT' && p.route === t.route && Math.abs(new Date(p.startTime) - tDate) < 4 * 3600000);
                if (!match) {
                    deviations.push({ type: 'added', pilotId, planned: null, actual: t, desc: `Añadido: ${t.route}` });
                }
            });
        });
        
        TState.deviations = deviations;
        const stats = { cancelled: deviations.filter(d => d.type === 'cancelled').length,
            added: deviations.filter(d => d.type === 'added').length,
            modified: deviations.filter(d => d.type === 'modified').length };
        
        document.getElementById('deviationStat').textContent = deviations.length;
        document.getElementById('cancelledCount').textContent = stats.cancelled;
        document.getElementById('addedCount').textContent = stats.added;
        document.getElementById('modifiedCount').textContent = stats.modified;
        document.getElementById('okCount').textContent = this.getOkCount();
        
        TToast.show('success', 'Análisis', `${deviations.length} desviaciones`);
        this.switchView('deviations');
    },
    getOkCount() {
        const { start, end } = TState.trackingWindow;
        if (!start || !end) return 0;
        let count = 0;
        TState.plannedAssignments.forEach((planned, pilotId) => {
            planned.filter(a => a.type === 'ROT').forEach(p => {
                const pDate = new Date(p.startTime);
                if (pDate < start || pDate > end) return;
                if (!TState.deviations.some(d => d.pilotId === pilotId && d.planned?.route === p.route)) count++;
            });
        });
        return count;
    },
    renderDeviations() {
        const container = document.getElementById('deviationsList');
        let devs = TState.deviations;
        if (TState.filters.deviationType) devs = devs.filter(d => d.type === TState.filters.deviationType);
        
        if (!devs.length) { container.innerHTML = '<div class="empty-state">Sin desviaciones</div>'; return; }
        
        container.innerHTML = devs.map(d => {
            const pilot = TState.pilots.find(p => p.id === d.pilotId);
            const icon = d.type === 'cancelled' ? '✗' : d.type === 'added' ? '+' : '~';
            const date = d.planned ? TUtils.formatDate(d.planned.startTime, 'short') : TUtils.formatDate(d.actual?.startTime, 'short');
            return `<div class="deviation-item ${d.type}"><div class="deviation-icon">${icon}</div>
                <div class="deviation-content"><div class="deviation-title">${d.desc}</div>
                <div class="deviation-meta"><span>👤 ${pilot?.nick || pilot?.name || 'N/A'}</span><span>📅 ${date}</span></div></div></div>`;
        }).join('');
    },
    renderRotations() {
        const container = document.getElementById('trackingRotationsList');
        const rots = TState.trackingRotations;
        if (!rots.length) { container.innerHTML = '<div class="empty-state">Genere rotaciones del itinerario</div>'; return; }
        
        container.innerHTML = rots.map(r => {
            const slots = TState.trackingSlots.filter(s => s.rotationId === r.id);
            const assigned = slots.filter(s => s.pilotId).length;
            return `<div class="rotation-card ${assigned === slots.length ? 'assigned' : 'unassigned'}">
                <div class="rotation-header"><span class="rotation-route">${r.route}</span><span class="rotation-id">${r.id}</span></div>
                <div class="rotation-details">
                    <div class="rotation-detail"><label>Inicio</label><span>${TUtils.formatDate(r.startTime, 'full')}</span></div>
                    <div class="rotation-detail"><label>Fin</label><span>${TUtils.formatDate(r.endTime, 'full')}</span></div>
                    <div class="rotation-detail"><label>Matrícula</label><span>${r.tail}</span></div>
                    <div class="rotation-detail"><label>FT</label><span>${r.ftTotal.toFixed(1)}h</span></div>
                </div>
                <div class="rotation-crew">${slots.map(s => `<span class="crew-slot ${s.pilotId ? 'filled' : 'empty'}">${s.role}: ${s.pilotName || '—'}</span>`).join('')}</div>
            </div>`;
        }).join('');
    },
    renderPilots() {
        const container = document.getElementById('trackingPilotsList');
        const search = document.getElementById('pilotSearchView')?.value?.toLowerCase() || '';
        let pilots = TState.pilots;
        if (search) pilots = pilots.filter(p => p.name?.toLowerCase().includes(search) || p.nick?.toLowerCase().includes(search));
        
        if (!pilots.length) { container.innerHTML = '<div class="empty-state">Sin pilotos</div>'; return; }
        
        container.innerHTML = pilots.map(p => {
            const plan = (TState.plannedAssignments.get(p.id) || []).filter(a => a.type === 'ROT').length;
            const track = (TState.trackingAssignments.get(p.id) || []).filter(a => a.type === 'ROT').length;
            const devs = TState.deviations.filter(d => d.pilotId === p.id).length;
            return `<div class="pilot-card" onclick="TUI.showPilotModal('${p.id}')">
                <div class="pilot-card-header"><div class="pilot-avatar">${TUtils.getInitials(p.nick || p.name)}</div>
                <div class="pilot-card-info"><h4>${p.nick || p.name}</h4><span>${p.role} - ${p.base}</span></div></div>
                <div class="pilot-card-stats">
                    <div class="pilot-card-stat"><span class="value">${plan}</span><span class="label">Plan</span></div>
                    <div class="pilot-card-stat"><span class="value">${track}</span><span class="label">Track</span></div>
                    <div class="pilot-card-stat"><span class="value">${devs}</span><span class="label">Desv</span></div>
                </div></div>`;
        }).join('');
    },
    exportTracking() {
        const wb = XLSX.utils.book_new();
        const data = [['Tipo', 'Descripción', 'Piloto', 'Fecha Plan', 'Fecha Real', 'Ruta Plan', 'Ruta Real']];
        TState.deviations.forEach(d => {
            const pilot = TState.pilots.find(p => p.id === d.pilotId);
            data.push([d.type.toUpperCase(), d.desc, pilot?.nick || pilot?.name || 'N/A',
                d.planned ? TUtils.formatDate(d.planned.startTime, 'full') : '', d.actual ? TUtils.formatDate(d.actual.startTime, 'full') : '',
                d.planned?.route || '', d.actual?.route || '']);
        });
        const ws = XLSX.utils.aoa_to_sheet(data);
        XLSX.utils.book_append_sheet(wb, ws, 'Desviaciones');
        XLSX.writeFile(wb, `Tracking_${TState.currentPeriod.year}_${String(TState.currentPeriod.month).padStart(2,'0')}.xlsx`);
        TToast.show('success', 'Exportado', 'Archivo generado');
    },
    saveState() {
        const state = {
            currentPeriod: TState.currentPeriod, trackingWindow: TState.trackingWindow,
            pilots: TState.pilots.map(p => ({...p, freeDays: [...(p.freeDays || [])], absences: [...(p.absences || [])], training: [...(p.training || [])]})),
            plannedRotations: TState.plannedRotations,
            plannedAssignments: Object.fromEntries(TState.plannedAssignments),
            trackingRotations: TState.trackingRotations, trackingSlots: TState.trackingSlots,
            trackingAssignments: Object.fromEntries(TState.trackingAssignments),
            deviations: TState.deviations
        };
        const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
        const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
        a.download = `Tracking_State_${TState.currentPeriod.year}_${String(TState.currentPeriod.month).padStart(2,'0')}.json`;
        a.click();
        TToast.show('success', 'Guardado', 'Estado exportado');
    }
};

document.addEventListener('DOMContentLoaded', () => TUI.init());
