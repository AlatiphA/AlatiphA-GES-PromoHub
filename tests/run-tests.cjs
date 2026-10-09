'use strict';
const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
const files=fs.readdirSync(__dirname).filter(name=>name.endsWith('.test.cjs')).sort().map(name=>path.join(__dirname,name));
if(!files.length){console.error('No unit test files found in '+__dirname);process.exit(1);}
const result=spawnSync(process.execPath,['--test',...files],{stdio:'inherit',shell:false});
if(result.error){console.error(result.error.message);process.exit(1);}
process.exit(result.status===null?1:result.status);
