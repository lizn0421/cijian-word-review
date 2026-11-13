const {test}=require('node:test');
const assert=require('node:assert/strict');
const C=require('../web/core');
const imported=cards=>cards.map(c=>({...c,imported:true}));
test('Translate language labels, auto-detection and untranslated technical terms',()=>{
 const p=C.parseImport('English,Chinese (Simplified),crux,症结\nCatalan,Chinese (Simplified),Bitwise operators,按位运算符\nDetect language,Chinese (Simplified),Episode,插曲\nEnglish,Chinese (Simplified),malloc,malloc\nChinese (Simplified),English,保持,retain');
 assert.equal(p.skipped,0);assert.deepEqual(p.cards.map(c=>[c.en,c.zh]),[['crux','症结'],['Bitwise operators','按位运算符'],['Episode','插曲'],['malloc','malloc'],['retain','保持']]);
});
test('CSV quoting, BOM, multiline, TSV and skipped row numbers',()=>{
 let p=C.parseImport('\uFEFF英文,中文,例句\r\n"a,b",词,"first\nsecond"\r\n,空白,\r\n');
 assert.equal(p.cards[0].en,'a,b');assert.equal(p.cards[0].example,'first\nsecond');assert.equal(p.skippedRows[0].row,3);
 assert.equal(C.parseImport('英文\t中文\nretain\t保持').cards[0].en,'retain');
 assert.throws(()=>C.parseImport('"unfinished'),/引号/);
});
test('Reimport preserves edited details and review progress',()=>{
 const a=C.createCard('retain','保持','personal example',false,1000); a.pinned=true;
 const learned=C.review(a,'again',2000);
 const result=C.mergeCards([learned],imported([C.createCard('RETAIN','保持','',false,3000)]));
 assert.equal(result.duplicate,1);assert.deepEqual(result.cards,[learned]);
 const backup=C.readBackup(JSON.stringify({...C.empty(),cards:result.cards}));
 assert.deepEqual(backup.cards,[learned]);
 assert.deepEqual(C.mergeCards([a],backup.cards).cards,[learned]);
});
test('Daily limit, due priority, four ratings and difficult cards',()=>{
 const now=new Date(2026,10,13,12).getTime();const cards=Array.from({length:8},(_,i)=>C.createCard('word'+i,'词'+i,'',false,now));
 assert.equal(C.summary({...C.empty(),cards},now).queue.length,5);
 for(const [i,r] of ['again','hard','good','easy'].entries())cards[i]=C.review(cards[i],r,now);
 assert.equal(cards[0].due-now,10*C.MINUTE);assert.equal(cards[1].due-now,30*C.MINUTE);assert.equal(cards[2].due-now,C.DAY);assert.equal(cards[3].due-now,4*C.DAY);
 assert.equal(C.summary({...C.empty(),cards},now).fresh,1);
 assert.equal(C.summary({...C.empty(),cards},now+31*C.MINUTE).queue[0].id,cards[0].id);
 assert.equal(C.difficult(cards[0]),true);
});
test('Common word case variants retain lowercase, meanings and learned progress',()=>{
 const upper=C.review(C.createCard('Reservoir','水库','example',false,1000),'good',2000);
 const lower=C.createCard('reservoir','水库','',false,3000);
 const merged=C.mergeCards([upper],imported([lower]));
 assert.equal(merged.cards.length,1);assert.equal(merged.cards[0].en,'reservoir');assert.equal(merged.cards[0].reviews,1);assert.equal(merged.cards[0].example,'example');
 const meanings=C.mergeCards([],imported([C.createCard('Stealth','隐形'),C.createCard('stealth','隐身')]));
 assert.deepEqual(meanings.cards.map(c=>c.en),['stealth','stealth']);assert.equal(meanings.cards.length,2);
 const names=C.mergeCards([],imported([C.createCard('Android','安卓'),C.createCard('android','安卓'),C.createCard('API','接口'),C.createCard('api','接口')]));
 assert.deepEqual(names.cards.map(c=>c.en),['Android','API']);
});
