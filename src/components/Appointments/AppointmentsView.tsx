import React, { useState, useEffect, useMemo } from 'react';
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  Plus,
  Search,
  Filter,
  Clock,
  User,
  CheckCircle2,
  AlertCircle,
  Stethoscope,
  Phone,
  MessageCircle,
  DollarSign,
  ChevronDown,
} from 'lucide-react';
import { db } from '../../lib/db';
import { Appointment, AppointmentStatus } from '../../types';
import { AppointmentModal } from './AppointmentModal';
import { AppointmentDetailsModal } from './AppointmentDetailsModal';

interface AppointmentsViewProps {
  onLaunchSale?: (appointment: Appointment) => void;
}

type CalendarViewMode = 'DAY' | 'WEEK' | 'MONTH';

const STATUS_COLOR_MAP: Record<
  AppointmentStatus,
  { border: string; bg: string; text: string; dot: string; label: string }
> = {
  AGENDADA: {
    border: 'border-l-blue-500',
    bg: 'bg-blue-50/70 hover:bg-blue-100/70',
    text: 'text-blue-800',
    dot: 'bg-blue-500',
    label: 'Agendada',
  },
  CONFIRMADA: {
    border: 'border-l-emerald-500',
    bg: 'bg-emerald-50/70 hover:bg-emerald-100/70',
    text: 'text-emerald-800',
    dot: 'bg-emerald-500',
    label: 'Confirmada',
  },
  CHEGOU: {
    border: 'border-l-teal-500',
    bg: 'bg-teal-50/70 hover:bg-teal-100/70',
    text: 'text-teal-800',
    dot: 'bg-teal-500',
    label: 'Chegou',
  },
  PENDENTE: {
    border: 'border-l-amber-500',
    bg: 'bg-amber-50/70 hover:bg-amber-100/70',
    text: 'text-amber-800',
    dot: 'bg-amber-500',
    label: 'Pendente',
  },
  AGUARDANDO: {
    border: 'border-l-blue-500',
    bg: 'bg-blue-50/70 hover:bg-blue-100/70',
    text: 'text-blue-800',
    dot: 'bg-blue-500',
    label: 'Aguardando',
  },
  EM_ATENDIMENTO: {
    border: 'border-l-purple-500',
    bg: 'bg-purple-50/70 hover:bg-purple-100/70',
    text: 'text-purple-800',
    dot: 'bg-purple-500',
    label: 'Em Atendimento',
  },
  FINALIZADA: {
    border: 'border-l-slate-400',
    bg: 'bg-slate-100/70 hover:bg-slate-200/70',
    text: 'text-slate-700',
    dot: 'bg-slate-500',
    label: 'Finalizada',
  },
  CANCELADA: {
    border: 'border-l-rose-400',
    bg: 'bg-rose-50/70 hover:bg-rose-100/70',
    text: 'text-rose-700',
    dot: 'bg-rose-500',
    label: 'Cancelada',
  },
  FALTOU: {
    border: 'border-l-slate-500',
    bg: 'bg-slate-200/70 hover:bg-slate-300/70',
    text: 'text-slate-600',
    dot: 'bg-slate-600',
    label: 'Faltou',
  },
};

const TIME_SLOTS = [
  '08:00',
  '09:00',
  '10:00',
  '11:00',
  '12:00',
  '13:00',
  '14:00',
  '15:00',
  '16:00',
  '17:00',
  '18:00',
  '19:00',
];

const WEEK_DAYS = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

// Helper to format Date to YYYY-MM-DD in local time
function formatDateISO(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// Get monday of the week for a given date
function getMonday(d: Date): Date {
  const date = new Date(d);
  const day = date.getDay();
  const diff = date.getDate() - day + (day === 0 ? -6 : 1);
  return new Date(date.setDate(diff));
}

export const AppointmentsView: React.FC<AppointmentsViewProps> = ({ onLaunchSale }) => {
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [viewMode, setViewMode] = useState<CalendarViewMode>('WEEK');
  // Dynamic current date from the actual system environment
  const [currentDate, setCurrentDate] = useState<Date>(() => new Date());

  // Search & Filter
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | AppointmentStatus>('ALL');

  // Modals state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [appointmentToEdit, setAppointmentToEdit] = useState<Appointment | null>(null);
  const [rescheduleFromAppointment, setRescheduleFromAppointment] = useState<Appointment | null>(null);
  const [selectedSlotDate, setSelectedSlotDate] = useState<string>('');
  const [selectedSlotTime, setSelectedSlotTime] = useState<string>('');

  // Details modal
  const [modalAppointment, setModalAppointment] = useState<Appointment | null>(null);
  const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);

  // Load from DB & subscribe
  useEffect(() => {
    const load = () => {
      setAppointments(db.getAppointments());
    };
    load();
    const unsub = db.subscribe(load);
    return unsub;
  }, []);

  // Filtered appointments by search & status
  const filteredAppointments = useMemo(() => {
    return appointments.filter((apt) => {
      if (statusFilter !== 'ALL' && apt.status !== statusFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchName = apt.patientName.toLowerCase().includes(q);
        const matchProc = apt.procedureName.toLowerCase().includes(q);
        const matchPhone = apt.patientPhone?.includes(q);
        if (!matchName && !matchProc && !matchPhone) return false;
      }
      return true;
    });
  }, [appointments, statusFilter, searchQuery]);

  // Week days list for current reference date (Segunda a Sábado, 6 dias)
  const weekDays = useMemo(() => {
    const monday = getMonday(currentDate);
    return Array.from({ length: 6 }).map((_, i) => {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      return d;
    });
  }, [currentDate]);

  // Today's real ISO
  const todayISO = useMemo(() => formatDateISO(new Date()), []);

  // Navigation handlers
  const handlePrev = () => {
    const d = new Date(currentDate);
    if (viewMode === 'DAY') {
      d.setDate(d.getDate() - 1);
    } else if (viewMode === 'WEEK') {
      d.setDate(d.getDate() - 7);
    } else {
      d.setMonth(d.getMonth() - 1);
    }
    setCurrentDate(d);
  };

  const handleNext = () => {
    const d = new Date(currentDate);
    if (viewMode === 'DAY') {
      d.setDate(d.getDate() + 1);
    } else if (viewMode === 'WEEK') {
      d.setDate(d.getDate() + 7);
    } else {
      d.setMonth(d.getMonth() + 1);
    }
    setCurrentDate(d);
  };

  const handleToday = () => {
    setCurrentDate(new Date());
  };

  // Label for header
  const headerDateLabel = useMemo(() => {
    const monthNames = [
      'Janeiro',
      'Fevereiro',
      'Março',
      'Abril',
      'Maio',
      'Junho',
      'Julho',
      'Agosto',
      'Setembro',
      'Outubro',
      'Novembro',
      'Dezembro',
    ];

    if (viewMode === 'DAY') {
      return `${currentDate.getDate()} de ${monthNames[currentDate.getMonth()]} de ${currentDate.getFullYear()}`;
    }
    if (viewMode === 'WEEK') {
      const start = weekDays[0];
      const end = weekDays[weekDays.length - 1];
      if (start.getMonth() === end.getMonth()) {
        return `${start.getDate()} a ${end.getDate()} de ${monthNames[start.getMonth()]} de ${start.getFullYear()}`;
      }
      return `${start.getDate()} de ${monthNames[start.getMonth()]} - ${end.getDate()} de ${monthNames[end.getMonth()]} de ${end.getFullYear()}`;
    }
    return `${monthNames[currentDate.getMonth()]} de ${currentDate.getFullYear()}`;
  }, [viewMode, currentDate, weekDays]);

  // Handle slot click to open new appointment modal
  const handleEmptySlotClick = (dateStr: string, timeStr: string) => {
    setAppointmentToEdit(null);
    setRescheduleFromAppointment(null);
    setSelectedSlotDate(dateStr);
    setSelectedSlotTime(timeStr);
    setIsModalOpen(true);
  };

  // Handle appointment card click -> opens floating central modal
  const handleAppointmentClick = (apt: Appointment, e: React.MouseEvent) => {
    e.stopPropagation();
    setModalAppointment(apt);
    setIsDetailsModalOpen(true);
  };

  // Appointments strictly visible in the current active period
  const periodAppointments = useMemo(() => {
    if (viewMode === 'DAY') {
      const dayISO = formatDateISO(currentDate);
      return filteredAppointments.filter((a) => a.date === dayISO);
    }
    if (viewMode === 'WEEK') {
      const weekISOs = new Set(weekDays.map(formatDateISO));
      return filteredAppointments.filter((a) => weekISOs.has(a.date));
    }
    // MONTH
    const curY = currentDate.getFullYear();
    const curM = String(currentDate.getMonth() + 1).padStart(2, '0');
    const prefix = `${curY}-${curM}`;
    return filteredAppointments.filter((a) => a.date.startsWith(prefix));
  }, [filteredAppointments, viewMode, currentDate, weekDays]);

  // KPIs strictly reflecting the current active view period
  const stats = useMemo(() => {
    const total = periodAppointments.length;
    const confirmadas = periodAppointments.filter((a) => a.status === 'CONFIRMADA').length;
    const aguardando = periodAppointments.filter((a) => a.status === 'AGUARDANDO').length;
    const emAtendimento = periodAppointments.filter((a) => a.status === 'EM_ATENDIMENTO').length;
    const pendentes = periodAppointments.filter((a) => a.status === 'PENDENTE').length;
    return { total, confirmadas, aguardando, emAtendimento, pendentes };
  }, [periodAppointments]);

  // Mini-calendar days calculation
  const miniCalDays = useMemo(() => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const firstDay = new Date(year, month, 1).getDay(); // 0 = Sunday
    const totalDays = new Date(year, month + 1, 0).getDate();
    const prevMonthTotal = new Date(year, month, 0).getDate();

    const items: { day: number; isCurrentMonth: boolean; date: Date; iso: string }[] = [];

    // Previous month padding
    for (let i = firstDay - 1; i >= 0; i--) {
      const day = prevMonthTotal - i;
      const d = new Date(year, month - 1, day);
      items.push({ day, isCurrentMonth: false, date: d, iso: formatDateISO(d) });
    }

    // Current month days
    for (let day = 1; day <= totalDays; day++) {
      const d = new Date(year, month, day);
      items.push({ day, isCurrentMonth: true, date: d, iso: formatDateISO(d) });
    }

    // Next month padding to fill week
    const remaining = (7 - (items.length % 7)) % 7;
    for (let day = 1; day <= remaining; day++) {
      const d = new Date(year, month + 1, day);
      items.push({ day, isCurrentMonth: false, date: d, iso: formatDateISO(d) });
    }

    return items;
  }, [currentDate]);

  // Today's appointments for "Próximos Atendimentos"
  const todaysAppointments = useMemo(() => {
    return appointments
      .filter((a) => a.date === todayISO)
      .sort((a, b) => a.startTime.localeCompare(b.startTime));
  }, [appointments, todayISO]);

  return (
    <div className="space-y-6 animate-in fade-in duration-150">
      {/* Top Header & Action Controls — Sticky Toolbar pins smoothly under PeriodFilterBar */}
      <div className="sticky top-[98px] z-20 bg-white/95 backdrop-blur-md p-4 sm:p-5 rounded-2xl border border-slate-200/90 shadow-xs flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 transition-all">
        <div>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-600 shrink-0">
              <CalendarIcon className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold text-slate-900 leading-tight">Agenda Clínica</h1>
                <span className="hidden sm:inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                  {todaysAppointments.length} hoje
                </span>
              </div>
              <p className="text-xs text-slate-500">
                Gestão integrada de consultas, recepção e encaminhamento financeiro
              </p>
            </div>
          </div>
        </div>

        {/* View Switcher, Period Navigation & New Appointment Button */}
        <div className="flex flex-wrap items-center gap-2.5 sm:gap-3">
          {/* Period Navigation Buttons */}
          <div className="flex items-center bg-slate-100 rounded-xl p-1 border border-slate-200">
            <button
              onClick={handlePrev}
              className="p-1.5 rounded-lg text-slate-600 hover:bg-white hover:shadow-xs transition-all cursor-pointer"
              title="Anterior"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={handleToday}
              className="px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-white hover:shadow-xs rounded-lg transition-all cursor-pointer"
            >
              Hoje
            </button>
            <button
              onClick={handleNext}
              className="p-1.5 rounded-lg text-slate-600 hover:bg-white hover:shadow-xs transition-all cursor-pointer"
              title="Próximo"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          <span className="text-xs sm:text-sm font-bold text-slate-800 min-w-[170px] sm:min-w-[210px] text-center">
            {headerDateLabel}
          </span>

          {/* View Mode Switcher: Diário | Semanal | Mensal */}
          <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200">
            <button
              onClick={() => setViewMode('DAY')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                viewMode === 'DAY'
                  ? 'bg-white text-emerald-800 shadow-xs font-bold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Diário
            </button>
            <button
              onClick={() => setViewMode('WEEK')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                viewMode === 'WEEK'
                  ? 'bg-white text-emerald-800 shadow-xs font-bold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Semanal
            </button>
            <button
              onClick={() => setViewMode('MONTH')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                viewMode === 'MONTH'
                  ? 'bg-white text-emerald-800 shadow-xs font-bold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Mensal
            </button>
          </div>

          {/* New Appointment Primary Button */}
          <button
            onClick={() => {
              setAppointmentToEdit(null);
              setRescheduleFromAppointment(null);
              setSelectedSlotDate(todayISO);
              setSelectedSlotTime('09:00');
              setIsModalOpen(true);
            }}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-xs hover:shadow transition-all flex items-center gap-1.5 cursor-pointer shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span>Nova Consulta</span>
          </button>
        </div>
      </div>

      {/* KPI & Status Chips Banner — Coherent with Visible Period */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <div className="p-3 bg-white rounded-xl border border-slate-200 shadow-xs">
          <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
            Total {viewMode === 'WEEK' ? 'na Semana' : viewMode === 'DAY' ? 'no Dia' : 'no Mês'}
          </p>
          <p className="text-lg font-bold text-slate-800 mt-0.5">{stats.total}</p>
        </div>
        <div className="p-3 bg-emerald-50/50 rounded-xl border border-emerald-100 shadow-xs">
          <p className="text-[11px] font-semibold text-emerald-600 uppercase tracking-wider">
            Confirmadas
          </p>
          <p className="text-lg font-bold text-emerald-800 mt-0.5">{stats.confirmadas}</p>
        </div>
        <div className="p-3 bg-blue-50/50 rounded-xl border border-blue-100 shadow-xs">
          <p className="text-[11px] font-semibold text-blue-600 uppercase tracking-wider">
            Na Recepção
          </p>
          <p className="text-lg font-bold text-blue-800 mt-0.5">{stats.aguardando}</p>
        </div>
        <div className="p-3 bg-purple-50/50 rounded-xl border border-purple-100 shadow-xs">
          <p className="text-[11px] font-semibold text-purple-600 uppercase tracking-wider">
            Em Atendimento
          </p>
          <p className="text-lg font-bold text-purple-800 mt-0.5">{stats.emAtendimento}</p>
        </div>
        <div className="p-3 bg-amber-50/50 rounded-xl border border-amber-100 shadow-xs col-span-2 sm:col-span-1">
          <p className="text-[11px] font-semibold text-amber-600 uppercase tracking-wider">
            Pendentes
          </p>
          <p className="text-lg font-bold text-amber-800 mt-0.5">{stats.pendentes}</p>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-white p-3.5 rounded-xl border border-slate-200">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Buscar por paciente, procedimento ou telefone..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
          />
        </div>

        <div className="flex items-center gap-2">
          <Filter className="w-3.5 h-3.5 text-slate-400" />
          <span className="text-xs font-semibold text-slate-600">Status:</span>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as any)}
            className="text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 bg-white cursor-pointer"
          >
            <option value="ALL">Todos os status</option>
            <option value="CONFIRMADA">Confirmada</option>
            <option value="AGUARDANDO">Aguardando na Recepção</option>
            <option value="EM_ATENDIMENTO">Em Atendimento</option>
            <option value="PENDENTE">Pendente</option>
            <option value="FINALIZADA">Finalizada</option>
            <option value="CANCELADA">Cancelada</option>
            <option value="FALTOU">Faltou</option>
          </select>
        </div>
      </div>

      {/* Main Calendar View Area */}
      <div className="grid grid-cols-1 xl:grid-cols-4 gap-6 items-start">
        {/* Main Grid: 3 columns on xl */}
        <div className="xl:col-span-3 bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
          {/* SEMANAL (Visão Principal) */}
          {viewMode === 'WEEK' && (
            <div className="overflow-x-auto">
              <div className="min-w-[800px]">
                {/* Day Headers */}
                <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50/80 sticky top-0 z-10">
                  <div className="p-3 text-center border-r border-slate-200 text-xs font-bold text-slate-400 uppercase">
                    Horário
                  </div>
                  {weekDays.map((day, idx) => {
                    const iso = formatDateISO(day);
                    const isToday = iso === todayISO;
                    return (
                      <div
                        key={iso}
                        className={`p-3 text-center border-r border-slate-200 last:border-r-0 ${
                          isToday ? 'bg-emerald-50/70 text-emerald-800' : 'text-slate-700'
                        }`}
                      >
                        <p className="text-[11px] font-semibold uppercase text-slate-500">
                          {WEEK_DAYS[idx]}
                        </p>
                        <p
                          className={`text-sm font-bold inline-block px-2.5 py-0.5 rounded-full mt-0.5 ${
                            isToday ? 'bg-emerald-600 text-white shadow-2xs' : ''
                          }`}
                        >
                          {day.getDate()}
                        </p>
                      </div>
                    );
                  })}
                </div>

                {/* Time Slots & Appointments Grid */}
                <div className="divide-y divide-slate-100">
                  {TIME_SLOTS.map((slot) => {
                    return (
                      <div key={slot} className="grid grid-cols-7 min-h-[88px]">
                        {/* Time label column */}
                        <div className="p-2 border-r border-slate-200 text-center text-xs font-semibold text-slate-400 flex items-start justify-center pt-2 bg-slate-50/30">
                          {slot}
                        </div>

                        {/* 6 Day columns */}
                        {weekDays.map((day) => {
                          const dateStr = formatDateISO(day);
                          const slotHour = slot.split(':')[0];
                          const slotApts = filteredAppointments.filter((a) => {
                            if (a.date !== dateStr) return false;
                            const aptHour = a.startTime.split(':')[0];
                            return aptHour === slotHour;
                          });

                          return (
                            <div
                              key={dateStr + slot}
                              onClick={() => handleEmptySlotClick(dateStr, slot)}
                              className="p-1 border-r border-slate-100 last:border-r-0 relative group hover:bg-slate-50/80 transition-colors cursor-pointer flex flex-col gap-1 min-h-[88px]"
                            >
                              {/* Add slot hover indicator */}
                              {slotApts.length === 0 && (
                                <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                  <span className="text-[11px] font-semibold text-emerald-600 bg-white border border-emerald-200 shadow-xs px-2 py-0.5 rounded-md">
                                    + Agendar
                                  </span>
                                </div>
                              )}

                              {slotApts.map((apt) => {
                                const style = STATUS_COLOR_MAP[apt.status] || STATUS_COLOR_MAP.CONFIRMADA;
                                return (
                                  <div
                                    key={apt.id}
                                    onClick={(e) => handleAppointmentClick(apt, e)}
                                    className={`p-2 rounded-lg border border-slate-200 border-l-4 ${style.border} ${style.bg} shadow-2xs hover:shadow-xs transition-all text-left cursor-pointer`}
                                  >
                                    <div className="flex items-center justify-between gap-1 mb-0.5">
                                      <span className="text-[10px] font-bold text-slate-600 flex items-center gap-1">
                                        <Clock className="w-2.5 h-2.5" />
                                        {apt.startTime} – {apt.endTime}
                                      </span>
                                      <span
                                        className={`w-1.5 h-1.5 rounded-full ${style.dot}`}
                                        title={style.label}
                                      />
                                    </div>
                                    <p className="text-xs font-bold text-slate-900 truncate">
                                      {apt.patientName}
                                    </p>
                                    <p className="text-[11px] text-slate-600 truncate">
                                      {apt.procedureName}
                                    </p>
                                  </div>
                                );
                              })}
                            </div>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* DIÁRIO */}
          {viewMode === 'DAY' && (
            <div className="p-6 space-y-4">
              <div className="flex items-center justify-between pb-4 border-b border-slate-100">
                <h3 className="text-base font-bold text-slate-800">
                  Programação do Dia — {headerDateLabel}
                </h3>
                <span className="text-xs font-semibold px-2.5 py-1 bg-emerald-50 text-emerald-700 rounded-full">
                  {filteredAppointments.filter((a) => a.date === formatDateISO(currentDate)).length}{' '}
                  consultas
                </span>
              </div>

              <div className="space-y-3">
                {TIME_SLOTS.map((slot) => {
                  const dateStr = formatDateISO(currentDate);
                  const slotHour = slot.split(':')[0];
                  const slotApts = filteredAppointments.filter(
                    (a) => a.date === dateStr && a.startTime.split(':')[0] === slotHour
                  );

                  return (
                    <div
                      key={slot}
                      className="flex items-start gap-4 p-3 rounded-xl border border-slate-100 hover:border-slate-200 hover:bg-slate-50/50 transition-colors"
                    >
                      <div className="w-16 text-center font-bold text-xs text-slate-400 pt-1">
                        {slot}
                      </div>

                      <div className="flex-1 space-y-2">
                        {slotApts.length === 0 ? (
                          <button
                            onClick={() => handleEmptySlotClick(dateStr, slot)}
                            className="w-full py-2.5 border border-dashed border-slate-200 hover:border-emerald-300 rounded-xl text-xs font-medium text-slate-400 hover:text-emerald-600 hover:bg-emerald-50/30 transition-all text-left px-4 cursor-pointer"
                          >
                            + Horário livre. Clique para agendar consulta às {slot}
                          </button>
                        ) : (
                          slotApts.map((apt) => {
                            const style = STATUS_COLOR_MAP[apt.status] || STATUS_COLOR_MAP.CONFIRMADA;
                            return (
                              <div
                                key={apt.id}
                                onClick={(e) => handleAppointmentClick(apt, e)}
                                className={`p-4 rounded-xl border border-slate-200 border-l-4 ${style.border} ${style.bg} shadow-xs hover:shadow transition-all cursor-pointer flex flex-col sm:flex-row sm:items-center justify-between gap-3`}
                              >
                                <div className="space-y-1">
                                  <div className="flex items-center gap-2">
                                    <span className="text-xs font-bold text-slate-500">
                                      {apt.startTime} às {apt.endTime} ({apt.durationMinutes} min)
                                    </span>
                                    <span
                                      className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full ${style.text} bg-white/80 border border-slate-200`}
                                    >
                                      <span className={`w-1.5 h-1.5 rounded-full ${style.dot}`} />
                                      {style.label}
                                    </span>
                                  </div>
                                  <h4 className="text-sm font-bold text-slate-900">
                                    {apt.patientName}
                                  </h4>
                                  <p className="text-xs text-slate-600 flex items-center gap-1.5">
                                    <Stethoscope className="w-3.5 h-3.5 text-emerald-600" />
                                    {apt.procedureName}
                                  </p>
                                </div>

                                <div className="flex items-center gap-2">
                                  {apt.patientPhone && (
                                    <span className="text-xs text-slate-500 font-medium flex items-center gap-1">
                                      <Phone className="w-3 h-3 text-slate-400" />
                                      {apt.patientPhone}
                                    </span>
                                  )}
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      if (onLaunchSale) onLaunchSale(apt);
                                    }}
                                    className="px-3 py-1.5 bg-white border border-slate-200 hover:border-emerald-300 text-emerald-700 text-xs font-bold rounded-lg shadow-2xs hover:bg-emerald-50 transition-colors flex items-center gap-1 cursor-pointer"
                                  >
                                    <DollarSign className="w-3 h-3" />
                                    Lançar Receita
                                  </button>
                                </div>
                              </div>
                            );
                          })
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* MENSAL */}
          {viewMode === 'MONTH' && (
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-7 text-center font-bold text-xs text-slate-500 uppercase tracking-wider pb-2 border-b border-slate-100">
                <span>Dom</span>
                <span>Seg</span>
                <span>Ter</span>
                <span>Qua</span>
                <span>Qui</span>
                <span>Sex</span>
                <span>Sáb</span>
              </div>

              {/* Month calendar grid */}
              <div className="grid grid-cols-7 gap-2">
                {Array.from({ length: 35 }).map((_, i) => {
                  const firstDayOfMonth = new Date(
                    currentDate.getFullYear(),
                    currentDate.getMonth(),
                    1
                  );
                  const startOffset = firstDayOfMonth.getDay();
                  const d = new Date(
                    currentDate.getFullYear(),
                    currentDate.getMonth(),
                    i - startOffset + 1
                  );
                  const iso = formatDateISO(d);
                  const isCurrentMonth = d.getMonth() === currentDate.getMonth();
                  const isToday = iso === todayISO;
                  const dayApts = filteredAppointments.filter((a) => a.date === iso);

                  return (
                    <div
                      key={iso}
                      onClick={() => {
                        setCurrentDate(d);
                        setViewMode('DAY');
                      }}
                      className={`min-h-[100px] p-2 rounded-xl border border-slate-100 hover:border-emerald-300 hover:shadow-xs transition-all cursor-pointer flex flex-col justify-between ${
                        !isCurrentMonth
                          ? 'opacity-40 bg-slate-50/50'
                          : isToday
                          ? 'bg-emerald-50/40 border-emerald-200'
                          : 'bg-white'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span
                          className={`text-xs font-bold w-6 h-6 rounded-full flex items-center justify-center ${
                            isToday ? 'bg-emerald-600 text-white' : 'text-slate-700'
                          }`}
                        >
                          {d.getDate()}
                        </span>
                        {dayApts.length > 0 && (
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
                            {dayApts.length}
                          </span>
                        )}
                      </div>

                      <div className="space-y-1 mt-1 overflow-hidden">
                        {dayApts.slice(0, 2).map((apt) => (
                          <div
                            key={apt.id}
                            className="text-[10px] truncate px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 font-medium"
                          >
                            {apt.startTime} {apt.patientName.split(' ')[0]}
                          </div>
                        ))}
                        {dayApts.length > 2 && (
                          <p className="text-[9px] text-slate-400 font-semibold pl-1">
                            +{dayApts.length - 2} mais
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Right Auxiliary Panel */}
        <div className="space-y-6">
          {/* Mini Calendar / Quick Day Picker */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                Navegação Rápida
              </h3>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={handleToday}
                  className="px-2 py-0.5 rounded-lg text-[11px] font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 transition-colors cursor-pointer"
                  title="Voltar para a data de hoje"
                >
                  Hoje
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const d = new Date(currentDate);
                    d.setMonth(d.getMonth() - 1);
                    setCurrentDate(d);
                  }}
                  className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
                  title="Mês anterior"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const d = new Date(currentDate);
                    d.setMonth(d.getMonth() + 1);
                    setCurrentDate(d);
                  }}
                  className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
                  title="Próximo mês"
                >
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            <div className="text-center font-bold text-xs text-slate-800 capitalize pb-1 border-b border-slate-100">
              {currentDate.toLocaleString('pt-BR', { month: 'long', year: 'numeric' })}
            </div>

            <div className="grid grid-cols-7 text-center text-[10px] font-bold text-slate-400">
              <span>D</span>
              <span>S</span>
              <span>T</span>
              <span>Q</span>
              <span>Q</span>
              <span>S</span>
              <span>S</span>
            </div>

            <div className="grid grid-cols-7 gap-1 text-center">
              {miniCalDays.map((item, idx) => {
                const isSelected = item.iso === formatDateISO(currentDate);
                const isToday = item.iso === todayISO;
                const hasApt = appointments.some((a) => a.date === item.iso);

                return (
                  <button
                    key={idx}
                    onClick={() => {
                      setCurrentDate(item.date);
                    }}
                    className={`h-7 w-7 mx-auto rounded-lg text-xs font-semibold flex items-center justify-center transition-all relative cursor-pointer ${
                      isSelected
                        ? 'bg-emerald-600 text-white shadow-xs font-bold'
                        : isToday
                        ? 'border border-emerald-500 text-emerald-800 font-bold bg-emerald-50/50'
                        : !item.isCurrentMonth
                        ? 'text-slate-300 hover:bg-slate-50'
                        : 'text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    {item.day}
                    {hasApt && !isSelected && (
                      <span className="w-1 h-1 rounded-full bg-emerald-500 absolute bottom-1" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Upcoming Consultations / Today's Appointments */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                Próximos Atendimentos
              </h3>
              <span className="text-[11px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
                Hoje ({todaysAppointments.length})
              </span>
            </div>

            <div className="space-y-3">
              {todaysAppointments.slice(0, 5).map((apt) => {
                const style = STATUS_COLOR_MAP[apt.status] || STATUS_COLOR_MAP.CONFIRMADA;
                return (
                  <div
                    key={apt.id}
                    onClick={() => {
                      setModalAppointment(apt);
                      setIsDetailsModalOpen(true);
                    }}
                    className="p-3 rounded-xl border border-slate-100 hover:border-emerald-200 hover:bg-slate-50 transition-all cursor-pointer space-y-1.5"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-700 flex items-center gap-1">
                        <Clock className="w-3 h-3 text-emerald-600" />
                        {apt.startTime}
                      </span>
                      <span
                        className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${style.text} bg-white border border-slate-200`}
                      >
                        {style.label}
                      </span>
                    </div>
                    <p className="text-xs font-bold text-slate-900 truncate">
                      {apt.patientName}
                    </p>
                    <p className="text-[11px] text-slate-500 truncate">
                      {apt.procedureName}
                    </p>
                  </div>
                );
              })}
              {todaysAppointments.length === 0 && (
                <div className="py-4 text-center space-y-2">
                  <p className="text-xs text-slate-400">
                    Nenhuma consulta agendada para hoje.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setAppointmentToEdit(null);
                      setRescheduleFromAppointment(null);
                      setSelectedSlotDate(todayISO);
                      setSelectedSlotTime('09:00');
                      setIsModalOpen(true);
                    }}
                    className="text-xs font-bold text-emerald-600 hover:text-emerald-700 cursor-pointer"
                  >
                    + Agendar para Hoje
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Appointment Create/Edit Modal */}
      <AppointmentModal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setRescheduleFromAppointment(null);
        }}
        appointmentToEdit={appointmentToEdit}
        rescheduleFromAppointment={rescheduleFromAppointment}
        defaultDate={selectedSlotDate}
        defaultStartTime={selectedSlotTime}
        onSaved={() => {
          setAppointments(db.getAppointments());
          setRescheduleFromAppointment(null);
        }}
      />

      {/* Appointment Details Modal — Floating Center Overlay Modal */}
      <AppointmentDetailsModal
        isOpen={isDetailsModalOpen}
        onClose={() => setIsDetailsModalOpen(false)}
        appointment={modalAppointment}
        onEdit={(apt) => {
          setAppointmentToEdit(apt);
          setRescheduleFromAppointment(null);
          setIsModalOpen(true);
        }}
        onReschedule={(apt) => {
          setAppointmentToEdit(null);
          setRescheduleFromAppointment(apt);
          setSelectedSlotDate('');
          setSelectedSlotTime('');
          setIsModalOpen(true);
        }}
        onLaunchSale={(apt) => {
          if (onLaunchSale) {
            onLaunchSale(apt);
          }
        }}
        onStatusChanged={() => {
          setAppointments(db.getAppointments());
          if (modalAppointment) {
            const updated = db.getAppointments().find((a) => a.id === modalAppointment.id);
            setModalAppointment(updated || null);
          }
        }}
      />
    </div>
  );
};
