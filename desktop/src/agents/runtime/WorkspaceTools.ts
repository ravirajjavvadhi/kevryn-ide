import * as fs from 'fs/promises';
import * as path from 'path';
import { createHash, randomUUID } from 'crypto';

const excluded = new Set(['node_modules', '.git', 'dist', 'build', '.next', '.cache', 'coverage', '.venv', '__pycache__']);
const secret = (name: string) => /^\.env($|\.)/i.test(name) && !/\.(example|sample|template)$/i.test(name) || /\.(pem|key|p12|pfx)$/i.test(name) || /^(credentials|id_rsa|id_ed25519)$/i.test(name);
export const version = (content: string | null) => content === null ? 'new' : createHash('sha256').update(content).digest('hex');
export interface Change { id: string; path: string; to?: string; before: string | null; after: string; added: number; removed: number; state: string; kind: string }
// Exact line LCS counts for bounded source files. Large files retain a truthful
// whole-file replacement count, explicitly labelled by the caller.
export function lineCounts(before: string | null, after: string) {
    const lines = (s: string) => s ? s.replace(/\r\n/g,'\n').replace(/\n$/,'').split('\n') : [];
    const a = lines(before || ''), b = lines(after);
    if (a.length * b.length > 4000000) return { added: b.length, removed: a.length, counting: 'whole-file replacement' };
    const row = new Uint32Array(b.length + 1);
    for (const left of a) { let prev = 0; for (let j=1;j<=b.length;j++) { const old=row[j]; row[j]=left===b[j-1]?prev+1:Math.max(row[j],row[j-1]);prev=old; } }
    return { added:b.length-row[b.length], removed:a.length-row[b.length], counting:'line diff' };
}
export class WorkspaceTools {
    constructor(readonly root: string) {}
    async resolve(relative: string, allowRoot=false) {
        if (typeof relative !== 'string' || !relative || path.isAbsolute(relative) || /[:\0]/.test(relative)) throw new Error('Use a workspace-relative path.');
        const target=path.resolve(this.root,relative), rel=path.relative(this.root,target);
        if (rel.startsWith('..'+path.sep) || rel==='..' || path.isAbsolute(rel) || (!allowRoot && !rel)) throw new Error('Path is outside the selected workspace.');
        if (rel.split(path.sep).some(part => secret(part) || part==='.git')) throw new Error('Secret files and Git internals are excluded from agent file tools.');
        // Reject junctions/symlinks along the entire path, including existing
        // parents of a new file. Lexical startsWith checks alone are insufficient.
        let current=this.root;
        for (const part of rel.split(path.sep).filter(Boolean)) {
            current=path.join(current,part);
            try { if ((await fs.lstat(current)).isSymbolicLink()) throw new Error('Symlink/junction paths are not available to agent file tools.'); }
            catch(e:any) { if(e.code!=='ENOENT') throw e; }
        }
        const canonical=await fs.realpath(this.root);
        if (path.resolve(canonical).toLowerCase()!==path.resolve(this.root).toLowerCase()) throw new Error('Open the canonical workspace directory before using the agent.');
        return target;
    }
    async list(directory='.', offset=0) {
        const base=await this.resolve(directory,true), files:string[]=[];
        let visited=0, limited=false;
        const walk=async(dir:string):Promise<void> => {
            if(++visited>10000 || files.length>=20000){limited=true;return;}
            const entries=(await fs.readdir(dir,{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name,undefined,{numeric:true}));
            for(const e of entries){
                if(e.isSymbolicLink() || excluded.has(e.name) || secret(e.name))continue;
                const full=path.join(dir,e.name);
                if(e.isDirectory())await walk(full);else if(e.isFile())files.push(path.relative(this.root,full).replace(/\\/g,'/'));
                if(limited)break;
            }
        };
        await walk(base);
        const start=Math.max(0,Number(offset)||0);
        return {files:files.slice(start,start+200),nextOffset:start+200<files.length?start+200:null,total:files.length,limited,excluded:[...excluded,'secret files','symlinks/junctions']};
    }
    async content(relative:string):Promise<string|null>{
        const target=await this.resolve(relative);
        try {
            const stat=await fs.stat(target);if(!stat.isFile()||stat.size>512*1024)throw new Error('Only text files up to 512 KB are supported.');
            const content=await fs.readFile(target,'utf8');if(content.includes('\0'))throw new Error('Binary files are not supported.');return content;
        }catch(e:any){if(e.code==='ENOENT')return null;throw e;}
    }
    async read(relative:string,start=1,end=200){
        const text=await this.content(relative);if(text===null)throw new Error('File not found.');
        const lines=text.split(/\r?\n/),first=Math.max(1,Number(start)||1),last=Math.min(lines.length,Number(end)||first+199,first+399);
        const content=lines.slice(first-1,last).map((line,i)=>`${first+i}: ${line}`).join('\n');
        return {path:relative,version:version(text),start:first,end:last,totalLines:lines.length,content:content.slice(0,24000),truncated:content.length>24000||last<lines.length};
    }
    async search(query:string,directory='.',offset=0){
        if(typeof query!=='string'||!query.trim()||query.length>500)throw new Error('Supply a short literal search query.');
        const results:any[]=[];let index=0;const needle=query.toLowerCase();let pages=0;
        do {
            const page=await this.list(directory,index);pages++;
            for(const file of page.files){
                if(file.toLowerCase().includes(needle))results.push({path:file,line:0,text:'Filename match'});
                try{const text=await this.content(file);text?.split(/\r?\n/).forEach((line,i)=>{if(results.length<offset+101 && line.toLowerCase().includes(needle))results.push({path:file,line:i+1,text:line.slice(0,300)});});}catch{/* unreadable/binary */}
                if(results.length>offset+100)break;
            }
            if(results.length>offset+100||page.nextOffset===null)break;index=page.nextOffset;
        }while(pages<10);
        return {matches:results.slice(offset,offset+100),truncated:results.length>offset+100||pages>=10,scope:directory};
    }
    async propose(relative:string,after:string,expected:string,kind='write',to?:string):Promise<Change>{
        if(typeof after!=='string'||Buffer.byteLength(after)>512*1024)throw new Error('Proposed file exceeds 512 KB.');
        const before=await this.content(relative);if(version(before)!==expected)throw new Error('File changed or was not read. Read it again before proposing changes.');
        if(to){await this.resolve(to);if(await this.content(to)!==null)throw new Error('Rename destination already exists.');}
        return {id:randomUUID(),path:relative,to,before,after,...lineCounts(before,after),state:'proposed',kind};
    }
    async apply(change:Change){
        const target=await this.resolve(change.path);
        if(version(await this.content(change.path))!==version(change.before))throw new Error('File changed after review. Request a fresh proposal.');
        if(change.to){
            const destination=await this.resolve(change.to);if(await this.content(change.to)!==null)throw new Error('Rename destination exists.');
            await fs.mkdir(path.dirname(destination),{recursive:true});await fs.rename(target,destination);
        }else{
            await fs.mkdir(path.dirname(target),{recursive:true});
            const temp=path.join(path.dirname(target),`.kevryn-${randomUUID()}.tmp`);
            try{await fs.writeFile(temp,change.after,{encoding:'utf8',flag:'wx'});await fs.rename(temp,target);}finally{await fs.unlink(temp).catch(()=>{});}
        }
        change.state='applied';return {path:change.to||change.path,version:version(change.after),...lineCounts(change.before,change.after)};
    }
    async undo(change:Change){
        if(change.state!=='applied')throw new Error('This change is not applied.');
        const currentPath=change.to||change.path;
        if(version(await this.content(currentPath))!==version(change.after))throw new Error('File has newer edits; undo would overwrite them.');
        if(change.to){if(await this.content(change.path)!==null)throw new Error('Original path is occupied.');await fs.rename(await this.resolve(change.to),await this.resolve(change.path));}
        else if(change.before===null)await fs.unlink(await this.resolve(change.path));
        else await this.apply(await this.propose(change.path,change.before,version(change.after)));
        change.state='undone';
    }
}
