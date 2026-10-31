import {
  FaTasks, FaPlus, FaTrash, FaEdit, FaCheck, FaBell, FaCog,
  FaExclamationTriangle, FaCalendar, FaTruck, FaUser, FaTimes,
  FaToggleOn, FaToggleOff, FaRegCircle, FaCheckCircle
} from 'react-icons/fa';
import { useState, useEffect, useCallback } from 'react';
import api from '../../api/client';
import { Spinner, PageHeader, Modal, formatDate, ConfirmModal } from '../../components/ui';
import toast from 'react-hot-toast';

const PRIORITY_COLORS = {
  urgent: { color: '#EF4444', bg: 'rgba(239,68,68,0.12)', label: 'URGENT' },
  high: { color: '#F97316', bg: 'rgba(249,115,22,0.12)', label: 'HIGH' },
  medium: { color: '#F59E0B', bg: 'rgba(245,158,11,0.12)', label: 'MEDIUM' },
  low: { color: '#64748B', bg: 'rgba(100,116,139,0.12)', label: 'LOW' },
};

const CATEGORY_ICONS = {
  settlement: '💰',
  report: '📋',
  compliance: '📄',
  fuel: '⛽',
  maintenance: '🔧',
  general: '📝',
  other: '📌',
};

const CATEGORIES = ['general', 'settlement', 'report', 'compliance', 'fuel', 'maintenance', 'other'];
const PRIORITIES = ['low', 'medium', 'high', 'urgent'];

function TodoItem({ todo, onToggle, onEdit, onDelete }) {
  const prio = PRIORITY_COLORS[todo.priority] || PRIORITY_COLORS.medium;
  const isOverdue = todo.due_date && !todo.is_completed && new Date(todo.due_date + 'T23:59:00') < new Date();
  const isDueToday = todo.due_date && new Date(todo.due_date + 'T12:00:00').toDateString() === new Date().toDateString();

  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', gap: 14,
      padding: '14px 16px', borderRadius: 10,
      background: todo.is_completed ? 'rgba(255,255,255,0.02)' : 'var(--bg-card)',
      border: `1px solid ${isOverdue ? 'rgba(239,68,68,0.35)' : todo.is_completed ? 'var(--border-subtle)' : 'var(--border-color)'}`,
      marginBottom: 8, opacity: todo.is_completed ? 0.6 : 1,
      transition: 'all 0.2s',
    }}>
      <button
        onClick={() => onToggle(todo)}
        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px', marginTop: 2, color: todo.is_completed ? 'var(--success)' : 'var(--text-muted)', fontSize: 18 }}
      >
        {todo.is_completed ? <FaCheckCircle /> : <FaRegCircle />}
      </button>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
          <span style={{ fontSize: 15, fontWeight: todo.is_completed ? 400 : 600, textDecoration: todo.is_completed ? 'line-through' : 'none', color: todo.is_completed ? 'var(--text-muted)' : 'var(--text-primary)' }}>
            {CATEGORY_ICONS[todo.category] || '📝'} {todo.title}
          </span>
          <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 20, fontWeight: 700, background: prio.bg, color: prio.color }}>
            {prio.label}
          </span>
          {isOverdue && <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 20, fontWeight: 700, background: 'rgba(239,68,68,0.15)', color: '#EF4444' }}>OVERDUE</span>}
          {isDueToday && !isOverdue && <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 20, fontWeight: 700, background: 'rgba(245,158,11,0.15)', color: '#F59E0B' }}>DUE TODAY</span>}
        </div>
        {todo.description && (
          <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 6 }}>{todo.description}</div>
        )}
        <div style={{ display: 'flex', gap: 12, fontSize: 12, color: 'var(--text-muted)', flexWrap: 'wrap' }}>
          {todo.due_date && (
            <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: isOverdue ? 'var(--danger)' : isDueToday ? 'var(--warning)' : 'var(--text-muted)' }}>
              <FaCalendar style={{ fontSize: 10 }} />
              {new Date(todo.due_date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
              {todo.due_time && ` @ ${todo.due_time}`}
            </span>
          )}
          {todo.truck_unit && <span><FaTruck style={{ fontSize: 10 }} /> {todo.truck_unit}</span>}
          {todo.driver_first && <span><FaUser style={{ fontSize: 10 }} /> {todo.driver_first} {todo.driver_last}</span>}
          {todo.is_recurring && <span>🔄 {todo.recurrence}</span>}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
        <button onClick={() => onEdit(todo)} className="btn btn-secondary btn-sm" title="Edit"><FaEdit /></button>
        <button onClick={() => onDelete(todo.id)} className="btn btn-danger btn-sm" title="Delete"><FaTrash /></button>
      </div>
    </div>
  );
}

function TodoForm({ onSaved, onClose, editingTodo, trucks, drivers }) {
  const [form, setForm] = useState({
    title: editingTodo?.title || '',
    description: editingTodo?.description || '',
    due_date: editingTodo?.due_date?.slice(0, 10) || '',
    due_time: editingTodo?.due_time || '',
    priority: editingTodo?.priority || 'medium',
    category: editingTodo?.category || 'general',
    is_recurring: editingTodo?.is_recurring || false,
    recurrence: editingTodo?.recurrence || 'weekly',
    related_truck_id: editingTodo?.related_truck_id || '',
    related_driver_id: editingTodo?.related_driver_id || '',
  });
  const [saving, setSaving] = useState(false);
  const f = k => e => setForm(p => ({ ...p, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));

  const handleSave = async () => {
    if (!form.title) { toast.error('Title required'); return; }
    setSaving(true);
    try {
      if (editingTodo) {
        await api.put(`/todos/${editingTodo.id}`, form);
        toast.success('Task updated');
      } else {
        await api.post('/todos', form);
        toast.success('Task added');
      }
      onSaved();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <div className="form-group">
        <label className="form-label">Title *</label>
        <input className="form-input" value={form.title} onChange={f('title')} placeholder="Task title..." />
      </div>
      <div className="form-group">
        <label className="form-label">Description</label>
        <textarea className="form-input" rows={2} value={form.description} onChange={f('description')} placeholder="Additional details..." />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
        <div className="form-group">
          <label className="form-label">Due Date</label>
          <input type="date" className="form-input" value={form.due_date} onChange={f('due_date')} />
        </div>
        <div className="form-group">
          <label className="form-label">Due Time</label>
          <input type="time" className="form-input" value={form.due_time} onChange={f('due_time')} />
        </div>
        <div className="form-group">
          <label className="form-label">Priority</label>
          <select className="form-input" value={form.priority} onChange={f('priority')}>
            {PRIORITIES.map(p => <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>)}
          </select>
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div className="form-group">
          <label className="form-label">Category</label>
          <select className="form-input" value={form.category} onChange={f('category')}>
            {CATEGORIES.map(c => <option key={c} value={c}>{CATEGORY_ICONS[c]} {c.charAt(0).toUpperCase() + c.slice(1)}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label className="form-label">Related Truck</label>
          <select className="form-input" value={form.related_truck_id} onChange={f('related_truck_id')}>
            <option value="">None</option>
            {trucks.map(t => <option key={t.id} value={t.id}>{t.unit_number}</option>)}
          </select>
        </div>
      </div>
      <div className="form-group">
        <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
          <input type="checkbox" checked={form.is_recurring} onChange={f('is_recurring')} style={{ width: 16, height: 16 }} />
          <span className="form-label" style={{ margin: 0 }}>Recurring task</span>
        </label>
      </div>
      {form.is_recurring && (
        <div className="form-group">
          <label className="form-label">Repeat</label>
          <select className="form-input" value={form.recurrence} onChange={f('recurrence')}>
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
          </select>
        </div>
      )}
      <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end', marginTop: 8 }}>
        <button onClick={onClose} className="btn btn-secondary">Cancel</button>
        <button onClick={handleSave} disabled={saving} className="btn btn-primary">
          {saving ? 'Saving...' : editingTodo ? 'Update Task' : 'Add Task'}
        </button>
      </div>
    </div>
  );
}

function RemindersPanel({ onClose }) {
  const [reminders, setReminders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newLabel, setNewLabel] = useState('');
  const [newType, setNewType] = useState('');
  const [newDays, setNewDays] = useState(1);
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    api.get('/todos/reminders').then(r => { setReminders(r.data); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  const toggle = async (r) => {
    try {
      const res = await api.put(`/todos/reminders/${r.id}`, { ...r, is_enabled: !r.is_enabled });
      setReminders(prev => prev.map(x => x.id === r.id ? res.data : x));
    } catch {
      toast.error('Update failed');
    }
  };

  const updateDays = async (r, days) => {
    try {
      const res = await api.put(`/todos/reminders/${r.id}`, { ...r, days_before: parseInt(days) });
      setReminders(prev => prev.map(x => x.id === r.id ? res.data : x));
    } catch {
      toast.error('Update failed');
    }
  };

  const addReminder = async () => {
    if (!newLabel || !newType) { toast.error('Label and type required'); return; }
    setAdding(true);
    try {
      const res = await api.post('/todos/reminders', { label: newLabel, reminder_type: newType, days_before: newDays });
      setReminders(prev => [...prev, res.data]);
      setNewLabel(''); setNewType(''); setNewDays(1);
      toast.success('Reminder added');
    } catch {
      toast.error('Failed to add');
    } finally {
      setAdding(false);
    }
  };

  const deleteReminder = async (id) => {
    try {
      await api.delete(`/todos/reminders/${id}`);
      setReminders(prev => prev.filter(r => r.id !== id));
      toast.success('Removed');
    } catch {
      toast.error('Failed to remove');
    }
  };

  return (
    <div>
      {loading ? <Spinner /> : (
        <>
          <div style={{ marginBottom: 20 }}>
            {reminders.map(r => (
              <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: '1px solid var(--border-subtle)' }}>
                <button onClick={() => toggle(r)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 22, color: r.is_enabled ? 'var(--success)' : 'var(--text-muted)' }}>
                  {r.is_enabled ? <FaToggleOn /> : <FaToggleOff />}
                </button>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: r.is_enabled ? 'var(--text-primary)' : 'var(--text-muted)' }}>{r.label}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{r.reminder_type}</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Alert</span>
                  <input
                    type="number" min={0} max={90} value={r.days_before}
                    onChange={e => updateDays(r, e.target.value)}
                    style={{ width: 50, padding: '4px 8px', background: 'var(--border-subtle)', border: '1px solid var(--border-color)', borderRadius: 6, color: 'var(--text-primary)', fontSize: 13, textAlign: 'center' }}
                  />
                  <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>days before</span>
                  <button onClick={() => deleteReminder(r.id)} className="btn btn-danger btn-sm"><FaTrash /></button>
                </div>
              </div>
            ))}
          </div>

          {/* Add new reminder */}
          <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 10, padding: 16, border: '1px solid var(--border-color)' }}>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 12 }}>Add Custom Reminder</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 10 }}>
              <input placeholder="Label (e.g. 'IFTA Filing')" value={newLabel} onChange={e => setNewLabel(e.target.value)} className="form-input" style={{ fontSize: 13 }} />
              <input placeholder="Type key (e.g. 'ifta_filing')" value={newType} onChange={e => setNewType(e.target.value)} className="form-input" style={{ fontSize: 13 }} />
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input type="number" min={0} max={90} value={newDays} onChange={e => setNewDays(e.target.value)}
                  placeholder="Days" className="form-input" style={{ width: 70, fontSize: 13 }} />
                <button onClick={addReminder} disabled={adding} className="btn btn-primary" style={{ whiteSpace: 'nowrap' }}>
                  <FaPlus /> Add
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default function TodoList() {
  const [todos, setTodos] = useState([]);
  const [upcoming, setUpcoming] = useState([]);
  const [trucks, setTrucks] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingTodo, setEditingTodo] = useState(null);
  const [showReminders, setShowReminders] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [filterCat, setFilterCat] = useState('');
  const [filterDone, setFilterDone] = useState('false');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (filterCat) params.category = filterCat;
      if (filterDone !== '') params.is_completed = filterDone;

      const [tRes, uRes, trRes, dRes] = await Promise.all([
        api.get('/todos', { params }),
        api.get('/todos/upcoming'),
        api.get('/trucks'),
        api.get('/drivers', { params: { active: true } }),
      ]);
      setTodos(tRes.data);
      setUpcoming(uRes.data);
      setTrucks(trRes.data);
      setDrivers(dRes.data);
    } finally {
      setLoading(false);
    }
  }, [filterCat, filterDone]);

  useEffect(() => { load(); }, [load]);

  const handleToggle = async (todo) => {
    try {
      await api.patch(`/todos/${todo.id}/complete`, { is_completed: !todo.is_completed });
      load();
    } catch {
      toast.error('Failed to update');
    }
  };

  const handleDelete = async (id) => {
    try {
      await api.delete(`/todos/${id}`);
      toast.success('Task deleted');
      load();
    } catch {
      toast.error('Delete failed');
    }
  };

  const urgentTodos = todos.filter(t => !t.is_completed && (t.priority === 'urgent' || t.priority === 'high'));
  const normalTodos = todos.filter(t => !t.is_completed && t.priority !== 'urgent' && t.priority !== 'high');
  const doneTodos = todos.filter(t => t.is_completed);

  return (
    <div>
      <PageHeader
        title="To-Do & Reminders"
        subtitle="Daily tasks, upcoming work reminders, and alerts"
        action={
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={() => setShowReminders(true)} className="btn btn-secondary" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <FaBell /> Reminders
            </button>
            <button onClick={() => { setShowForm(true); setEditingTodo(null); }} className="btn btn-primary" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <FaPlus /> Add Task
            </button>
          </div>
        }
      />

      {/* Upcoming Alert */}
      {upcoming.length > 0 && (
        <div style={{
          background: 'rgba(249,115,22,0.1)', border: '1px solid rgba(249,115,22,0.3)',
          borderRadius: 12, padding: 16, marginBottom: 20, display: 'flex', gap: 12, alignItems: 'flex-start',
        }}>
          <FaBell style={{ color: 'var(--brand-orange)', fontSize: 18, marginTop: 2, flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, color: 'var(--brand-orange)', marginBottom: 6 }}>
              {upcoming.length} task{upcoming.length > 1 ? 's' : ''} due within 3 days
            </div>
            {upcoming.slice(0, 3).map(t => (
              <div key={t.id} style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 2 }}>
                • {CATEGORY_ICONS[t.category]} {t.title}
                {t.due_date && <span style={{ color: 'var(--text-muted)', marginLeft: 8 }}>
                  — {new Date(t.due_date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                </span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Filters */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
        <select className="form-input" style={{ maxWidth: 150 }} value={filterCat} onChange={e => setFilterCat(e.target.value)}>
          <option value="">All Categories</option>
          {CATEGORIES.map(c => <option key={c} value={c}>{CATEGORY_ICONS[c]} {c.charAt(0).toUpperCase() + c.slice(1)}</option>)}
        </select>
        <div style={{ display: 'flex', gap: 8 }}>
          {[['false', 'Active'], ['true', 'Completed'], ['', 'All']].map(([val, lbl]) => (
            <button key={val} onClick={() => setFilterDone(val)} className={`btn ${filterDone === val ? 'btn-primary' : 'btn-secondary'}`} style={{ padding: '6px 14px', fontSize: 13 }}>
              {lbl}
            </button>
          ))}
        </div>
      </div>

      {loading ? <Spinner /> : (
        <div>
          {/* High/Urgent */}
          {urgentTodos.length > 0 && (
            <div style={{ marginBottom: 24 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--danger)', letterSpacing: 1, marginBottom: 10 }}>
                🔥 HIGH PRIORITY ({urgentTodos.length})
              </div>
              {urgentTodos.map(t => (
                <TodoItem key={t.id} todo={t} onToggle={handleToggle}
                  onEdit={(todo) => { setEditingTodo(todo); setShowForm(true); }}
                  onDelete={(id) => setDeleteTarget(id)} />
              ))}
            </div>
          )}

          {/* Normal */}
          {normalTodos.length > 0 && (
            <div style={{ marginBottom: 24 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: 1, marginBottom: 10 }}>
                TASKS ({normalTodos.length})
              </div>
              {normalTodos.map(t => (
                <TodoItem key={t.id} todo={t} onToggle={handleToggle}
                  onEdit={(todo) => { setEditingTodo(todo); setShowForm(true); }}
                  onDelete={(id) => setDeleteTarget(id)} />
              ))}
            </div>
          )}

          {/* Completed */}
          {doneTodos.length > 0 && (
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: 1, marginBottom: 10 }}>
                COMPLETED ({doneTodos.length})
              </div>
              {doneTodos.map(t => (
                <TodoItem key={t.id} todo={t} onToggle={handleToggle}
                  onEdit={(todo) => { setEditingTodo(todo); setShowForm(true); }}
                  onDelete={(id) => setDeleteTarget(id)} />
              ))}
            </div>
          )}

          {todos.length === 0 && (
            <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text-muted)' }}>
              <div style={{ fontSize: 48, marginBottom: 12 }}>✅</div>
              <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 6 }}>All clear!</div>
              <div style={{ fontSize: 14 }}>No tasks found. Add one to get started.</div>
            </div>
          )}
        </div>
      )}

      {/* Add/Edit Modal */}
      <Modal
        open={showForm}
        onClose={() => { setShowForm(false); setEditingTodo(null); }}
        title={editingTodo ? 'Edit Task' : 'Add New Task'}
        size="lg"
      >
        <TodoForm
          trucks={trucks}
          drivers={drivers}
          editingTodo={editingTodo}
          onSaved={() => { setShowForm(false); setEditingTodo(null); load(); }}
          onClose={() => { setShowForm(false); setEditingTodo(null); }}
        />
      </Modal>

      {/* Reminders Modal */}
      <Modal open={showReminders} onClose={() => setShowReminders(false)} title="Reminder Settings" size="lg">
        <RemindersPanel onClose={() => setShowReminders(false)} />
      </Modal>

      <ConfirmModal
        open={!!deleteTarget}
        title="Delete Task"
        message="Are you sure you want to delete this task?"
        onConfirm={() => { handleDelete(deleteTarget); setDeleteTarget(null); }}
        onCancel={() => setDeleteTarget(null)}
        danger
      />
    </div>
  );
}
