import {eq,sql} from 'drizzle-orm';
import type {createDatabase} from './client.js';
import {financeBusinessScopes} from './schema.js';
export async function financeRevision(db:ReturnType<typeof createDatabase>,owner:string){const [row]=await db.select().from(financeBusinessScopes).where(eq(financeBusinessScopes.ownerId,owner));return row?.revision??0;}
// All finance writes share this CAS, including commands that prepared a snapshot
// before another transaction acquired its lock. A stale writer cannot resurrect data.
export function acquireFinanceScope(owner:string,expected:number){return sql`acquired as (
 insert into finance_business_scopes(owner_id,revision) select id,1 from actor
 on conflict(owner_id) do update set revision=finance_business_scopes.revision+1 where finance_business_scopes.revision=${expected}
 returning owner_id
)`;}
