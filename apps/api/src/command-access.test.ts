import { describe, expect, it } from 'vitest';
import { commandAllowed } from '../../web/src/lib/command-access.js';
describe('Command palette permissions',()=>{
  it('hides create commands from Viewers and unknown roles',()=>{for(const path of ['/tickets/new','/knowledge/new']){expect(commandAllowed('Viewer',path)).toBe(false);expect(commandAllowed('Technician',path)).toBe(true);}expect(commandAllowed(undefined,'/assets')).toBe(false);});
  it('permits read/search navigation for all authenticated roles',()=>{for(const role of ['Viewer','Technician','Admin'])for(const path of ['/assets','/assets?focus=search','/knowledge','/knowledge?focus=search'])expect(commandAllowed(role,path)).toBe(true);});
});
