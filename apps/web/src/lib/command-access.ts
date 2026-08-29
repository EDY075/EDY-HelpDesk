export function commandAllowed(role: string | undefined, path: string): boolean {
  if (!role || !['Admin','Technician','Viewer'].includes(role)) return false;
  return role !== 'Viewer' || !['/tickets/new','/knowledge/new'].includes(path);
}
