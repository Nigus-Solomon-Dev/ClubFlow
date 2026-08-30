'use client';

import { useCallback, useEffect, useState } from 'react';
import AppShell from '@/components/AppShell';
import { Alert, Badge, Button, Card, EmptyState, Input } from '@/components/ui';
import { useAuth } from '@/context/AuthContext';
import { api } from '@/services/api';
import type { Employee } from '@/types';

const ROLE_ORDER = ['WAITER', 'BARMAN', 'CASHIER', 'MANAGER'] as const;

function EditableName({
  value,
  onSave,
}: {
  value: string;
  onSave: (name: string) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    try {
      await onSave(draft.trim() || value);
      setEditing(false);
    } catch {
      // the page shows the error
    } finally {
      setBusy(false);
    }
  }

  if (!editing) {
    return (
      <p className="font-semibold text-zinc-900">
        {value}{' '}
        <button
          title="Edit name"
          aria-label="Edit name"
          onClick={() => {
            setDraft(value);
            setEditing(true);
          }}
          className="ml-1 text-xs text-zinc-400 hover:text-zinc-700"
        >
          ✎
        </button>
      </p>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <Input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        className="flex-1"
      />
      <Button variant="secondary" className="px-3 py-1 text-xs" onClick={save} disabled={busy}>
        Save
      </Button>
      <Button variant="ghost" className="px-2 py-1 text-xs" onClick={() => setEditing(false)}>
        ✕
      </Button>
    </div>
  );
}

export default function EmployeesPage() {
  const { user } = useAuth();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newRole, setNewRole] = useState<Employee['role']>('WAITER');
  const [isRegistering, setIsRegistering] = useState(false);

  const reload = useCallback(() => {
    api
      .employees()
      .then(setEmployees)
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load'));
  }, []);

  useEffect(reload, [reload]);

  async function run<T>(fn: () => Promise<T>, msg: string) {
    setError(null);
    setNotice(null);
    try {
      await fn();
      setNotice(msg);
      reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed');
      setTimeout(() => setError(null), 3500);
    }
  }

  function nextRole(role: string): string {
    const i = ROLE_ORDER.findIndex((r) => r === role);
    if (i === -1) return 'WAITER';
    return ROLE_ORDER[(i + 1) % ROLE_ORDER.length] as string;
  }

  async function editName(id: string, name: string) {
    setError(null);
    try {
      await api.updateEmployee(id, { name: name.trim() });
      reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update name');
      setTimeout(() => setError(null), 3500);
      throw e;
    }
  }

  const tone = (role: string): 'blue' | 'amber' | 'neutral' =>
    role === 'MANAGER' ? 'blue' : role === 'CASHIER' || role === 'BARMAN' ? 'amber' : 'neutral';

  async function registerEmployee(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim() || !newPhone.trim()) return;
    
    setIsRegistering(true);
    setError(null);
    setNotice(null);
    try {
      await api.register({
        name: newName.trim(),
        phone: newPhone.trim(),
        password: newPassword,
        role: newRole,
      });
      setNotice('Employee registered successfully.');
      setNewName('');
      setNewPhone('');
      setNewPassword('');
      setNewRole('WAITER');
      reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed');
    } finally {
      setIsRegistering(false);
    }
  }

  return (
    <AppShell>
      <h1 className="mb-6 text-2xl font-bold text-zinc-900">Employees</h1>
      {error ? <div className="mb-4"><Alert>{error}</Alert></div> : null}
      {notice ? (
        <div className="mb-4 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
          {notice}
        </div>
      ) : null}

      <Card title="Add new employee" className="mb-6 max-w-xl">
        <form onSubmit={registerEmployee} className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-zinc-700">Name</label>
              <Input value={newName} onChange={(e) => setNewName(e.target.value)} required />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-zinc-700">Phone</label>
              <Input type="tel" value={newPhone} onChange={(e) => setNewPhone(e.target.value)} required />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-zinc-700">Password (optional)</label>
              <Input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="Default: 123456" />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-zinc-700">Role</label>
              <select
                className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
                value={newRole}
                onChange={(e) => setNewRole(e.target.value as Employee['role'])}
              >
                <option value="WAITER">Waiter</option>
                <option value="BARMAN">Barman</option>
                <option value="CASHIER">Cashier</option>
                <option value="MANAGER">Manager</option>
                {user?.role === 'OWNER' && <option value="OWNER">Owner</option>}
              </select>
            </div>
          </div>
          <Button type="submit" disabled={isRegistering}>
            {isRegistering ? 'Registering...' : 'Register Employee'}
          </Button>
        </form>
      </Card>

      {employees.length === 0 ? (
        <EmptyState>No employees yet.</EmptyState>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {employees.map((emp) => (
            <Card key={emp.id}>
<div className="flex items-center justify-between">
                <EditableName value={emp.name} onSave={(name) => editName(emp.id, name)} />
                <Badge tone="neutral">{emp.role}</Badge>
              </div>
              <p className="mt-1 text-sm text-zinc-500">{emp.phone}</p>
              <p className="mb-3 mt-1 text-xs">
                {emp.isActive ? <Badge tone="green">Active</Badge> : <Badge tone="red">Inactive</Badge>}
              </p>
              <div className="flex gap-2">
                <Button
                  variant="secondary"
                  className="flex-1 text-xs"
                  onClick={() =>
                    run(() => api.updateEmployee(emp.id, { role: nextRole(emp.role) as Employee['role'] }), 'Role updated')
                  }
                >
                  Role: {emp.role} → next
                </Button>
                <Button
                  variant={emp.isActive ? 'danger' : 'secondary'}
                  className="flex-1 text-xs"
                  onClick={() =>
                    run(
                      () => api.updateEmployee(emp.id, { isActive: !emp.isActive }),
                      emp.isActive ? 'Employee deactivated' : 'Employee activated',
                    )
                  }
                >
                  {emp.isActive ? 'Deactivate' : 'Activate'}
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </AppShell>
  );
}