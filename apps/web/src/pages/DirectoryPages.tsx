import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Archive, Building2, FolderTree, Pencil, Plus, Search, UserRound } from 'lucide-react';
import { useAuth } from '../components/Auth';
import { EmptyState, ErrorState, ListSkeleton } from '../components/Feedback';
import { ApiError, archiveCategory, archiveDepartment, archiveUser, createCategory, createDepartment, createUser, getCategories, getDepartments, getUsers, updateCategory, updateDepartment, updateUser } from '../lib/api';
import { translateUi } from '../i18n/I18nProvider';

type Kind = 'users' | 'departments' | 'categories';
function textValue(value: unknown, fallback = ''): string { return typeof value === 'string' ? value : fallback; }
function singular(kind: Kind): string { return kind === 'categories' ? 'category' : kind.slice(0, -1); }
const copy = {
  users: { title: 'Users', description: 'People, departments, and lifecycle status for the local service desk.', icon: UserRound },
  departments: { title: 'Departments', description: 'Organizational context used for routing and historical snapshots.', icon: Building2 },
  categories: { title: 'Categories', description: 'Flexible service classifications managed as data, not hardcoded enums.', icon: FolderTree },
};

export function UsersPage() { return <DirectoryPage kind="users" />; }
export function DepartmentsPage() { return <DirectoryPage kind="departments" />; }
export function CategoriesPage() { return <DirectoryPage kind="categories" />; }

function DirectoryPage({ kind }: { kind: Kind }) {
  const { session } = useAuth(); const queryClient = useQueryClient(); const [search, setSearch] = useState(''); const [editing, setEditing] = useState<Record<string, unknown> | null>(null); const [message, setMessage] = useState(''); const [error, setError] = useState('');
  const users = useQuery({ queryKey: ['users', search], queryFn: () => getUsers({ search, pageSize: 100 }), enabled: kind === 'users' });
  const departments = useQuery({ queryKey: ['departments', search], queryFn: () => getDepartments({ search, pageSize: 100 }), enabled: kind !== 'categories' });
  const categories = useQuery({ queryKey: ['categories', search], queryFn: () => getCategories({ search, pageSize: 100 }), enabled: kind === 'categories' });
  const active = kind === 'users' ? users : kind === 'departments' ? departments : categories;
  const data = active.data?.data ?? []; const meta = copy[kind]; const Icon = meta.icon; const canManage = session?.account.role === 'Admin';
  const mutation = useMutation({ mutationFn: async (work: () => Promise<unknown>) => work(), onSuccess: async () => { setEditing(null); setError(''); setMessage('Changes saved and recorded in the audit trail.'); await queryClient.invalidateQueries({ queryKey: [kind] }); } });
  async function archive(id: string) { if (!window.confirm(translateUi(`Archive this ${singular(kind)}? Historical references will be preserved.`))) return; await run(() => kind === 'users' ? archiveUser(id) : kind === 'departments' ? archiveDepartment(id) : archiveCategory(id)); }
  async function run(work: () => Promise<unknown>) { try { await mutation.mutateAsync(work); } catch (reason) { setError(reason instanceof ApiError ? reason.detail ?? reason.message : 'The change could not be saved.'); } }

  return <div className="page-stack"><header className="page-header"><div><span className="eyebrow eyebrow--accent">Service configuration</span><h1>{meta.title}</h1><p>{meta.description}</p></div>{canManage ? <button className="button button--primary" type="button" onClick={() => setEditing({})}><Plus size={15} />Add {singular(kind)}</button> : null}</header>
    {message ? <div className="toast toast--success" role="status">{message}<button type="button" onClick={() => setMessage('')}>×</button></div> : null}{error ? <div className="inline-alert" role="alert">{error}</div> : null}
    <section className="directory-toolbar"><label className="search-field"><Search size={16} /><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder={`Search ${kind}…`} aria-label={`Search ${kind}`} /></label><span>{data.length} visible</span></section>
    {editing ? <DirectoryEditor kind={kind} item={editing} departments={departments.data?.data ?? []} pending={mutation.isPending} onCancel={() => setEditing(null)} onSubmit={(payload) => run(() => { const id = typeof editing.id === 'string' ? editing.id : null; if (kind === 'users') return id ? updateUser(id, payload) : createUser(payload); if (kind === 'departments') return id ? updateDepartment(id, payload) : createDepartment(payload); return id ? updateCategory(id, payload) : createCategory(payload); })} /> : null}
    <section className="panel directory-panel"><header className="panel__header"><div><span className="section-kicker">Active records</span><h2>{meta.title} directory</h2></div></header>{active.isPending ? <ListSkeleton rows={6} /> : active.isError ? <ErrorState onRetry={() => void active.refetch()} /> : data.length ? <div className="directory-list">{data.map((raw) => { const item = raw as unknown as Record<string, unknown>; const id = textValue(item.id); const primary = kind === 'users' ? textValue(item.displayName, 'Unnamed user') : textValue(item.name, 'Unnamed record'); const secondary = kind === 'users' ? textValue(item.email, 'No email') : textValue(item.code, 'Managed record'); return <article key={id}><span className="directory-icon"><Icon size={17} /></span><div><strong>{kind === 'users' ? <Link to={`/users/${id}`}>{primary}</Link> : primary}</strong><span>{secondary}</span></div><span className="record-state">Active</span>{canManage ? <div className="row-actions"><button type="button" onClick={() => setEditing(item)} aria-label={`Edit ${primary}`}><Pencil size={14} />Edit</button><button type="button" onClick={() => void archive(id)} aria-label={`Archive ${primary}`}><Archive size={14} />Archive</button></div> : null}</article>; })}</div> : <EmptyState title={`No ${kind} match this search.`} description="Clear the search or create a new record if your role allows it." />}</section>
  </div>;
}

function DirectoryEditor({ kind, item, departments, pending, onCancel, onSubmit }: { kind: Kind; item: Record<string, unknown>; departments: Array<{ id: string; name: string }>; pending: boolean; onCancel: () => void; onSubmit: (payload: Record<string, unknown>) => Promise<void> }) {
  const edit = Boolean(item.id);
  function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const form = new FormData(event.currentTarget); const payload = kind === 'users' ? { displayName: form.get('displayName'), email: form.get('email') || null, departmentId: form.get('departmentId') } : kind === 'departments' ? { code: form.get('code'), name: form.get('name') } : { code: form.get('code'), name: form.get('name'), description: form.get('description') || null }; void onSubmit(payload); }
  return <form className="panel directory-editor" onSubmit={submit}><header className="panel__header"><div><span className="section-kicker">{edit ? 'Edit record' : 'New record'}</span><h2>{edit ? `Update ${singular(kind)}` : `Create ${singular(kind)}`}</h2></div></header><div className="form-grid">{kind === 'users' ? <><label className="field"><span>Display name</span><input name="displayName" required defaultValue={textValue(item.displayName)} /></label><label className="field"><span>Email</span><input name="email" type="email" defaultValue={textValue(item.email)} /></label><label className="field field--wide"><span>Department</span><select name="departmentId" required defaultValue={textValue(item.departmentId)}><option value="" disabled>Select department</option>{departments.map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}</select></label></> : <><label className="field"><span>Code</span><input name="code" required defaultValue={textValue(item.code)} /></label><label className="field"><span>Name</span><input name="name" required defaultValue={textValue(item.name)} /></label>{kind === 'categories' ? <label className="field field--wide"><span>Description</span><textarea name="description" rows={3} defaultValue={textValue(item.description)} /></label> : null}</>}</div><footer className="form-actions"><button className="button button--ghost" type="button" onClick={onCancel}>Cancel</button><button className="button button--primary" type="submit" disabled={pending}>{pending ? 'Saving…' : 'Save record'}</button></footer></form>;
}
